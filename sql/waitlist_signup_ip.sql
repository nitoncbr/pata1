-- Run once in Supabase SQL editor (Dashboard → SQL → New query)
-- Stores client IP at signup so we can block self-referral abuse (same IP as referrer).

ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS signup_ip TEXT;

COMMENT ON COLUMN waitlist.signup_ip IS 'Client IP at signup; used for anti-abuse only, not exposed via public API';
