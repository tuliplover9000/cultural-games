-- 037_anonymous_finish_counts.sql
-- Count FINISHED games from every visitor, not just signed-in ones.
--
-- WHY: game_results only ever receives a row from a signed-in player —
-- recordResult() returns early at `if (!_user || !_accessToken)` before the
-- server write. Most traffic is logged out, so a finish by an anonymous
-- visitor was invisible. That is what made "24 of 30 games have never been
-- finished" look like mass abandonment: for the games nobody signs in to play,
-- the finish count could only ever be zero. This gives an honest denominator.
--
-- Deliberately NOT routed through game_results:
--   * that table carries per-user identity, coins and the anti-replay
--     UNIQUE(user_id, session_key) — none of which an anon finish has;
--   * migration 030's enforce_result_rate_limit BEFORE INSERT trigger sits on
--     it (30 s per user), so anon writes would be dropped or would need yet
--     another exemption.
-- Instead this extends the existing open-counter (game_plays), which is
-- already the "raw, anonymous, non-sensitive social proof" table.
--
-- Same safety pattern as 031: SECURITY DEFINER, pinned search_path, and
-- UPDATE-only over the pre-seeded whitelist so an anon caller cannot create
-- junk rows. Inflating a real game's counter by hammering a valid id is
-- inherent to an open counter and accepted here — these are vanity/health
-- metrics, never coins or rankings.
--
-- Idempotent: safe to run more than once.
-- NEW GAMES: seed the id in game_plays (see 031 / the new-game checklist).

alter table public.game_plays
  add column if not exists finishes bigint not null default 0,
  add column if not exists wins     bigint not null default 0,
  add column if not exists losses   bigint not null default 0,
  add column if not exists draws    bigint not null default 0;

-- Increment-and-return. Returns the new finish total, or null when the id is
-- not a seeded game or the outcome is not one we accept.
create or replace function public.bump_game_finish(p_game_id text, p_outcome text)
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
     set finishes   = finishes + 1,
         wins       = wins   + (case when p_outcome = 'win'  then 1 else 0 end),
         losses     = losses + (case when p_outcome = 'loss' then 1 else 0 end),
         draws      = draws  + (case when p_outcome = 'draw' then 1 else 0 end),
         updated_at = now()
   where game_id = p_game_id
  returning finishes into v_finishes;

  return v_finishes;   -- null if the id is not a seeded real game
end;
$$;

grant execute on function public.bump_game_finish(text, text) to anon, authenticated;
