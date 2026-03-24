/**
 * Canonical public site URL (no trailing slash).
 * Used in transactional emails, unsubscribe links, and redirects.
 *
 * Set PUBLIC_SITE_URL in production (e.g. https://pataqr.com).
 */
function getPublicSiteUrl() {
  const raw = process.env.PUBLIC_SITE_URL || 'https://pataqr.com';
  return String(raw).trim().replace(/\/+$/, '');
}

module.exports = { getPublicSiteUrl };
