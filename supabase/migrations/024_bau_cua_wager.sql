-- 024_bau_cua_wager.sql
-- Server-authoritative Bầu Cua Tôm Cá real-coin betting.
-- Run in the Supabase SQL Editor. Idempotent (safe to run multiple times).
--
-- The client sends ONLY the player's bets ({symbolKey: stake}). The server rolls
-- three dice, computes the payout, updates profiles.coins atomically under a row
-- lock, logs the net delta to the game_results ledger, and returns the dice +
-- new balance. The client can never assert a coin amount — mirrors the
-- 005/014/017 anti-cheat model (identity from auth.uid(), amounts derived
-- server-side, FOR UPDATE lock, GREATEST(0,...) clamp, session_key replay guard).

CREATE OR REPLACE FUNCTION bau_cua_roll(
  p_bets        jsonb,
  p_session_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid   := auth.uid();
  v_symbols text[] := ARRAY['nai','bau','ga','ca','cua','tom'];
  v_key     text;
  v_val     jsonb;
  v_stake   numeric;
  v_total   int := 0;
  v_bal     int;
  v_new     int;
  v_delta   int := 0;
  v_dice    text[] := ARRAY[]::text[];
  v_matches int;
  i         int;
  v_result  text;
BEGIN
  -- 1. Auth
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  -- 2. Validate bets: non-empty JSON object of {validSymbol: positive integer}
  IF p_bets IS NULL OR jsonb_typeof(p_bets) <> 'object' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_bets');
  END IF;

  FOR v_key, v_val IN SELECT key, value FROM jsonb_each(p_bets)
  LOOP
    IF NOT (v_key = ANY(v_symbols)) THEN
      RETURN jsonb_build_object('success', false, 'error', 'invalid_symbol');
    END IF;
    IF jsonb_typeof(v_val) <> 'number' THEN
      RETURN jsonb_build_object('success', false, 'error', 'invalid_stake');
    END IF;
    v_stake := (v_val::text)::numeric;
    IF v_stake <> floor(v_stake) OR v_stake <= 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'invalid_stake');
    END IF;
    v_total := v_total + v_stake::int;
  END LOOP;

  IF v_total <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'empty_bets');
  END IF;

  -- 3. Replay guard — idempotent success on a duplicate session_key
  IF EXISTS (SELECT 1 FROM game_results
             WHERE user_id = v_user_id AND session_key = p_session_key) THEN
    SELECT coins INTO v_new FROM profiles WHERE id = v_user_id;
    RETURN jsonb_build_object('success', true, 'replay', true,
                              'dice', to_jsonb(ARRAY[]::text[]),
                              'delta', 0, 'new_balance', v_new);
  END IF;

  -- 4. Lock the profile row; guard the missing-profiles-row gap (022)
  SELECT coins INTO v_bal FROM profiles WHERE id = v_user_id FOR UPDATE;
  IF v_bal IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_profile');
  END IF;

  -- 5. Affordability (worst case = every bet loses = -v_total)
  IF v_total > v_bal THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_coins',
                              'new_balance', v_bal);
  END IF;

  -- 6. Roll three dice server-side (client can never choose the outcome)
  FOR i IN 1..3 LOOP
    v_dice := array_append(v_dice, v_symbols[floor(random() * 6)::int + 1]);
  END LOOP;

  -- 7. Payout — MUST mirror the client showResults() exactly:
  --    per bet symbol: matches = 0 -> -stake ; matches > 0 -> +stake * matches
  FOR v_key, v_val IN SELECT key, value FROM jsonb_each(p_bets)
  LOOP
    v_stake   := (v_val::text)::numeric;
    v_matches := (SELECT count(*) FROM unnest(v_dice) d WHERE d = v_key);
    IF v_matches = 0 THEN
      v_delta := v_delta - v_stake::int;
    ELSE
      v_delta := v_delta + (v_stake::int * v_matches);
    END IF;
  END LOOP;

  -- 8. Atomic balance update (clamp at 0; cannot go negative since v_total <= v_bal)
  UPDATE profiles
  SET coins = GREATEST(0, coins + v_delta)
  WHERE id = v_user_id
  RETURNING coins INTO v_new;

  -- 9. Ledger row — result is binary per the CHECK constraint; coins_awarded is
  --    the NET delta (may be negative) so SUM(coins_awarded) still reconstructs balances.
  v_result := CASE WHEN v_delta >= 0 THEN 'win' ELSE 'loss' END;
  INSERT INTO game_results (user_id, game_id, result, coins_awarded, room_id, session_key)
  VALUES (v_user_id, 'bau-cua', v_result, v_delta, NULL, p_session_key);

  -- 10. Return authoritative dice + balance
  RETURN jsonb_build_object(
    'success',     true,
    'dice',        to_jsonb(v_dice),
    'delta',       v_delta,
    'new_balance', v_new
  );
END;
$$;

GRANT EXECUTE ON FUNCTION bau_cua_roll(jsonb, text) TO authenticated;
