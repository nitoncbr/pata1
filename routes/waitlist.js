const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const rateLimit = require('express-rate-limit');
const { getPublicSiteUrl } = require('../config/site');
const {
  isDisposable,
  getClientIp,
  normalizeEmailForDedup,
  shouldBlockReferralCredit,
  isMissingSignupIpColumn,
} = require('./waitlist.utils');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
);

const signupWindowMs = Number(process.env.WAITLIST_SIGNUP_WINDOW_MS) || 15 * 60 * 1000;
const signupMax = Number(process.env.WAITLIST_SIGNUP_MAX) || 5;
const readWindowMs = Number(process.env.WAITLIST_READ_WINDOW_MS) || 60 * 1000;
const readMax = Number(process.env.WAITLIST_READ_MAX) || 120;

// POST: strict (anti-spam)
const signupLimiter = rateLimit({
  windowMs: signupWindowMs,
  max: signupMax,
  message: { message: 'Too many requests. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// GET count / position: lighter cap (anti-scrape), per IP
const readLimiter = rateLimit({
  windowMs: readWindowMs,
  max: readMax,
  message: { message: 'Too many requests. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Generate unique 6-char referral code
function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

async function getUniqueCode() {
  let code;
  let exists;
  do {
    code = generateCode();
    const { data } = await supabase
      .from('waitlist')
      .select('id')
      .eq('referral_code', code)
      .single();
    exists = !!data;
  } while (exists);
  return code;
}

// Send welcome email via Resend
async function sendWelcomeEmail(email, position, code) {
  // Basic debug logging to verify this path runs
  // eslint-disable-next-line no-console
  console.log('Sending welcome email to:', email);

  if (!process.env.RESEND_API_KEY) {
    // eslint-disable-next-line no-console
    console.log('NO RESEND KEY FOUND');
    return;
  }
  const site = getPublicSiteUrl();
  const link = `${site}/waitlist?ref=${code}`;
  const unsub = `${site}/unsubscribe?email=${encodeURIComponent(email)}`;
  // eslint-disable-next-line global-require
  const { Resend } = require('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);

  const sent = await resend.emails.send({
    from: 'PATA <hello@pataqr.com>',
    to: email,
    subject: `You're #${position} on the PATA waitlist`,
    html: `
      <div style="background:#09090C;color:#F0EDE6;font-family:sans-serif;
                  max-width:480px;margin:0 auto;padding:40px 32px;border-radius:16px;">
        <h1 style="font-size:32px;font-weight:800;margin-bottom:8px;color:#F0EDE6;">
          You're <span style="color:#C9973A;">in.</span>
        </h1>
        <p style="color:rgba(240,237,230,0.6);font-size:14px;margin-bottom:24px;">
          You are #${position} on the PATA waitlist.
        </p>
        <p style="color:rgba(240,237,230,0.6);font-size:14px;margin-bottom:24px;">
          Share your link to move up. Every signup moves you up 5 spots.
          Top 1,000 get a Car QR Sticker + Smart Key Tag free at launch.
        </p>
        <a href="${link}"
           style="display:block;background:#C9973A;color:#09090C;
                  text-decoration:none;padding:14px 24px;border-radius:999px;
                  font-weight:700;font-size:14px;text-align:center;margin-bottom:16px;">
          Share my link
        </a>
        <p style="color:rgba(240,237,230,0.3);font-size:11px;">
          Or copy: ${link}
        </p>
        <hr style="border:none;border-top:1px solid rgba(255,255,255,0.08);margin:28px 0;"/>
        <p style="color:rgba(240,237,230,0.25);font-size:11px;">
          P·A·T·A · ${site.replace(/^https?:\/\//, '')} ·
          <a href="${unsub}"
             style="color:rgba(240,237,230,0.25);">Unsubscribe</a>
        </p>
      </div>
    `,
  });

  // Resend SDK returns { data: { id }, error } — not { id } on the root object
  if (sent.error) {
    // eslint-disable-next-line no-console
    console.error('Resend error:', sent.error);
  } else {
    const id = sent.data && sent.data.id ? sent.data.id : '(no id in response)';
    // eslint-disable-next-line no-console
    console.log('Resend accepted email id:', id);
  }
}

// POST /api/waitlist — join waitlist
router.post('/', signupLimiter, async (req, res) => {
  const { email, referred_by, source } = req.body || {};

  if (!email || !email.includes('@')) {
    return res.status(400).json({ message: 'Valid email required.' });
  }

  const normalizedEmail = normalizeEmailForDedup(email);

  // Block disposable emails
  if (isDisposable(normalizedEmail)) {
    return res.status(400).json({
      message: 'Temporary emails are not accepted. Please use your real email.',
    });
  }

  // Check duplicate
  const { data: existing } = await supabase
    .from('waitlist')
    .select('position, referral_code')
    .eq('email', normalizedEmail)
    .single();

  if (existing) {
    return res.status(409).json({
      message: 'Already on the list.',
      position: existing.position,
      referral_code: existing.referral_code,
    });
  }

  const clientIp = getClientIp(req);

  // Get next position
  const { data: maxData } = await supabase
    .from('waitlist')
    .select('position')
    .order('position', { ascending: false })
    .limit(1)
    .single();

  const newPosition = maxData && typeof maxData.position === 'number'
    ? maxData.position + 1
    : 1;
  const referralCode = await getUniqueCode();

  const refCodeUpper = referred_by
    ? String(referred_by).toUpperCase().replace(/[^A-Z0-9]/g, '')
    : null;

  let referredByToStore = refCodeUpper;
  let referralBlocked = false;

  if (refCodeUpper) {
    const { data: referrer } = await supabase
      .from('waitlist')
      .select('id, position, referral_count, signup_ip')
      .eq('referral_code', refCodeUpper)
      .single();

    if (!referrer) {
      referredByToStore = null;
    } else if (shouldBlockReferralCredit(referrer, clientIp)) {
      referredByToStore = null;
      referralBlocked = true;
      // eslint-disable-next-line no-console
      console.log('Waitlist: referral credit blocked (same IP as referrer).');
    }
  }

  const insertRow = {
    email: normalizedEmail,
    position: newPosition,
    referral_code: referralCode,
    referred_by: referredByToStore,
    source: source || 'waitlist',
    signup_ip: clientIp || null,
  };

  // Insert new user
  let { data: newUser, error } = await supabase
    .from('waitlist')
    .insert(insertRow)
    .select()
    .single();

  // Column signup_ip may not exist until migration is applied — retry without it
  if (error && isMissingSignupIpColumn(error)) {
    delete insertRow.signup_ip;
    const retry = await supabase
      .from('waitlist')
      .insert(insertRow)
      .select()
      .single();
    newUser = retry.data;
    error = retry.error;
    // eslint-disable-next-line no-console
    if (!error) console.warn('Waitlist: add signup_ip column (see sql/waitlist_signup_ip.sql) for self-referral protection.');
  }

  if (error || !newUser) {
    // eslint-disable-next-line no-console
    console.error('Supabase insert error:', error);
    return res.status(500).json({ message: 'Something went wrong. Try again.' });
  }

  // Move referrer up 5 spots (only when referral credit is valid)
  if (refCodeUpper && referredByToStore && !referralBlocked) {
    const { data: referrer } = await supabase
      .from('waitlist')
      .select('id, position, referral_count')
      .eq('referral_code', refCodeUpper)
      .single();

    if (referrer) {
      await supabase
        .from('waitlist')
        .update({
          position: Math.max(1, (referrer.position || 1) - 5),
          referral_count: (referrer.referral_count || 0) + 1,
        })
        .eq('id', referrer.id);
    }
  }

  // Send welcome email (non-blocking)
  sendWelcomeEmail(normalizedEmail, newPosition, referralCode).catch((err) =>
    // eslint-disable-next-line no-console
    console.error('Email error:', err),
  );

  return res.status(200).json({
    message: 'success',
    position: newPosition,
    referral_code: referralCode,
    referral_blocked: referralBlocked,
  });
});

// GET /api/waitlist/count — live count
router.get('/count', readLimiter, async (req, res) => {
  const { count, error } = await supabase
    .from('waitlist')
    .select('*', { count: 'exact', head: true });

  if (error) {
    return res.status(500).json({ count: 0 });
  }
  return res.json({ count });
});

// GET /api/waitlist/position?ref=CODE
router.get('/position', readLimiter, async (req, res) => {
  const { ref } = req.query || {};
  if (!ref) return res.status(400).json({ message: 'No ref code.' });

  const { data, error } = await supabase
    .from('waitlist')
    .select('position, referral_code')
    .eq('referral_code', String(ref).toUpperCase())
    .single();

  if (error && error.code !== 'PGRST116') {
    return res.status(500).json({ message: 'Internal error.' });
  }

  if (!data) return res.status(404).json({ message: 'Not found.' });

  return res.json({
    position: data.position,
    referral_code: data.referral_code,
  });
});

module.exports = router;


