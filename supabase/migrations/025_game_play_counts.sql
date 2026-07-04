-- 025_game_play_counts.sql
-- Per-game "played N times" counter (raw opens, all visitors including anonymous).
-- Run in the Supabase SQL Editor. Idempotent (safe to run multiple times).
-- NOTE: already applied to the live project (pnyvlqgllrpslhgimgve) via MCP on
-- 2026-07-04; this file exists for version control / reproducibility.
--
-- Counts increment ONLY through the SECURITY DEFINER RPC (clients can't write
-- the table directly under RLS). The table is publicly readable — the numbers
-- are non-sensitive social proof and may be shown on browse/game pages.

create table if not exists public.game_plays (
  game_id    text primary key,
  plays      bigint not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.game_plays enable row level security;

drop policy if exists "game_plays_public_read" on public.game_plays;
create policy "game_plays_public_read" on public.game_plays
  for select using (true);

grant select on public.game_plays to anon, authenticated;

-- Increment-and-return. Format-validates the id so the table can't be spammed
-- with arbitrary rows. Granted to anon so logged-out opens count too. Returns
-- the new total, or null for a malformed id.
create or replace function public.bump_game_play(p_game_id text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plays bigint;
begin
  if p_game_id is null or p_game_id !~ '^[a-z0-9-]{2,40}$' then
    return null;
  end if;

  insert into public.game_plays (game_id, plays)
    values (p_game_id, 1)
  on conflict (game_id) do update
    set plays = game_plays.plays + 1,
        updated_at = now()
  returning plays into v_plays;

  return v_plays;
end;
$$;

grant execute on function public.bump_game_play(text) to anon, authenticated;
