-- 030_exempt_bau_cua_from_rate_limit.sql
-- Applied to prod via MCP on 2026-07-06.
--
-- FIX (found by xhigh code review of the bau_cua_roll rollout): the game_results
-- BEFORE-INSERT trigger `enforce_result_rate_limit` — a 30s anti-farming window
-- that existed ONLY in prod (no migration created it; this file now documents
-- and owns it) — had NO game filter. Bau Cua's server-authoritative wager RPC
-- (bau_cua_roll) writes a game_results row per roll, so every second real-coin
-- roll within 30s aborted with 'rate_limited', making the feature unusable; it
-- also blocked record_game_result for ANY other game finished within 30s of a
-- wager (a cross-game coin forfeit).
--
-- Bau Cua wagers are NOT claimable win-reports — bau_cua_roll rolls the dice and
-- computes the payout server-side (~7.9% house edge, negative EV, no farming
-- benefit) — so the anti-farming window does not apply. Exempt game_id='bau-cua'
-- both as the row being inserted AND from the counted history. Real-game
-- win-claim farming (two rewarded games <30s apart) stays blocked. Wagers remain
-- in game_results, so ensure_profile's SUM(coins_awarded) balance reconstruction
-- (migration 022) is unaffected.
--
-- Verified against prod with a synthetic user: 3 consecutive wager rolls all
-- succeed; a real game immediately after a wager succeeds; a 2nd real game <30s
-- later is still blocked. Idempotent.

create or replace function public._enforce_result_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
  begin
    -- server-authoritative wagers are exempt (not a claimable win)
    if new.game_id = 'bau-cua' then
      return new;
    end if;
    if exists (
      select 1 from game_results
      where user_id = new.user_id
        and game_id <> 'bau-cua'
        and created_at > now() - interval '30 seconds'
    ) then
      raise exception 'rate_limited'
        using errcode = 'P0001',
              hint    = 'Wait 30 seconds between game results.';
    end if;
    return new;
  end;
$$;
