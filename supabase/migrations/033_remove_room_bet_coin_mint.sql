-- 033_remove_room_bet_coin_mint.sql
-- Applied to prod via MCP on 2026-07-06.
--
-- SECURITY FIX (deep online/tournament review, CRITICAL): record_game_result paid
-- 2x a room bet on a CLIENT-ASSERTED 'win', where the bet amount is read from
-- rooms.bets — a client-writable, un-escrowed jsonb (rooms RLS is open). An
-- attacker set a huge bet, claimed 'win', and minted unbounded coins.
--
-- Removed the room-bet payout branch entirely: room games now pay ONLY the base
-- reward (already rate-limited by the enforce_result_rate_limit trigger, ~1 per
-- 30s). p_room_id is still logged in game_results for the audit trail. Everything
-- else in the function is identical to the prior prod definition.
--
-- FOLLOW-UP (roadmap): real-coin room betting must be rebuilt server-authoritative
-- (coins escrowed on bet + a server-verified winner) before any bet payout returns
-- — the same pattern used for bau_cua_roll.
--
-- Verified against prod with a synthetic user: a room with a 1,000,000 bet + a
-- 'win' claim paid only the 100 base reward (not 2,000,100).

CREATE OR REPLACE FUNCTION public.record_game_result(p_game_id text, p_result text, p_session_key text, p_room_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id     uuid := auth.uid();
  v_long_games  text[] := ARRAY['mahjong','tien-len','pachisi','ganjifa'];
  v_valid_games text[] := ARRAY[
    'tien-len','bau-cua','o-an-quan','oware','patolli',
    'puluc','pallanguzhi','fanorona','hnefatafl','mahjong',
    'pachisi','ganjifa','latrunculi','cachos',
    'xinjiang-fangqi','filipino-dama','yote','senet','truc'
  ];
  v_base_coins  int := 0;
  v_total_coins int := 0;
  v_new_balance int;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  IF p_result NOT IN ('win', 'loss') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_result');
  END IF;

  IF NOT (p_game_id = ANY(v_valid_games)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_game');
  END IF;

  IF EXISTS (SELECT 1 FROM game_results WHERE user_id = v_user_id AND session_key = p_session_key) THEN
    SELECT coins INTO v_new_balance FROM profiles WHERE id = v_user_id;
    RETURN jsonb_build_object('success', true, 'coins_awarded', 0, 'new_balance', v_new_balance);
  END IF;

  IF p_game_id = ANY(v_long_games) THEN
    v_base_coins := CASE p_result WHEN 'win' THEN 500 WHEN 'loss' THEN 150 ELSE 0 END;
  ELSE
    v_base_coins := CASE p_result WHEN 'win' THEN 100 ELSE 0 END;
  END IF;
  v_total_coins := v_base_coins;   -- room-bet payout removed (see header)

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

  UPDATE profiles
  SET coins = GREATEST(0, coins + v_total_coins)
  WHERE id = v_user_id;

  INSERT INTO game_results (user_id, game_id, result, coins_awarded, room_id, session_key)
  VALUES (v_user_id, p_game_id, p_result, v_total_coins, p_room_id, p_session_key);

  SELECT coins INTO v_new_balance FROM profiles WHERE id = v_user_id;
  RETURN jsonb_build_object('success', true, 'coins_awarded', v_total_coins, 'new_balance', v_new_balance);
END;
$function$;
