-- =============================================================================
-- Cultural Games — Tournament System · Part 2: Functions (Migration 008)
-- Run AFTER 007_tournaments_tables.sql
-- All function bodies use $func$ dollar-quote delimiters to avoid parse errors
-- caused by any $ characters inside function bodies.
-- Safe to re-run (CREATE OR REPLACE throughout).
-- =============================================================================

-- ── 1. sanitise_tournament_name ───────────────────────────────────────────────
-- Returns cleaned name, or NULL if profanity detected.

CREATE OR REPLACE FUNCTION sanitise_tournament_name(p_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_clean text;
  v_bad   text[] := ARRAY['fuck','shit','bitch','cunt','nigger','faggot'];
  v_word  text;
BEGIN
  v_clean := trim(regexp_replace(p_name, '\s+', ' ', 'g'));
  FOREACH v_word IN ARRAY v_bad LOOP
    IF lower(v_clean) LIKE '%' || v_word || '%' THEN
      RETURN NULL;
    END IF;
  END LOOP;
  RETURN v_clean;
END;
$func$;


-- ── 2. generate_tournament_code ───────────────────────────────────────────────
-- Produces a unique 6-character alphanumeric code (no 0/O/1/I ambiguity).

CREATE OR REPLACE FUNCTION generate_tournament_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code  text;
  v_tries int  := 0;
BEGIN
  LOOP
    v_code := '';
    FOR i IN 1..6 LOOP
      v_code := v_code || substr(v_chars, (floor(random() * length(v_chars)) + 1)::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM tournaments WHERE code = v_code);
    v_tries := v_tries + 1;
    IF v_tries > 100 THEN
      RAISE EXCEPTION 'generate_tournament_code: could not find unique code after 100 tries';
    END IF;
  END LOOP;
  RETURN v_code;
END;
$func$;


-- ── 3. create_tournament ──────────────────────────────────────────────────────
-- Creates a tournament and deducts the host seed from the caller's coin balance.
-- Returns: { success, tournament_id, code } | { success: false, error }

CREATE OR REPLACE FUNCTION create_tournament(
  p_name          text,
  p_game_id       text,
  p_max_players   int     DEFAULT 8,
  p_entry_fee     int     DEFAULT 0,
  p_host_seed     int     DEFAULT 0,
  p_match_limit   int     DEFAULT 30,
  p_expires_hours int     DEFAULT 48,
  p_is_public     boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_user_id     uuid := auth.uid();
  v_valid_games text[] := ARRAY[
    'tien-len','bau-cua','o-an-quan','oware','patolli','puluc',
    'pallanguzhi','fanorona','hnefatafl','mahjong','pachisi',
    'ganjifa','latrunculi','cachos','xinjiang-fangqi'
  ];
  v_clean_name  text;
  v_min_seed    int;
  v_code        text;
  v_tour_id     uuid;
BEGIN
  -- Auth
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  -- Name validation
  v_clean_name := sanitise_tournament_name(p_name);
  IF v_clean_name IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'profanity_detected');
  END IF;
  IF length(v_clean_name) < 3 THEN
    RETURN jsonb_build_object('success', false, 'error', 'name_too_short');
  END IF;
  IF length(v_clean_name) > 60 THEN
    v_clean_name := left(v_clean_name, 60);
  END IF;

  -- Game validation
  IF NOT (p_game_id = ANY(v_valid_games)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_game');
  END IF;

  -- Player count
  IF p_max_players NOT BETWEEN 4 AND 32 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_player_count');
  END IF;

  -- Host seed floor: 150 coins x max_players ensures meaningful prize pool
  v_min_seed := 150 * p_max_players;
  IF p_host_seed < v_min_seed THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_host_seed', 'minimum', v_min_seed);
  END IF;

  -- Coin balance check
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = v_user_id AND coins >= p_host_seed
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_coins');
  END IF;

  -- Deduct host seed
  UPDATE profiles
  SET coins = coins - p_host_seed
  WHERE id = v_user_id;

  v_code := generate_tournament_code();

  INSERT INTO tournaments (
    code, name, game_id, host_id,
    max_players, entry_fee, host_seed, prize_pool,
    match_limit, expires_at, is_public
  ) VALUES (
    v_code, v_clean_name, p_game_id, v_user_id,
    p_max_players, p_entry_fee, p_host_seed, p_host_seed,
    p_match_limit,
    now() + (p_expires_hours || ' hours')::interval,
    p_is_public
  )
  RETURNING id INTO v_tour_id;

  RETURN jsonb_build_object(
    'success',       true,
    'tournament_id', v_tour_id,
    'code',          v_code
  );
END;
$func$;


-- ── 4. register_for_tournament ────────────────────────────────────────────────
-- Registers the calling user and deducts the entry fee.
-- Returns: { success, tournament_id, entry_fee_paid } | { success: false, error }
-- NOTE: reads `username` from profiles. If your profiles table uses a different
--       column name (e.g. display_name), update the SELECT below accordingly.

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
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  SELECT * INTO v_tour
  FROM tournaments
  WHERE code = upper(trim(p_tournament_code));

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'tournament_not_found');
  END IF;
  IF v_tour.status <> 'registration' OR NOT v_tour.registration_open THEN
    RETURN jsonb_build_object('success', false, 'error', 'registration_closed');
  END IF;
  IF v_tour.expires_at < now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'tournament_expired');
  END IF;
  IF v_tour.current_players >= v_tour.max_players THEN
    RETURN jsonb_build_object('success', false, 'error', 'tournament_full');
  END IF;
  IF EXISTS (
    SELECT 1 FROM tournament_players
    WHERE tournament_id = v_tour.id AND user_id = v_user_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_registered');
  END IF;

  -- Entry fee
  IF v_tour.entry_fee > 0 THEN
    IF NOT EXISTS (
      SELECT 1 FROM profiles WHERE id = v_user_id AND coins >= v_tour.entry_fee
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'insufficient_coins');
    END IF;
    UPDATE profiles  SET coins = coins - v_tour.entry_fee WHERE id = v_user_id;
    UPDATE tournaments SET prize_pool = prize_pool + v_tour.entry_fee WHERE id = v_tour.id;
  END IF;

  -- Grab display name (adjust column if yours is different, e.g. display_name)
  SELECT COALESCE(username, 'Player') INTO v_username
  FROM profiles WHERE id = v_user_id;

  INSERT INTO tournament_players (tournament_id, user_id, username, entry_fee_paid)
  VALUES (v_tour.id, v_user_id, v_username, v_tour.entry_fee);

  UPDATE tournaments
  SET current_players = current_players + 1
  WHERE id = v_tour.id;

  RETURN jsonb_build_object(
    'success',        true,
    'tournament_id',  v_tour.id,
    'entry_fee_paid', v_tour.entry_fee
  );
END;
$func$;


-- ── 5. seed_bracket ───────────────────────────────────────────────────────────
-- Host-only. Shuffles players, creates the full bracket, sets status = active.
-- Handles byes when player count is not a power of 2.
-- Returns: { success, total_rounds, total_slots, players } | { success: false, error }

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
  v_match_num int;
  v_p1        uuid;
  v_p2        uuid;
  v_status    text;
  v_winner    uuid;
  v_mid       uuid;
  i           int;
  r           int;
  m           int;
  v_matches_in_round int;
  -- For bye cascade
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

  -- Randomly ordered player UUIDs
  SELECT ARRAY(
    SELECT user_id FROM tournament_players
    WHERE tournament_id = p_tournament_id
    ORDER BY random()
  ) INTO v_players;

  v_n := array_length(v_players, 1);

  -- Next power of 2 >= v_n
  WHILE v_slots < v_n LOOP
    v_slots := v_slots * 2;
  END LOOP;
  v_rounds := (log(v_slots) / log(2))::int;

  -- Assign seeds
  FOR i IN 1..v_n LOOP
    UPDATE tournament_players
    SET seed = i
    WHERE tournament_id = p_tournament_id AND user_id = v_players[i];
  END LOOP;

  -- Create all placeholder matches for all rounds (all start as pending / NULL players)
  FOR r IN 1..v_rounds LOOP
    v_matches_in_round := v_slots / (2^r)::int;
    FOR m IN 1..v_matches_in_round LOOP
      INSERT INTO tournament_matches (tournament_id, round, match_number, status)
      VALUES (p_tournament_id, r, m, 'pending');
    END LOOP;
  END LOOP;

  -- Fill round-1 matches with actual players
  -- Match m covers seed positions (2m-1) and (2m)
  v_matches_in_round := v_slots / 2;
  FOR m IN 1..v_matches_in_round LOOP
    v_p1 := CASE WHEN (2*m - 1) <= v_n THEN v_players[2*m - 1] ELSE NULL END;
    v_p2 := CASE WHEN (2*m)     <= v_n THEN v_players[2*m]     ELSE NULL END;

    IF v_p1 IS NULL AND v_p2 IS NULL THEN
      -- Both empty — mark as completed with no winner (inert bye slot)
      UPDATE tournament_matches
      SET status = 'completed'
      WHERE tournament_id = p_tournament_id AND round = 1 AND match_number = m;
    ELSIF v_p2 IS NULL THEN
      -- Single-player bye
      UPDATE tournament_matches
      SET player1_id = v_p1, status = 'completed', winner_id = v_p1
      WHERE tournament_id = p_tournament_id AND round = 1 AND match_number = m;
    ELSE
      -- Real match
      UPDATE tournament_matches
      SET player1_id = v_p1, player2_id = v_p2, status = 'ready'
      WHERE tournament_id = p_tournament_id AND round = 1 AND match_number = m;
    END IF;
  END LOOP;

  -- Cascade: propagate bye-winners up through all rounds until no more to advance.
  -- We loop because advancing a bye in round r may create another bye in round r+1.
  v_advanced := true;
  WHILE v_advanced LOOP
    v_advanced := false;

    FOR v_bye_rec IN
      SELECT tm.round, tm.match_number, tm.winner_id
      FROM tournament_matches tm
      WHERE tm.tournament_id = p_tournament_id
        AND tm.status = 'completed'
        AND tm.winner_id IS NOT NULL
        AND tm.round < v_rounds
        -- Only process if the winner hasn't been placed in the next round yet
        AND NOT EXISTS (
          SELECT 1 FROM tournament_matches nxt
          WHERE nxt.tournament_id = p_tournament_id
            AND nxt.round        = tm.round + 1
            AND nxt.match_number = (tm.match_number + 1) / 2
            AND (nxt.player1_id = tm.winner_id OR nxt.player2_id = tm.winner_id)
        )
    LOOP
      v_next_m  := (v_bye_rec.match_number + 1) / 2;
      v_is_odd  := (v_bye_rec.match_number % 2) = 1;

      IF v_is_odd THEN
        UPDATE tournament_matches
        SET player1_id = v_bye_rec.winner_id,
            status     = CASE WHEN player2_id IS NOT NULL THEN 'ready' ELSE 'pending' END
        WHERE tournament_id  = p_tournament_id
          AND round          = v_bye_rec.round + 1
          AND match_number   = v_next_m;
      ELSE
        UPDATE tournament_matches
        SET player2_id = v_bye_rec.winner_id,
            status     = CASE WHEN player1_id IS NOT NULL THEN 'ready' ELSE 'pending' END
        WHERE tournament_id  = p_tournament_id
          AND round          = v_bye_rec.round + 1
          AND match_number   = v_next_m;
      END IF;

      -- If only this player landed in the next-round match and the other source
      -- will never produce a player (double-bye), auto-complete it too.
      SELECT id INTO v_mid
      FROM tournament_matches
      WHERE tournament_id  = p_tournament_id
        AND round          = v_bye_rec.round + 1
        AND match_number   = v_next_m
        AND status         = 'pending'
        AND (
          (player1_id IS NOT NULL AND player2_id IS NULL) OR
          (player1_id IS NULL     AND player2_id IS NOT NULL)
        )
        -- The "other" round-1 source match is also a double-bye (no winner, no players)
        AND NOT EXISTS (
          SELECT 1 FROM tournament_matches src
          WHERE src.tournament_id = p_tournament_id
            AND src.round         = v_bye_rec.round
            AND src.match_number  = CASE
              WHEN v_is_odd THEN v_next_m * 2        -- other source is even-numbered
              ELSE v_next_m * 2 - 1                  -- other source is odd-numbered
            END
            AND (src.player1_id IS NOT NULL OR src.player2_id IS NOT NULL)
        );

      IF FOUND THEN
        UPDATE tournament_matches
        SET status    = 'completed',
            winner_id = COALESCE(player1_id, player2_id)
        WHERE id = v_mid;
        v_advanced := true;
      END IF;

      v_advanced := true;
    END LOOP;
  END LOOP;

  -- Activate tournament
  UPDATE tournaments
  SET status            = 'active',
      registration_open = false,
      total_rounds      = v_rounds
  WHERE id = p_tournament_id;

  RETURN jsonb_build_object(
    'success',      true,
    'total_rounds', v_rounds,
    'total_slots',  v_slots,
    'players',      v_n
  );
END;
$func$;


-- ── 6. advance_winner ─────────────────────────────────────────────────────────
-- Called by the match winner to record the result and advance to the next round.
-- Only the winning player may call this (auth.uid() must equal p_winner_id).
-- Idempotent: second call on a completed match returns success immediately.
-- Distributes prizes when the final is resolved.
-- Returns: { success, advanced?, tournament_completed? } | { success: false, error }

CREATE OR REPLACE FUNCTION advance_winner(p_match_id uuid, p_winner_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_caller        uuid := auth.uid();
  v_match         tournament_matches%ROWTYPE;
  v_tour          tournaments%ROWTYPE;
  v_loser_id      uuid;
  v_pool          int;
  v_next_m        int;
  v_is_odd        bool;
  v_semi_losers   uuid[];
  v_sl            uuid;
BEGIN
  -- Auth
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;
  IF v_caller <> p_winner_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'forbidden');
  END IF;

  SELECT * INTO v_match FROM tournament_matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'match_not_found');
  END IF;

  -- Idempotent: already completed
  IF v_match.status = 'completed' THEN
    RETURN jsonb_build_object('success', true, 'already_completed', true);
  END IF;

  -- Must be a participant
  IF v_caller <> v_match.player1_id AND v_caller <> v_match.player2_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_a_player');
  END IF;
  -- Must report themselves as winner
  IF p_winner_id <> v_match.player1_id AND p_winner_id <> v_match.player2_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_winner');
  END IF;

  SELECT * INTO v_tour FROM tournaments WHERE id = v_match.tournament_id;

  v_loser_id := CASE
    WHEN v_match.player1_id = p_winner_id THEN v_match.player2_id
    ELSE v_match.player1_id
  END;

  -- Mark match complete
  UPDATE tournament_matches
  SET winner_id = p_winner_id, status = 'completed'
  WHERE id = p_match_id;

  -- Record loser's exit round
  IF v_loser_id IS NOT NULL THEN
    UPDATE tournament_players
    SET eliminated_round = v_match.round
    WHERE tournament_id = v_match.tournament_id AND user_id = v_loser_id;
  END IF;

  -- ── Final round: distribute prizes ────────────────────────────────────────
  IF v_match.round = v_tour.total_rounds THEN
    v_pool := v_tour.prize_pool;

    UPDATE tournaments
    SET status     = 'completed',
        winner_1st = p_winner_id,
        winner_2nd = v_loser_id
    WHERE id = v_match.tournament_id;

    -- 1st place: 60%
    UPDATE profiles
    SET coins = coins + floor(v_pool * 0.60)::int
    WHERE id = p_winner_id;

    -- 2nd place: 30%
    IF v_loser_id IS NOT NULL THEN
      UPDATE profiles
      SET coins = coins + floor(v_pool * 0.30)::int
      WHERE id = v_loser_id;
    END IF;

    -- 3rd place: 5% each to semi-final losers (only if semi-final round exists)
    IF v_tour.total_rounds >= 2 THEN
      SELECT ARRAY(
        SELECT CASE
          WHEN tm.player1_id = tm.winner_id THEN tm.player2_id
          ELSE tm.player1_id
        END
        FROM tournament_matches tm
        WHERE tm.tournament_id = v_match.tournament_id
          AND tm.round         = v_tour.total_rounds - 1
          AND tm.status        = 'completed'
          AND tm.winner_id     IS NOT NULL
      ) INTO v_semi_losers;

      IF v_semi_losers IS NOT NULL THEN
        -- Store first semi-final loser as winner_3rd for the completion overlay
        IF array_length(v_semi_losers, 1) > 0 AND v_semi_losers[1] IS NOT NULL THEN
          UPDATE tournaments
          SET winner_3rd = v_semi_losers[1]
          WHERE id = v_match.tournament_id;
        END IF;

        FOREACH v_sl IN ARRAY v_semi_losers LOOP
          IF v_sl IS NOT NULL THEN
            UPDATE profiles
            SET coins = coins + floor(v_pool * 0.05)::int
            WHERE id = v_sl;
          END IF;
        END LOOP;
      END IF;
    END IF;

    RETURN jsonb_build_object('success', true, 'tournament_completed', true);
  END IF;

  -- ── Not the final: advance winner to next round ────────────────────────────
  v_next_m := (v_match.match_number + 1) / 2;  -- ceil(m/2)
  v_is_odd := (v_match.match_number % 2) = 1;

  IF v_is_odd THEN
    UPDATE tournament_matches
    SET player1_id = p_winner_id,
        status     = CASE WHEN player2_id IS NOT NULL THEN 'ready' ELSE status END
    WHERE tournament_id  = v_match.tournament_id
      AND round          = v_match.round + 1
      AND match_number   = v_next_m;
  ELSE
    UPDATE tournament_matches
    SET player2_id = p_winner_id,
        status     = CASE WHEN player1_id IS NOT NULL THEN 'ready' ELSE status END
    WHERE tournament_id  = v_match.tournament_id
      AND round          = v_match.round + 1
      AND match_number   = v_next_m;
  END IF;

  RETURN jsonb_build_object('success', true, 'advanced', true);
