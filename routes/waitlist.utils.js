const disposableDomains = require('disposable-email-domains');

/**
 * Check disposable email domain (list from disposable-email-domains package).
 */
function isDisposable(email) {
  const domain = email.split('@')[1]?.toLowerCase();
  return disposableDomains.includes(domain);
}

/**
 * Express client IP (requires app.set('trust proxy') behind ngrok/proxies).
 */
function getClientIp(req) {
  const raw = req.ip || req.connection?.remoteAddress || '';
  return String(raw).replace(/^::ffff:/, '');
}

/**
 * Normalize email for duplicate detection (Gmail ignores dots & +tags).
 */
function normalizeEmailForDedup(email) {
  const trimmed = email.toLowerCase().trim();
  const at = trimmed.indexOf('@');
  if (at < 1) return trimmed;
  let local = trimmed.slice(0, at);
  let domain = trimmed.slice(at + 1);
  if (domain === 'googlemail.com') domain = 'gmail.com';
  if (domain === 'gmail.com') {
    const plus = local.indexOf('+');
    if (plus !== -1) local = local.slice(0, plus);
    local = local.replace(/\./g, '');
  }
  return `${local}@${domain}`;
}

/**
 * Referral credit blocked: new signup IP matches referrer's IP.
 */
function shouldBlockReferralCredit(referrer, clientIp) {
  if (!referrer || !clientIp) return false;
  const refIp = referrer.signup_ip;
  if (!refIp) return false;
  return String(refIp) === String(clientIp);
}

/**
 * Detect PostgREST error when signup_ip column is missing (migration not applied).
 */
function isMissingSignupIpColumn(err) {
  if (!err) return false;
  const blob = `${err.message || ''} ${err.details || ''} ${err.hint || ''}`;
  return /signup_ip/i.test(blob);
}

module.exports = {
  isDisposable,
  getClientIp,
  normalizeEmailForDedup,
  shouldBlockReferralCredit,
  isMissingSignupIpColumn,
};
