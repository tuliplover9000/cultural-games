-- 038_finish_metrics_and_valid_games.sql
-- Follow-up to 037, fixing three problems found in review.
--
-- (1) record_game_result's v_valid_games whitelist lists only 19 of the 30
--     games, so ELEVEN games were rejected with 'invalid_game' even for a
--     signed-in player: bagh-chal, cuarenta, dou-shou-qi, durak, konane,
--     morabaraba, mu-torere, scopa, surakarta, tsoro-yematatu, yut-nori.
--     The client only reacts to `data.success`, so the rejection was silent —
--     which is why fixing cuarenta/scopa/durak's client call in 84432e0 still
--     recorded nothing server-side. The list is now derived from game_plays
--     (the seeded catalogue from 031) instead of being hand-maintained, so it
--     cannot drift again.
--
-- (2) 037's `finishes` counts every completed game while `plays` (after the
--     session dedupe added alongside it) counts unique sessions. Dividing the
--     two is meaningless and can exceed 100% — one visitor finishing five
--     matches in a session is 1 play and 5 finishes. finish_sessions counts
--     SESSIONS in which at least one game was finished, so
--     finish_sessions / plays is a real completion rate bounded by 100%.
--
--     Semantics, to be read together:
--       plays           unique browser sessions that OPENED the game
--       finish_sessions unique browser sessions that FINISHED >= 1 game
--       finishes        total games finished (per player, so an online game
--                       with two seats counts two player-finishes)
--       wins/losses/draws  breakdown of `finishes`
--     Use finish_sessions/plays for "do people finish?"; never finishes/plays.
--
-- (3) `draw` is accepted by bump_game_finish but record_game_result rejects
--     anything other than win|loss. That stays true — draws award no coins and
--     write no game_results row — but they are no longer lost from the finish
--     counter, which is what makes a drawn game look like an abandoned one.
--
-- Idempotent. Applied to prod via MCP on 2026-08-04.

alter table public.game_plays
  add column if not exists finish_sessions bigint not null default 0;

-- ── (1) whitelist derived from the seeded catalogue ────────────────────────
create or replace function public.record_game_result(
  p_game_id text, p_result text, p_session_key text, p_room_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
DECLARE
  v_user_id     uuid := auth.uid();
  v_long_games  text[] := ARRAY['mahjong','tien-len','pachisi','ganjifa'];
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

  -- The catalogue is game_plays (seeded in 031). Deriving the valid-game list
  -- from it means shipping a new game can no longer leave results silently
  -- rejected by a stale hand-written array.
  IF NOT EXISTS (SELECT 1 FROM game_plays WHERE game_id = p_game_id) THEN
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
  v_total_coins := v_base_coins;

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

-- ── (2) finish counter, now with a session-level tally ─────────────────────
create or replace function public.bump_game_finish(
  p_game_id text, p_outcome text, p_new_session boolean default false
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_finishes bigint;
begin
  if p_game_id is null then
    return null;
  end if;
  if p_outcome is null or p_outcome not in ('win', 'loss', 'draw') then
    return null;
  end if;

  update game_plays
     set finishes        = finishes + 1,
         wins            = wins   + (case when p_outcome = 'win'  then 1 else 0 end),
         losses          = losses + (case when p_outcome = 'loss' then 1 else 0 end),
         draws           = draws  + (case when p_outcome = 'draw' then 1 else 0 end),
         finish_sessions = finish_sessions + (case when p_new_session then 1 else 0 end),
         updated_at      = now()
   where game_id = p_game_id
  returning finishes into v_finishes;

  return v_finishes;   -- null if the id is not a seeded real game
end;
$$;

grant execute on function public.bump_game_finish(text, text, boolean) to anon, authenticated;

-- 037's 2-arg signature would otherwise linger and be picked by old cached JS.
drop function if exists public.bump_game_finish(text, text);
