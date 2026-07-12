-- 029_client_error_beacon.sql
-- Client-side error reporting (applied to the live project via MCP on 2026-07-06).
-- Browsers POST uncaught errors here via shared/error-beacon.js so breakage in
-- the wild is visible (30 games × many devices, no other signal before this).
--
-- Security model: the table has RLS enabled with NO policies and all client
-- grants revoked — nothing reads or writes it directly. The only write path is
-- the SECURITY DEFINER RPC below (validated, length-capped, globally
-- rate-limited to ~500 rows/hour); reads happen via the dashboard/MCP only.

create table if not exists public.client_errors (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  page       text not null,
  game_id    text,
  message    text not null,
  stack      text,
  ua         text
);

create index if not exists idx_client_errors_created on public.client_errors (created_at desc);

alter table public.client_errors enable row level security;
revoke all on public.client_errors from anon, authenticated;

create or replace function public.log_client_error(
  p_page    text,
  p_message text,
  p_stack   text default null,
  p_game_id text default null,
  p_ua      text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_page is null or length(trim(p_page)) = 0
     or p_message is null or length(trim(p_message)) = 0 then
    return false;
  end if;

  if (select count(*) from client_errors
      where created_at > now() - interval '1 hour') >= 500 then
    return false;
  end if;

  insert into client_errors (page, game_id, message, stack, ua)
  values (
    left(trim(p_page), 200),
    case when p_game_id ~ '^[a-z0-9-]{2,40}$' then p_game_id else null end,
    left(trim(p_message), 500),
    left(p_stack, 2000),
    left(p_ua, 300)
  );
  return true;
end;
$$;

grant execute on function public.log_client_error(text, text, text, text, text) to anon, authenticated;
