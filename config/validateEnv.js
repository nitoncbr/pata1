/**
 * Fail fast in production when required secrets are missing.
 */
function validateProductionEnv() {
  if (process.env.NODE_ENV !== 'production') {
    return;
  }

  const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY'];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    // eslint-disable-next-line no-console
    console.error(
      `[pata] Refusing to start: missing required env in production: ${missing.join(', ')}`,
    );
    process.exit(1);
  }

  if (!process.env.PUBLIC_SITE_URL) {
    // eslint-disable-next-line no-console
    console.warn(
      '[pata] PUBLIC_SITE_URL is not set; defaulting to https://pataqr.com for email links.',
    );
  }

  if (!process.env.RESEND_API_KEY) {
    // eslint-disable-next-line no-console
    console.warn('[pata] RESEND_API_KEY is not set; waitlist welcome emails will be skipped.');
  }
}

module.exports = { validateProductionEnv };
