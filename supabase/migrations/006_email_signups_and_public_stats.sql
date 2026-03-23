-- Migration 006: Email signups table + public stats RPC
-- Run in Supabase SQL Editor

-- Phase F: Email capture
CREATE TABLE IF NOT EXISTS email_signups (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  email      text NOT NULL,
  source     text DEFAULT 'footer',
  created_at timestamptz DEFAULT now(),
  CONSTRAINT email_signups_email_unique UNIQUE (email),
  CONSTRAINT email_signups_email_format CHECK (email ~* '^[^@]+@[^@]+\.[^@]+$')
);

ALTER TABLE email_signups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone can subscribe" ON email_signups
  FOR INSERT WITH CHECK (true);

-- Phase E: Public stats RPC (counts only — no row data exposed)
CREATE OR REPLACE FUNCTION get_public_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN jsonb_build_object(
    'games_played', (SELECT COUNT(*) FROM game_results),
    'players',      (SELECT COUNT(*) FROM profiles)
  );
END;
$$;
