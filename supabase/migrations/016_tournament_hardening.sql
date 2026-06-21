-- =============================================================================
-- Migration 016: Tournament hardening
-- Run in the Supabase SQL Editor AFTER 007 + 008. Idempotent (CREATE OR REPLACE
-- / guarded ALTERs). DRAFTED from the deep tournament audit — REVIEW before
-- applying. Fixes the structural defects that made the bracket unusable for most
-- player counts and let a loser steal a match.
--
-- Addresses (audit ids):
--   CRIT  seed_bracket softlock on non-power-of-two fields (double-bye dead-ends)
--   CRIT  advance_winner trusted the caller's win claim (loser could steal + prize)
--   CRIT  advancement was a single point of failure (only the winner called it)
--   HIGH  non-atomic advancement (double-advance / lost update) + non-idempotent payout
--   HIGH  no resolution path for forfeits / disconnects / no-shows
--   HIGH  register_for_tournament TOCTOU (overfilled bracket / over-deducted coins)
--   MED   RLS "host update" allowed editing ANY column (winner_*, status, prize_pool)
--   LOW   match never entered an 'in_progress' state (bracket live/watch UI dead)
-- =============================================================================


-- ── 0. Allow an 'in_progress' match status ───────────────────────────────────
-- bracket.js renders an in_progress state (live/"watch" link) the schema forbade.
ALTER TABLE tournament_matches DROP CONSTRAINT IF EXISTS tournament_matches_status_check;
ALTER TABLE tournament_matches
  ADD CONSTRAINT tournament_matches_status_check
  CHECK (status IN ('pending','ready','in_progress','completed'));


-- ── 1. RLS: restrict the host's DIRECT update to registration_open only ───────
-- The 007 policy said "registration_open only" but enforced no column limit, so a
-- host could UPDATE winner_*/status/prize_pool on their own tournament directly
-- and rig it. RLS can't restrict columns; column-level privileges can. All other
-- legitimate writes go through the SECURITY DEFINER functions (which bypass this).
-- The only direct client write is tournament.js setting registration_open=false.
REVOKE UPDATE ON tournaments FROM authenticated;
GRANT  UPDATE (registration_open) ON tournaments TO authenticated;


