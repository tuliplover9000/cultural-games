-- Migration 022: Guarantee every account has a profiles row (the real coin bug)
-- Run in the Supabase SQL Editor. Idempotent — safe to run more than once.
--
-- ROOT CAUSE
-- ----------
-- signUp() (js/utils/auth.js) creates the auth user first, and only AFTER that
-- inserts the profiles row. But when the Supabase project requires email
-- confirmation, /signup returns no access_token, so signUp() returns early
-- ("please confirm your email, then sign in") BEFORE it ever creates the
-- profiles row. The user later confirms + signs in fine — but has NO profiles
-- row. From then on:
--   * record_game_result() logs each win to game_results (so games_played goes
--     up) but its `UPDATE profiles SET coins = coins + delta WHERE id = uid`
--     matches ZERO rows — coins never persist;
--   * the profile page reads profiles by id, finds nothing, and shows 0 coins.
-- The coins were never lost from anywhere — they were never bankable. But every
-- win is still in the game_results ledger, so we can reconstruct the balance.
--
-- THIS MIGRATION
-- --------------
--   1. handle_new_user() trigger  -> every NEW auth user auto-gets a profiles row
--   2. ensure_profile() RPC       -> client self-heal: create-if-missing + restore
--                                    coins from the ledger (server-authoritative)
--   3. one-time backfill          -> repair every EXISTING account that is missing
--                                    a profiles row right now (restores coins)


-- ── Helper: derive a safe, unique-ish username from an email ──────────────────
-- Lowercase-ish email prefix, stripped to [A-Za-z0-9_]; falls back to player_<id>
-- and appends a short id suffix if the name is already taken.
CREATE OR REPLACE FUNCTION _cg_username_for(p_id uuid, p_email text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
BEGIN
  v_name := regexp_replace(split_part(COALESCE(p_email, ''), '@', 1), '[^A-Za-z0-9_]', '', 'g');
  IF v_name IS NULL OR length(v_name) < 3 THEN
    v_name := 'player_' || substr(p_id::text, 1, 6);
  END IF;
  IF EXISTS (SELECT 1 FROM profiles WHERE username = v_name AND id <> p_id) THEN
    v_name := left(v_name, 14) || '_' || substr(p_id::text, 1, 4);
  END IF;
  RETURN v_name;
END;
$$;


-- ── 1. Auto-create a profiles row for every new auth user ─────────────────────
-- Standard Supabase pattern. SECURITY DEFINER so it can write profiles/read
-- auth.users regardless of the caller's RLS. ON CONFLICT DO NOTHING keeps it
-- compatible with signUp()'s own upsert (see the client change in this commit).
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO profiles (id, username, coins)
  VALUES (NEW.id, _cg_username_for(NEW.id, NEW.email), 0)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();


-- ── 2. ensure_profile(): client-callable self-heal ────────────────────────────
-- Creates the caller's profiles row if missing, restoring coins as the sum of
-- their game_results ledger (what they legitimately earned). Idempotent: if the
-- row already exists it changes nothing (never double-credits). Returns the
-- current balance. Coins are computed server-side, so the client cannot inflate
-- them.
CREATE OR REPLACE FUNCTION ensure_profile()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_email  text;
  v_earned int;
  v_coins  int;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_uid) THEN
    SELECT email INTO v_email FROM auth.users WHERE id = v_uid;
    SELECT COALESCE(SUM(coins_awarded), 0) INTO v_earned FROM game_results WHERE user_id = v_uid;
    IF v_earned < 0 THEN v_earned := 0; END IF;
    INSERT INTO profiles (id, username, coins)
    VALUES (v_uid, _cg_username_for(v_uid, v_email), v_earned)
    ON CONFLICT (id) DO NOTHING;
  END IF;

  SELECT coins INTO v_coins FROM profiles WHERE id = v_uid;
  RETURN jsonb_build_object('success', true, 'coins', COALESCE(v_coins, 0));
END;
$$;

GRANT EXECUTE ON FUNCTION ensure_profile() TO authenticated;


-- ── 3. One-time backfill: repair every account missing a profiles row now ─────
-- Restores coins from each user's game_results ledger. Runs once; on a repeat
-- run there are no missing rows so it is a no-op.
DO $$
DECLARE
  r        record;
  v_earned int;
BEGIN
  FOR r IN
    SELECT u.id, u.email
    FROM auth.users u
    WHERE NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = u.id)
  LOOP
    SELECT COALESCE(SUM(coins_awarded), 0) INTO v_earned FROM game_results WHERE user_id = r.id;
    IF v_earned < 0 THEN v_earned := 0; END IF;
    INSERT INTO profiles (id, username, coins)
    VALUES (r.id, _cg_username_for(r.id, r.email), v_earned)
    ON CONFLICT (id) DO NOTHING;
  END LOOP;
END;
$$;