END;
$func$;


-- ── 7. create_match_room ──────────────────────────────────────────────────────
-- Creates (or returns existing) a room for a tournament match.
-- Either match participant can call this.
-- Returns: { success, room_id } | { success: false, error }

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

  SELECT * INTO v_match FROM tournament_matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'match_not_found');
  END IF;

  -- Only participants may create the room
  IF v_caller <> v_match.player1_id AND v_caller <> v_match.player2_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_a_player');
  END IF;
  IF v_match.status <> 'ready' THEN
    RETURN jsonb_build_object('success', false, 'error', 'match_not_ready');
  END IF;

  -- Return existing room if already created
  IF v_match.room_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'room_id', v_match.room_id);
  END IF;

  SELECT * INTO v_tour FROM tournaments WHERE id = v_match.tournament_id;

  -- Generate unique room code
  LOOP
    v_code := '';
    FOR i IN 1..6 LOOP
      v_code := v_code || substr(v_chars, (floor(random() * length(v_chars)) + 1)::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM rooms WHERE code = v_code);
  END LOOP;

  -- Create the room
  INSERT INTO rooms (
    game_id, code, host_id,
    tournament_match_id,
    player_ids, player_names,
    player_wins, player_roles, player_ready,
    max_players, status
  )
  VALUES (
    v_tour.game_id,
    v_code,
    v_match.player1_id,
    p_match_id,
    jsonb_build_array(v_match.player1_id::text, v_match.player2_id::text),
    '{}'::jsonb,
    '{}'::jsonb,
    jsonb_build_object(
      v_match.player1_id::text, 'player',
      v_match.player2_id::text, 'player'
    ),
    '{}'::jsonb,
    2,
    'waiting'
  )
  RETURNING id INTO v_room_id;

  -- Link room back to the match
  UPDATE tournament_matches
  SET room_id = v_room_id
  WHERE id = p_match_id;

  RETURN jsonb_build_object('success', true, 'room_id', v_room_id);