-- ── 2. Shared finalizer: mark a match complete, then advance or pay out ───────
-- Private helper (not granted to clients). Assumes the caller has already
-- authorised and row-locked the match and confirmed it is NOT already completed.
-- Idempotency/locking is the CALLER's responsibility (advance_winner / forfeit).
CREATE OR REPLACE FUNCTION _tn_finalize_match(p_match_id uuid, p_winner_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_match       tournament_matches%ROWTYPE;
  v_tour        tournaments%ROWTYPE;
  v_loser_id    uuid;
  v_pool        int;
  v_next_m      int;
  v_is_odd      bool;
  v_semi_losers uuid[];
  v_sl          uuid;
  v_rows        int;
BEGIN
  SELECT * INTO v_match FROM tournament_matches WHERE id = p_match_id;
  SELECT * INTO v_tour  FROM tournaments        WHERE id = v_match.tournament_id;

  v_loser_id := CASE WHEN v_match.player1_id = p_winner_id THEN v_match.player2_id
                     ELSE v_match.player1_id END;

  UPDATE tournament_matches
  SET winner_id = p_winner_id, status = 'completed'
  WHERE id = p_match_id;

  IF v_loser_id IS NOT NULL THEN
    UPDATE tournament_players
    SET eliminated_round = v_match.round
    WHERE tournament_id = v_match.tournament_id AND user_id = v_loser_id;
  END IF;

  -- ── Final round: finalize tournament + pay prizes (runs once; the match can
  --    only transition to completed once, under the caller's lock) ────────────
  IF v_match.round = v_tour.total_rounds THEN
    v_pool := v_tour.prize_pool;

    UPDATE tournaments
    SET status = 'completed', winner_1st = p_winner_id, winner_2nd = v_loser_id
    WHERE id = v_match.tournament_id AND status <> 'completed';

    -- Idempotency backstop: only pay prizes if THIS call actually completed the
    -- tournament (the row above flipped). If it was already completed, do not
    -- double-pay — even if the caller's row lock were somehow bypassed.
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 0 THEN RETURN; END IF;

    UPDATE profiles SET coins = coins + floor(v_pool * 0.60)::int WHERE id = p_winner_id;
    IF v_loser_id IS NOT NULL THEN
      UPDATE profiles SET coins = coins + floor(v_pool * 0.30)::int WHERE id = v_loser_id;
    END IF;

    IF v_tour.total_rounds >= 2 THEN
      SELECT ARRAY(
        SELECT CASE WHEN tm.player1_id = tm.winner_id THEN tm.player2_id ELSE tm.player1_id END
        FROM tournament_matches tm
        WHERE tm.tournament_id = v_match.tournament_id
          AND tm.round         = v_tour.total_rounds - 1
          AND tm.status        = 'completed'
          AND tm.winner_id     IS NOT NULL
          AND tm.player1_id    IS NOT NULL          -- skip bye semis (no real loser)
          AND tm.player2_id    IS NOT NULL
      ) INTO v_semi_losers;

      IF v_semi_losers IS NOT NULL AND array_length(v_semi_losers, 1) > 0 THEN
        IF v_semi_losers[1] IS NOT NULL THEN
          UPDATE tournaments SET winner_3rd = v_semi_losers[1] WHERE id = v_match.tournament_id;
        END IF;
        FOREACH v_sl IN ARRAY v_semi_losers LOOP
          IF v_sl IS NOT NULL THEN
            UPDATE profiles SET coins = coins + floor(v_pool * 0.05)::int WHERE id = v_sl;
          END IF;
        END LOOP;
      END IF;
    END IF;
    RETURN;
  END IF;

  -- ── Not the final: advance the winner into the parent slot ─────────────────
  v_next_m := (v_match.match_number + 1) / 2;
  v_is_odd := (v_match.match_number % 2) = 1;

  IF v_is_odd THEN
    UPDATE tournament_matches
    SET player1_id = p_winner_id,
        status     = CASE WHEN player2_id IS NOT NULL THEN 'ready' ELSE status END
    WHERE tournament_id = v_match.tournament_id AND round = v_match.round + 1 AND match_number = v_next_m;
  ELSE
    UPDATE tournament_matches
    SET player2_id = p_winner_id,
        status     = CASE WHEN player1_id IS NOT NULL THEN 'ready' ELSE status END
    WHERE tournament_id = v_match.tournament_id AND round = v_match.round + 1 AND match_number = v_next_m;
  END IF;
END;
$func$;

REVOKE EXECUTE ON FUNCTION _tn_finalize_match(uuid, uuid) FROM public, anon, authenticated;


-- ── 3. advance_winner: server-validated, idempotent, no single point of failure
-- Changes vs 008:
--   * Callable by EITHER participant (not only the self-declared winner), so if
--     the winner's client drops, the loser's client still advances the bracket.
--   * The winner is cross-checked against the match room's recorded result
--     (rooms.game_instances[].winner_pid) instead of being taken on the caller's
--     word, and the match is row-locked + re-checked for completion so duplicate
--     / concurrent calls can't double-advance or double-pay.
-- SECURITY LIMIT (read this): the room result itself is written by a client
--   (Room.endGameWithWin is a direct rooms UPDATE — these are peer-synced games
--   with no server-side engine). So this BLOCKS the trivial attack (a participant
--   POSTing advance_winner with no/contradicting recorded result) and forces a
--   cheater to also forge the room's winner_pid and win the last-write race
--   against the honest client — but it is NOT full anti-cheat. A determined
--   modified client can still rig its own match. Closing that needs server-
--   authoritative game validation (the same open issue as the coin-bet payout
--   trust documented in 014 §3) and is out of scope for this migration.
CREATE OR REPLACE FUNCTION advance_winner(p_match_id uuid, p_winner_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_caller       uuid := auth.uid();
  v_match        tournament_matches%ROWTYPE;
  v_room_winner  text;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  -- Lock the match row so concurrent callers serialise.
  SELECT * INTO v_match FROM tournament_matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'match_not_found');
  END IF;
  IF v_match.status = 'completed' THEN
    RETURN jsonb_build_object('success', true, 'already_completed', true);
  END IF;

  -- Caller must be a participant.
  IF v_caller <> v_match.player1_id AND v_caller <> v_match.player2_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_a_player');
  END IF;
  -- Claimed winner must be a participant.
  IF p_winner_id <> v_match.player1_id AND p_winner_id <> v_match.player2_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_winner');
  END IF;

  -- Cross-check against the recorded room result: the linked match room must have
  -- a finished game instance whose winner matches the claimed winner.
  IF v_match.room_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_match_room');
  END IF;
  SELECT (inst ->> 'winner_pid') INTO v_room_winner
  FROM rooms r, jsonb_array_elements(coalesce(r.game_instances, '[]'::jsonb)) inst
  WHERE r.id = v_match.room_id
    AND inst ->> 'status' = 'finished'
  LIMIT 1;

  IF v_room_winner IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'result_not_recorded');
  END IF;
  IF v_room_winner <> p_winner_id::text THEN
    RETURN jsonb_build_object('success', false, 'error', 'result_not_confirmed');
  END IF;

  PERFORM _tn_finalize_match(p_match_id, p_winner_id);

  IF v_match.round = (SELECT total_rounds FROM tournaments WHERE id = v_match.tournament_id) THEN
    RETURN jsonb_build_object('success', true, 'tournament_completed', true);
  END IF;
  RETURN jsonb_build_object('success', true, 'advanced', true);
END;
$func$;

GRANT EXECUTE ON FUNCTION advance_winner(uuid, uuid) TO authenticated;


-- ── 4. resolve_match_by_forfeit: host recovery for no-shows / disconnects ─────
-- Host-only. Force-advances a non-completed match to a chosen participant when a
-- player never shows or drops, so the bracket can't dead-end on a winnerless
-- match. No room-result check (host authority). Row-locked + idempotent.
-- INTENTIONAL: this works on an 'in_progress' match too — an abandoned/
-- disconnected match stays 'in_progress' forever, and that is exactly the case
-- the host needs to resolve. The host owns this decision.
CREATE OR REPLACE FUNCTION resolve_match_by_forfeit(p_match_id uuid, p_winner_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_caller uuid := auth.uid();
  v_match  tournament_matches%ROWTYPE;
  v_host   uuid;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  SELECT * INTO v_match FROM tournament_matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'match_not_found');
  END IF;

  SELECT host_id INTO v_host FROM tournaments WHERE id = v_match.tournament_id;
  IF v_caller <> v_host THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_host');
  END IF;

  IF v_match.status = 'completed' THEN
    RETURN jsonb_build_object('success', true, 'already_completed', true);
  END IF;
  -- Winner must be one of the two assigned participants.
  IF p_winner_id IS NULL
     OR (p_winner_id <> v_match.player1_id AND p_winner_id <> v_match.player2_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_winner');
  END IF;

  PERFORM _tn_finalize_match(p_match_id, p_winner_id);
  RETURN jsonb_build_object('success', true, 'forfeit_resolved', true);
END;
$func$;

GRANT EXECUTE ON FUNCTION resolve_match_by_forfeit(uuid, uuid) TO authenticated;


-- ── 5. register_for_tournament: close the TOCTOU (overfill + over-deduct) ─────
-- Atomic slot claim (conditional UPDATE) instead of check-then-increment, and an
-- atomic coin deduct with manual compensation if it loses the race.
CREATE OR REPLACE FUNCTION register_for_tournament(p_tournament_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_user_id  uuid := auth.uid();
  v_username text;
  v_tour     tournaments%ROWTYPE;
  v_claimed  int;
  v_coins    int;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  SELECT * INTO v_tour FROM tournaments WHERE code = upper(trim(p_tournament_code));
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'tournament_not_found');
  END IF;
  IF v_tour.status <> 'registration' OR NOT v_tour.registration_open THEN
    RETURN jsonb_build_object('success', false, 'error', 'registration_closed');
  END IF;
  IF v_tour.expires_at < now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'tournament_expired');
  END IF;
  IF EXISTS (SELECT 1 FROM tournament_players WHERE tournament_id = v_tour.id AND user_id = v_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_registered');
  END IF;

  -- Atomic slot claim: only succeeds if there is still room AND registration open.
  UPDATE tournaments
  SET current_players = current_players + 1
  WHERE id = v_tour.id
    AND status = 'registration' AND registration_open = true
    AND current_players < max_players
  RETURNING current_players INTO v_claimed;
  IF v_claimed IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'tournament_full');
  END IF;

  -- Entry fee: atomic deduct; release the claimed slot if the caller can't pay.
  IF v_tour.entry_fee > 0 THEN
    UPDATE profiles SET coins = coins - v_tour.entry_fee
    WHERE id = v_user_id AND coins >= v_tour.entry_fee
    RETURNING coins INTO v_coins;
    IF v_coins IS NULL THEN
      UPDATE tournaments SET current_players = current_players - 1 WHERE id = v_tour.id;
      RETURN jsonb_build_object('success', false, 'error', 'insufficient_coins');
    END IF;
    UPDATE tournaments SET prize_pool = prize_pool + v_tour.entry_fee WHERE id = v_tour.id;
  END IF;

  SELECT COALESCE(username, 'Player') INTO v_username FROM profiles WHERE id = v_user_id;
  INSERT INTO tournament_players (tournament_id, user_id, username, entry_fee_paid)
  VALUES (v_tour.id, v_user_id, v_username, v_tour.entry_fee);

  RETURN jsonb_build_object('success', true, 'tournament_id', v_tour.id, 'entry_fee_paid', v_tour.entry_fee);
END;
$func$;


-- ── 6. seed_bracket: distribute byes so no round-1 match has TWO byes ─────────
-- Root cause of the softlock: the old fill paired seeds (2m-1, 2m) sequentially,
-- so trailing empty positions could land BOTH in one match -> a double-NULL match
-- that completes with winner_id NULL and never advances. Since the number of byes
-- B = next_pow2 - n is ALWAYS < (slots/2) matches, give each bye its own match:
-- the first B matches are single-player byes, the rest are real 2-player matches.
-- No match ever has two byes, so nothing dead-ends. (Also removes the lone-bye
-- "final pre-completed" glitch, since the double-bye auto-completer never fires.)
CREATE OR REPLACE FUNCTION seed_bracket(p_tournament_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_user_id   uuid := auth.uid();
  v_tour      tournaments%ROWTYPE;
  v_players   uuid[];
  v_n         int;
  v_slots     int := 1;
  v_rounds    int;
  v_byes      int;
  v_idx       int;
  v_p1        uuid;
  v_p2        uuid;
  v_mid       uuid;
  i           int;
  r           int;
  m           int;
  v_matches_in_round int;
  v_bye_rec   RECORD;
  v_next_m    int;
  v_is_odd    bool;
  v_advanced  bool;
BEGIN
  SELECT * INTO v_tour FROM tournaments WHERE id = p_tournament_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'tournament_not_found');
  END IF;
  IF v_tour.host_id <> v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_host');
  END IF;
  IF v_tour.status <> 'registration' THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_started');
  END IF;
  IF v_tour.current_players < 2 THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_enough_players');
  END IF;

  SELECT ARRAY(
    SELECT user_id FROM tournament_players
    WHERE tournament_id = p_tournament_id
    ORDER BY random()
  ) INTO v_players;

  v_n := array_length(v_players, 1);

  WHILE v_slots < v_n LOOP v_slots := v_slots * 2; END LOOP;
  v_rounds := (log(v_slots) / log(2))::int;
  v_byes   := v_slots - v_n;   -- always 0 <= v_byes < v_slots/2

  FOR i IN 1..v_n LOOP
    UPDATE tournament_players SET seed = i
    WHERE tournament_id = p_tournament_id AND user_id = v_players[i];
  END LOOP;

  -- Placeholder matches for every round.
  FOR r IN 1..v_rounds LOOP
    v_matches_in_round := v_slots / (2^r)::int;
    FOR m IN 1..v_matches_in_round LOOP
      INSERT INTO tournament_matches (tournament_id, round, match_number, status)
      VALUES (p_tournament_id, r, m, 'pending');
    END LOOP;
  END LOOP;

  -- Round 1: first v_byes matches are single-player byes, the rest are real.
  v_matches_in_round := v_slots / 2;
  v_idx := 1;
  FOR m IN 1..v_matches_in_round LOOP
    IF m <= v_byes THEN
      v_p1  := v_players[v_idx]; v_idx := v_idx + 1;
      UPDATE tournament_matches
      SET player1_id = v_p1, status = 'completed', winner_id = v_p1
      WHERE tournament_id = p_tournament_id AND round = 1 AND match_number = m;
    ELSE
      v_p1  := v_players[v_idx]; v_idx := v_idx + 1;
      v_p2  := v_players[v_idx]; v_idx := v_idx + 1;
      UPDATE tournament_matches
      SET player1_id = v_p1, player2_id = v_p2, status = 'ready'
      WHERE tournament_id = p_tournament_id AND round = 1 AND match_number = m;
    END IF;
  END LOOP;

  -- Cascade single-bye winners up. No double-byes exist, so each step just places
  -- one player into the parent slot (flipping it to 'ready' once both are in).
  v_advanced := true;
  WHILE v_advanced LOOP
    v_advanced := false;
    FOR v_bye_rec IN
      SELECT tm.round, tm.match_number, tm.winner_id
      FROM tournament_matches tm
      WHERE tm.tournament_id = p_tournament_id
        AND tm.status = 'completed' AND tm.winner_id IS NOT NULL AND tm.round < v_rounds
        AND NOT EXISTS (
          SELECT 1 FROM tournament_matches nxt
          WHERE nxt.tournament_id = p_tournament_id
            AND nxt.round = tm.round + 1
            AND nxt.match_number = (tm.match_number + 1) / 2
            AND (nxt.player1_id = tm.winner_id OR nxt.player2_id = tm.winner_id)
        )
    LOOP
      v_next_m := (v_bye_rec.match_number + 1) / 2;
      v_is_odd := (v_bye_rec.match_number % 2) = 1;
      IF v_is_odd THEN
        UPDATE tournament_matches
        SET player1_id = v_bye_rec.winner_id,
            status = CASE WHEN player2_id IS NOT NULL THEN 'ready' ELSE 'pending' END
        WHERE tournament_id = p_tournament_id AND round = v_bye_rec.round + 1 AND match_number = v_next_m;
      ELSE
        UPDATE tournament_matches
        SET player2_id = v_bye_rec.winner_id,
            status = CASE WHEN player1_id IS NOT NULL THEN 'ready' ELSE 'pending' END
        WHERE tournament_id = p_tournament_id AND round = v_bye_rec.round + 1 AND match_number = v_next_m;
      END IF;
      v_advanced := true;
    END LOOP;
  END LOOP;

  UPDATE tournaments
  SET status = 'active', registration_open = false, total_rounds = v_rounds
  WHERE id = p_tournament_id;

  RETURN jsonb_build_object('success', true, 'total_rounds', v_rounds, 'total_slots', v_slots, 'players', v_n);
END;
$func$;


-- ── 7. create_match_room: mark the match in_progress when its room opens ──────
-- So bracket.js can show the live/"watch" state, and the match isn't stuck at
-- 'ready' while being played. (advance_winner accepts any non-completed status.)
CREATE OR REPLACE FUNCTION create_match_room(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_caller   uuid := auth.uid();
  v_match    tournament_matches%ROWTYPE;
  v_tour     tournaments%ROWTYPE;
  v_room_id  uuid;
  v_code     text;
  v_chars    text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i          int;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  SELECT * INTO v_match FROM tournament_matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'match_not_found');
  END IF;
  IF v_caller <> v_match.player1_id AND v_caller <> v_match.player2_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_a_player');
  END IF;
  IF v_match.status NOT IN ('ready', 'in_progress') THEN
    RETURN jsonb_build_object('success', false, 'error', 'match_not_ready');
  END IF;
  IF v_match.room_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'room_id', v_match.room_id);
  END IF;

  SELECT * INTO v_tour FROM tournaments WHERE id = v_match.tournament_id;

  LOOP
    v_code := '';
    FOR i IN 1..6 LOOP
      v_code := v_code || substr(v_chars, (floor(random() * length(v_chars)) + 1)::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM rooms WHERE code = v_code);
  END LOOP;

  INSERT INTO rooms (
    game_id, code, host_id, tournament_match_id,
    player_ids, player_names, player_wins, player_roles, player_ready,
    max_players, status
  ) VALUES (
    v_tour.game_id, v_code, v_match.player1_id, p_match_id,
    jsonb_build_array(v_match.player1_id::text, v_match.player2_id::text),
    '{}'::jsonb, '{}'::jsonb,
    jsonb_build_object(v_match.player1_id::text, 'player', v_match.player2_id::text, 'player'),
    '{}'::jsonb, 2, 'waiting'
  )
  RETURNING id INTO v_room_id;

  UPDATE tournament_matches SET room_id = v_room_id, status = 'in_progress' WHERE id = p_match_id;

  RETURN jsonb_build_object('success', true, 'room_id', v_room_id);
END;
$func$;
