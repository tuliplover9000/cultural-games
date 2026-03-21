-- Migration 005: Server-side coin & stats validation
-- Run in Supabase SQL Editor.
-- Safe to run multiple times (IF NOT EXISTS / OR REPLACE guards throughout).

-- ── 1. game_results ledger ────────────────────────────────────────────────────
-- Immutable log of every legitimate game result. Used to validate coin awards
-- and prevent duplicate submissions (replay attacks).

CREATE TABLE IF NOT EXISTS game_results (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  game_id       text NOT NULL,
  result        text NOT NULL CHECK (result IN ('win', 'loss')),
  coins_awarded int  NOT NULL DEFAULT 0,
  room_id       uuid REFERENCES rooms(id) ON DELETE SET NULL,
  session_key   text NOT NULL,
  created_at    timestamptz DEFAULT now(),
  UNIQUE (user_id, session_key)   -- one award per session key per user
);

ALTER TABLE game_results ENABLE ROW LEVEL SECURITY;

-- Players can read their own results (e.g. for future history page)
DROP POLICY IF EXISTS "owner read game_results" ON game_results;
CREATE POLICY "owner read game_results" ON game_results
  FOR SELECT USING (auth.uid() = user_id);
-- No INSERT/UPDATE/DELETE policies — only the SECURITY DEFINER function can write

CREATE INDEX IF NOT EXISTS idx_game_results_user_game_time
  ON game_results(user_id, game_id, created_at DESC);


-- ── 2. record_game_result() — the only legitimate path to earning coins ───────
-- Validates game ID and result, prevents duplicate submissions, upserts stats,
-- resolves room bets, and updates profiles.coins atomically.
-- SECURITY DEFINER: runs as DB owner, bypasses RLS for the internal writes.

CREATE OR REPLACE FUNCTION record_game_result(
  p_game_id     text,
  p_result      text,
  p_session_key text,
  p_room_id     uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id    uuid := auth.uid();
  v_long_games text[] := ARRAY['mahjong','tien-len','pachisi','ganjifa'];
  v_valid_games text[] := ARRAY[
    'tien-len','bau-cua','o-an-quan','oware','patolli',
    'puluc','pallanguzhi','fanorona','hnefatafl','mahjong',
    'pachisi','ganjifa','latrunculi'
  ];
  v_base_coins  int := 0;
  v_bet_coins   int := 0;
  v_total_coins int := 0;
  v_room_bets   jsonb;
  v_my_bet      numeric := 0;
  v_new_balance int;
BEGIN
  -- Auth check
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  -- Validate result
  IF p_result NOT IN ('win', 'loss') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_result');
  END IF;

  -- Validate game ID
  IF NOT (p_game_id = ANY(v_valid_games)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_game');
  END IF;

  -- Prevent duplicate submission (idempotent — return current balance, no error)
  IF EXISTS (
    SELECT 1 FROM game_results
    WHERE user_id = v_user_id AND session_key = p_session_key
  ) THEN
    SELECT coins INTO v_new_balance FROM profiles WHERE id = v_user_id;
    RETURN jsonb_build_object('success', true, 'coins_awarded', 0, 'new_balance', v_new_balance);
  END IF;

  -- Compute base coin award
  IF p_game_id = ANY(v_long_games) THEN
    v_base_coins := CASE p_result WHEN 'win' THEN 500 WHEN 'loss' THEN 150 ELSE 0 END;
  ELSE
    v_base_coins := CASE p_result WHEN 'win' THEN 100 ELSE 0 END;
  END IF;

  -- Resolve room bet if room_id provided
  IF p_room_id IS NOT NULL THEN
    SELECT bets INTO v_room_bets FROM rooms WHERE id = p_room_id;
    IF v_room_bets IS NOT NULL THEN
      v_my_bet := COALESCE((v_room_bets ->> v_user_id::text)::numeric, 0);
      IF v_my_bet > 0 THEN
        v_bet_coins := CASE p_result
          WHEN 'win'  THEN  (v_my_bet * 2)::int
          WHEN 'loss' THEN -(v_my_bet::int)
          ELSE 0
        END;
      END IF;
    END IF;
  END IF;

  v_total_coins := v_base_coins + v_bet_coins;

  -- Upsert stats
  INSERT INTO stats (user_id, game_id, wins, losses, played)
  VALUES (
    v_user_id, p_game_id,
    CASE p_result WHEN 'win'  THEN 1 ELSE 0 END,
    CASE p_result WHEN 'loss' THEN 1 ELSE 0 END,
    1
  )
  ON CONFLICT (user_id, game_id) DO UPDATE SET
    wins   = stats.wins   + CASE p_result WHEN 'win'  THEN 1 ELSE 0 END,
    losses = stats.losses + CASE p_result WHEN 'loss' THEN 1 ELSE 0 END,
    played = stats.played + 1;

  -- Update coins atomically (floor at 0)
  UPDATE profiles
  SET coins = GREATEST(0, coins + v_total_coins)
  WHERE id = v_user_id;

  -- Log the result
  INSERT INTO game_results (user_id, game_id, result, coins_awarded, room_id, session_key)
  VALUES (v_user_id, p_game_id, p_result, v_total_coins, p_room_id, p_session_key);

  -- Return server-confirmed balance
  SELECT coins INTO v_new_balance FROM profiles WHERE id = v_user_id;
  RETURN jsonb_build_object(
    'success',       true,
    'coins_awarded', v_total_coins,
    'new_balance',   v_new_balance
  );
END;
$$;


-- ── 3. Lock down profiles.coins from direct client writes ─────────────────────
-- Clients can still update their own profile row (e.g. username changes),
-- but any attempt to change the coins value is rejected.
-- The SECURITY DEFINER function above bypasses this policy, so server-side
-- coin updates still work correctly.

DROP POLICY IF EXISTS "own update" ON profiles;
CREATE POLICY "own update" ON profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    -- coins must not change via direct client write
    AND coins = (SELECT coins FROM profiles WHERE id = auth.uid())
  );


-- ── 4. Lock down stats from direct client UPDATE ──────────────────────────────
-- All stat updates now go through record_game_result() SECURITY DEFINER.
-- INSERT is kept so signUp() can initialise stat rows.
-- SELECT is kept for profile/leaderboard reads.

DROP POLICY IF EXISTS "own update" ON stats;
