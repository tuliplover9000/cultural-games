-- Migration 002: favorites table
-- Run this in the Supabase SQL Editor.

create table if not exists favorites (
  user_id  uuid references auth.users(id) on delete cascade,
  game_key text not null,
  primary key (user_id, game_key)
);

alter table favorites enable row level security;

create policy "own read"   on favorites for select using (auth.uid() = user_id);
create policy "own insert" on favorites for insert with check (auth.uid() = user_id);
create policy "own delete" on favorites for delete using (auth.uid() = user_id);
