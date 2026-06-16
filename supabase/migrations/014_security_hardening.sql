-- Migration 014: Security hardening
-- Run in the Supabase SQL Editor. Idempotent (safe to run more than once).
--
-- DRAFTED by the QA sweep — REVIEW before applying. The ACTIVE statements below
-- are safe (verified against the current client code). The COMMENTED blocks are
-- recommendations that need YOUR judgement / a check against your live dashboard
-- RLS setup before enabling.
-- =============================================================================


-- ── 1. [CRITICAL] Remove the persist_coins() backdoor ────────────────────────
-- persist_coins(p_new_balance) is SECURITY DEFINER and sets profiles.coins to
-- ANY caller-supplied value (GREATEST(0, p_new_balance)). It bypasses the 005
-- anti-cheat lockdown that otherwise blocks direct client writes to coins, so
-- any authenticated user can call it directly over the REST API
--   POST /rest/v1/rpc/persist_coins   { "p_new_balance": 999999999 }
-- and set their balance arbitrarily.
--
-- This is SAFE to drop: the client no longer calls it. js/utils/auth.js
-- persistCoins() is a documented no-op and is not exposed on the Auth object;
-- a repo-wide grep for persist_coins finds zero JS callers. All legitimate coin
-- changes go through record_game_result() (server-validated, replay-protected).
DROP FUNCTION IF EXISTS persist_coins(int);


-- ── 2. [LOW] Pin search_path on get_public_stats() ───────────────────────────
-- All other SECURITY DEFINER functions in this project SET search_path; this one
-- (006) does not, which is a minor definer-function hardening gap (search-path
-- hijacking). Recreate it with the pin. Behaviour is otherwise unchanged.
CREATE OR REPLACE FUNCTION get_public_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN jsonb_build_object(
    'games_played', (SELECT COUNT(*) FROM game_results),
    'players',      (SELECT COUNT(*) FROM profiles)
  );
END;
$$;


-- ── 3. [RECOMMENDATION — needs your decision] Harden room-bet payouts ─────────
-- record_game_result() (migration 005) computes a bet payout from the CLIENT-
-- supplied p_result: 'win' pays +2x the bet, 'loss' pays -bet. A malicious
-- client can POST result='win' for a game it actually lost and collect the win
-- payout. The function already restricts a caller to their OWN bet
-- (bets ->> auth.uid()), so they cannot touch other players' coins — but they
-- can lie about their own outcome.
--
-- The correct fix is to resolve the outcome from AUTHORITATIVE server state
-- instead of trusting p_result, e.g. read the winner recorded on the room's
-- game_instances (rooms.game_instances[].winner_pid, set when the game ends).
-- This is left as a recommendation because:
--   (a) winner_pid is a CLIENT-generated player id, while bets are keyed by
--       auth.uid() — you need to confirm how those map in your data before
--       enforcing, or a wrong check will reject legitimate payouts;
--   (b) it changes live payout behaviour and should be tested with a real
--       2-client room first.
--
-- Sketch (DO NOT enable without verifying the player_id <-> auth.uid mapping):
--
-- -- inside record_game_result, replace the bet block with:
-- IF p_room_id IS NOT NULL THEN
--   -- pull the authoritative winner for this player's instance
--   SELECT (inst ->> 'winner_pid') INTO v_winner_pid
--   FROM rooms r, jsonb_array_elements(r.game_instances) inst
--   WHERE r.id = p_room_id
--     AND (inst -> 'player_assignments') ? v_user_id::text   -- if assignments key by uid
--   LIMIT 1;
--   -- only pay a win if the server agrees this user won:
--   IF p_result = 'win' AND v_winner_pid IS DISTINCT FROM <this user's pid> THEN
--     RETURN jsonb_build_object('success', false, 'error', 'result_not_confirmed');
--   END IF;
--   ... existing bet math ...
-- END IF;


-- ── 4. [RECOMMENDATION — verify against your dashboard first] Room RLS ────────
-- Migration 001 left the rooms RLS policies commented out ("adjust to match your
-- existing setup"), so the live policy set lives only in your Supabase dashboard
-- and is not in source control. Two things to confirm in the dashboard:
--   * Is RLS ENABLED on rooms? If enabled with NO policies, all access is denied
--     (the app clearly works, so policies exist somewhere — capture them here).
--   * The room system authenticates players by a CLIENT-generated player_id, not
--     auth.uid() (guests play without accounts), so a tight auth.uid()-based
--     UPDATE policy would BREAK guest play. Do not add one blindly.
--
-- Because room writes can't be meaningfully constrained by RLS alone (no auth
-- identity for guests), the robust long-term fix is to route mutating room
-- operations (join, state-sync, win-report) through SECURITY DEFINER RPCs that
-- validate the caller is a listed participant — mirroring the coin system —
-- rather than open UPDATE policies. That is an architectural change; flagged for
-- a deliberate pass, not auto-applied here.
--
-- If you DO want to commit the current permissive policies to source control so
-- they're reproducible, capture them from the dashboard and add them below, e.g.:
-- -- CREATE POLICY "rooms_read"   ON rooms FOR SELECT USING (true);
-- -- CREATE POLICY "rooms_insert" ON rooms FOR INSERT WITH CHECK (true);
-- -- CREATE POLICY "rooms_update" ON rooms FOR UPDATE USING (true);


-- ── 5. [INFO] stats UPDATE policy ────────────────────────────────────────────
-- Migration 005 DROPs the "own update" policy on stats and does not recreate it.
-- That is INTENTIONAL: clients must not UPDATE stats directly — record_game_result
-- (SECURITY DEFINER) owns all stat writes and bypasses RLS. Confirm a stats
-- INSERT-with-check policy still exists for signUp()'s initial row creation
-- (005 says it is kept). No change applied here.
