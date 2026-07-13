-- 036_room_cleanup_reaper.sql
-- Applied to prod via MCP on 2026-07-06.
--
-- FIX (deep review): abandoned rooms were never cleaned up — 221 stale rooms had
-- accumulated on prod; the expires_at column (creation + 4h) existed but nothing
-- acted on it. Adds a SECURITY DEFINER reaper + a pg_cron job that deletes expired
-- rooms every 15 minutes. Room FKs (game_results.room_id, tournament_matches.room_id)
-- are ON DELETE SET NULL, so reaping a room never cascades away game/match history.
--
-- LIMITATION (follow-up): expires_at is fixed at creation + 4h and is NOT extended
-- on activity, so a single continuous >4h session could be reaped mid-game (rare
-- for casual board games). Activity-based expiry belongs with the presence/heartbeat
-- work in the next online-reliability pass.
--
-- Verified: cleanup_expired_rooms() reaped all 221 expired rooms (0 remaining);
-- cron job 'cleanup-expired-rooms' registered at '*/15 * * * *'.

create extension if not exists pg_cron;

create or replace function public.cleanup_expired_rooms()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_deleted integer;
begin
  delete from public.rooms where expires_at < now();
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- schedule every 15 min (idempotent: drop any prior job of this name first)
do $$
declare j bigint;
begin
  for j in select jobid from cron.job where jobname = 'cleanup-expired-rooms' loop
    perform cron.unschedule(j);
  end loop;
end $$;

select cron.schedule('cleanup-expired-rooms', '*/15 * * * *', $$ select public.cleanup_expired_rooms(); $$);
