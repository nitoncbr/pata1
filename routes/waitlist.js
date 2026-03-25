const crypto = require('crypto');
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

const VERIFY_EXPIRY_MS = 48 * 60 * 60 * 1000;

const signupLimiter = rateLimit({
  windowMs: signupWindowMs,
  max: signupMax,
  message: { message: 'Too many requests. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const readLimiter = rateLimit({
  windowMs: readWindowMs,
  max: readMax,
  message: { message: 'Too many requests. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

function hashToken(token) {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

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

async function sendWelcomeEmail(email, position, code) {
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

  if (sent.error) {
    // eslint-disable-next-line no-console
    console.error('Resend error:', sent.error);
  } else {
    const id = sent.data && sent.data.id ? sent.data.id : '(no id in response)';
    // eslint-disable-next-line no-console
    console.log('Resend accepted email id:', id);
  }
}

async function sendVerificationEmail(email, plainToken) {
  if (!process.env.RESEND_API_KEY) {
    // eslint-disable-next-line no-console
    console.warn('RESEND_API_KEY missing; cannot send verification email.');
    return;
  }
  const site = getPublicSiteUrl();
  const verifyUrl = `${site}/api/waitlist/verify?token=${encodeURIComponent(plainToken)}`;
  // eslint-disable-next-line global-require
  const { Resend } = require('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);

  const sent = await resend.emails.send({
    from: 'PATA <hello@pataqr.com>',
    to: email,
    subject: 'Confirm your email to join the PATA waitlist',
    html: `
      <div style="background:#09090C;color:#F0EDE6;font-family:sans-serif;
                  max-width:480px;margin:0 auto;padding:40px 32px;border-radius:16px;">
        <h1 style="font-size:28px;font-weight:800;margin-bottom:12px;color:#F0EDE6;">
          Confirm your email
        </h1>
        <p style="color:rgba(240,237,230,0.6);font-size:14px;margin-bottom:24px;">
          Click the button below to confirm your address and join the waitlist.
          If you didn’t request this, you can ignore this email.
        </p>
        <a href="${verifyUrl}"
           style="display:block;background:#C9973A;color:#09090C;
                  text-decoration:none;padding:14px 24px;border-radius:999px;
                  font-weight:700;font-size:14px;text-align:center;margin-bottom:16px;">
          Confirm my email
        </a>
        <p style="color:rgba(240,237,230,0.35);font-size:12px;word-break:break-all;">
          Or copy this link: ${verifyUrl}
        </p>
        <p style="color:rgba(240,237,230,0.25);font-size:11px;margin-top:24px;">
          Link expires in 48 hours.
        </p>
      </div>
    `,
  });

  if (sent.error) {
    // eslint-disable-next-line no-console
    console.error('Resend verification error:', sent.error);
  }
}

/**
 * Create verified waitlist row, referral credits, welcome email.
 */
async function finalizeWaitlistSignup({
  normalizedEmail,
  referredBy,
  source,
  clientIp,
}) {
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

  const refCodeUpper = referredBy
    ? String(referredBy).toUpperCase().replace(/[^A-Z0-9]/g, '')
    : null;

  let referredByToStore = refCodeUpper;
  let referralBlocked = false;

  if (refCodeUpper) {
    const { data: referrer } = await supabase
      .from('waitlist')
      .select('id, position, referral_count, signup_ip')
      .eq('referral_code', refCodeUpper)
      .maybeSingle();

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

  let { data: newUser, error } = await supabase
    .from('waitlist')
    .insert(insertRow)
    .select()
    .single();

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
    throw new Error('INSERT_FAILED');
  }

  if (refCodeUpper && referredByToStore && !referralBlocked) {
    const { data: referrer } = await supabase
      .from('waitlist')
      .select('id, position, referral_count')
      .eq('referral_code', refCodeUpper)
      .maybeSingle();

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

  sendWelcomeEmail(normalizedEmail, newPosition, referralCode).catch((err) =>
    // eslint-disable-next-line no-console
    console.error('Email error:', err),
  );

  return {
    position: newPosition,
    referral_code: referralCode,
    referral_blocked: referralBlocked,
  };
}

function isMissingPendingTable(err) {
  if (!err) return false;
  const blob = `${err.message || ''} ${err.details || ''}`;
  return /waitlist_pending|relation.*does not exist/i.test(blob);
}

// POST /api/waitlist — request verification (email not stored in main waitlist until verified)
router.post('/', signupLimiter, async (req, res) => {
  const { email, referred_by, source } = req.body || {};

  if (!email || !email.includes('@')) {
    return res.status(400).json({ message: 'Valid email required.' });
  }

  const normalizedEmail = normalizeEmailForDedup(email);

  if (isDisposable(normalizedEmail)) {
    return res.status(400).json({
      message: 'Temporary emails are not accepted. Please use your real email.',
    });
  }

  const { data: existing } = await supabase
    .from('waitlist')
    .select('position, referral_code')
    .eq('email', normalizedEmail)
    .maybeSingle();

  if (existing) {
    return res.status(409).json({
      message: 'Already on the list.',
      position: existing.position,
      referral_code: existing.referral_code,
    });
  }

  const clientIp = getClientIp(req);

  const refCodeUpper = referred_by
    ? String(referred_by).toUpperCase().replace(/[^A-Z0-9]/g, '')
    : null;

  let referredByToStore = refCodeUpper;
  if (refCodeUpper) {
    const { data: referrer } = await supabase
      .from('waitlist')
      .select('id, signup_ip')
      .eq('referral_code', refCodeUpper)
      .maybeSingle();

    if (!referrer) {
      referredByToStore = null;
    } else if (shouldBlockReferralCredit(referrer, clientIp)) {
      referredByToStore = null;
    }
  }

  const plainToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(plainToken);
  const expiresAt = new Date(Date.now() + VERIFY_EXPIRY_MS).toISOString();

  const pendingRow = {
    email: normalizedEmail,
    token_hash: tokenHash,
    referred_by: referredByToStore,
    source: source || 'waitlist',
    signup_ip: clientIp || null,
    expires_at: expiresAt,
  };

  let { error: pendingErr } = await supabase
    .from('waitlist_pending')
    .upsert(pendingRow, { onConflict: 'email' });

  if (pendingErr && isMissingSignupIpColumn(pendingErr)) {
    delete pendingRow.signup_ip;
    const retry = await supabase
      .from('waitlist_pending')
      .upsert(pendingRow, { onConflict: 'email' });
    pendingErr = retry.error;
  }

  if (pendingErr && isMissingPendingTable(pendingErr)) {
    // eslint-disable-next-line no-console
    console.error('waitlist_pending table missing. Run sql/waitlist_pending.sql');
    return res.status(503).json({
      message: 'Signup is temporarily unavailable. Please try again later.',
    });
  }

  if (pendingErr) {
    // eslint-disable-next-line no-console
    console.error('waitlist_pending upsert error:', pendingErr);
    return res.status(500).json({ message: 'Something went wrong. Try again.' });
  }

  sendVerificationEmail(normalizedEmail, plainToken).catch((err) =>
    // eslint-disable-next-line no-console
    console.error('Verification email error:', err),
  );

  return res.status(200).json({
    message: 'Check your email to confirm your spot.',
    verify_email: true,
  });
});

// GET /api/waitlist/verify?token=... — complete signup after email link
router.get('/verify', readLimiter, async (req, res) => {
  const token = req.query.token;
  if (!token || typeof token !== 'string' || token.length < 64) {
    return res.status(400).send(verifyErrorHtml('Invalid or expired link.'));
  }

  const tokenHash = hashToken(token);

  const { data: pending, error: fetchErr } = await supabase
    .from('waitlist_pending')
    .select('*')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (fetchErr && !isMissingPendingTable(fetchErr)) {
    // eslint-disable-next-line no-console
    console.error('waitlist_pending fetch:', fetchErr);
    return res.status(500).send(verifyErrorHtml('Something went wrong.'));
  }

  if (!pending) {
    return res.status(400).send(verifyErrorHtml('Invalid or expired link.'));
  }

  if (new Date(pending.expires_at) < new Date()) {
    await supabase.from('waitlist_pending').delete().eq('email', pending.email);
    return res.status(400).send(verifyErrorHtml('This link has expired. Sign up again on the waitlist page.'));
  }

  const normalizedEmail = pending.email;

  const { data: existing } = await supabase
    .from('waitlist')
    .select('position, referral_code')
    .eq('email', normalizedEmail)
    .maybeSingle();

  if (existing) {
    await supabase.from('waitlist_pending').delete().eq('email', normalizedEmail);
    const site = getPublicSiteUrl();
    return res.redirect(
      302,
      `${site}/waitlist?ref=${encodeURIComponent(existing.referral_code)}&welcome=1`,
    );
  }

  const clientIp = pending.signup_ip || getClientIp(req);

  let result;
  try {
    result = await finalizeWaitlistSignup({
      normalizedEmail,
      referredBy: pending.referred_by,
      source: pending.source,
      clientIp,
    });
  } catch (e) {
    if (e && e.message === 'INSERT_FAILED') {
      return res.status(500).send(verifyErrorHtml('Could not complete signup. Try again.'));
    }
    throw e;
  }

  await supabase.from('waitlist_pending').delete().eq('email', normalizedEmail);

  const site = getPublicSiteUrl();
  const ref = encodeURIComponent(result.referral_code);
  const rb = result.referral_blocked ? '&referral_blocked=1' : '';
  return res.redirect(302, `${site}/waitlist?ref=${ref}&welcome=1${rb}`);
});

function verifyErrorHtml(msg) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Waitlist</title></head>
<body style="background:#09090C;color:#F0EDE6;font-family:sans-serif;text-align:center;padding:80px 24px;">
<h2 style="color:#C9973A;">P·A·T·A</h2><p style="color:rgba(240,237,230,0.65);max-width:400px;margin:16px auto;">${msg}</p>
<p><a href="/waitlist" style="color:#C9973A;">Back to waitlist</a></p></body></html>`;
}

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
