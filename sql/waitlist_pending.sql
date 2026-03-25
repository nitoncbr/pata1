-- Run in Supabase SQL editor (after waitlist table exists).
-- Holds signups until the user clicks the verification link in email.

CREATE TABLE IF NOT EXISTS waitlist_pending (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  token_hash text NOT NULL,
  referred_by text,
  source text,
  signup_ip text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS waitlist_pending_email_key ON waitlist_pending (email);
CREATE INDEX IF NOT EXISTS waitlist_pending_token_hash_idx ON waitlist_pending (token_hash);
CREATE INDEX IF NOT EXISTS waitlist_pending_expires_at_idx ON waitlist_pending (expires_at);

COMMENT ON TABLE waitlist_pending IS 'Unverified waitlist signups; deleted after promotion to waitlist';