END;
$func$;


-- ── 8. cancel_tournament ─────────────────────────────────────────────────────
-- Host-only. Cancels a registration-phase tournament and refunds all fees.
-- Returns: { success, refunded_count } | { success: false, error }

CREATE OR REPLACE FUNCTION cancel_tournament(p_tournament_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_caller        uuid := auth.uid();
  v_tour          tournaments%ROWTYPE;
  v_player_rec    RECORD;
  v_refunded      int := 0;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  SELECT * INTO v_tour FROM tournaments WHERE id = p_tournament_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'tournament_not_found');
  END IF;
  IF v_tour.host_id <> v_caller THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_host');
  END IF;
  IF v_tour.status NOT IN ('registration', 'active') THEN
    RETURN jsonb_build_object('success', false, 'error', 'cannot_cancel');
  END IF;

  -- Refund entry fees to each registered player
  FOR v_player_rec IN
    SELECT user_id, entry_fee_paid
    FROM tournament_players
    WHERE tournament_id = p_tournament_id AND entry_fee_paid > 0
  LOOP
    UPDATE profiles
    SET coins = coins + v_player_rec.entry_fee_paid
    WHERE id = v_player_rec.user_id;
    v_refunded := v_refunded + 1;
  END LOOP;

  -- Refund host seed
  IF v_tour.host_seed > 0 THEN
    UPDATE profiles
    SET coins = coins + v_tour.host_seed
    WHERE id = v_caller;
  END IF;

  UPDATE tournaments
  SET status = 'cancelled'
  WHERE id = p_tournament_id;

  RETURN jsonb_build_object(
    'success',        true,
    'refunded_count', v_refunded
  );
END;
$func$;


-- ── 9. join_as_spectator ──────────────────────────────────────────────────────
-- Adds a player_id (anonymous or auth) to a match room as a spectator.
-- p_pid is the client-side player_id string (not necessarily a UUID).
-- Returns: { success, room_id } | { success: false, error }

CREATE OR REPLACE FUNCTION join_as_spectator(p_room_id uuid, p_pid text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_room_status text;
  v_roles       jsonb;
BEGIN
  SELECT status, player_roles INTO v_room_status, v_roles
  FROM rooms WHERE id = p_room_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'room_not_found');
  END IF;
  IF v_room_status NOT IN ('waiting', 'playing') THEN
    RETURN jsonb_build_object('success', false, 'error', 'room_closed');
  END IF;

  -- Add spectator role if not already tracked
  IF NOT (v_roles ? p_pid) THEN
    UPDATE rooms
    SET player_roles = player_roles || jsonb_build_object(p_pid, 'spectator')
    WHERE id = p_room_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'room_id', p_room_id);
END;
$func$;
