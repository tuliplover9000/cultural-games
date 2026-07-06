-- 028_delete_account.sql
-- Self-serve account deletion (applied to the live project via MCP on 2026-07-04).
-- The privacy policy promises deletion, so the capability must exist (GDPR/CCPA
-- right-to-erasure). The caller can only ever delete THEMSELVES — identity comes
-- from auth.uid() and the function takes no parameters.
--
-- Deleting the auth.users row cascades to ALL personal data — verified on the
-- live schema: profiles, favorites, stats, game_results, tournament_players,
-- tournament_spectators, tournaments(host_id), and every auth.* session/identity
-- table are all ON DELETE CASCADE. email_signups has no FK (keyed by email), so
-- it is cleared explicitly. game_plays is anonymous aggregate data and is
-- intentionally retained.
--
-- E2E-tested against a synthetic user: RPC returned success and left 0 rows in
-- auth.users / profiles / favorites / stats / game_results / email_signups.

create or replace function delete_account()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;

  select email into v_email from auth.users where id = v_uid;

  -- marketing/notify list rows are keyed by email, not user_id — clear explicitly
  if v_email is not null then
    delete from email_signups where lower(email) = lower(v_email);
  end if;

  -- cascades to all public.* and auth.* personal data (see header comment)
  delete from auth.users where id = v_uid;

  return jsonb_build_object('success', true);
end;
$$;

grant execute on function delete_account() to authenticated;
