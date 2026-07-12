-- 031_play_count_whitelist.sql
-- Applied to prod via MCP on 2026-07-06.
--
-- FIX (xhigh code review finding 6): bump_game_play's format-only regex let any
-- anon caller (the public anon key ships in every page) INSERT unbounded junk
-- rows into the publicly-readable game_plays table via its ON CONFLICT upsert.
-- Switch to UPDATE-only over a pre-seeded whitelist of the real game ids — an
-- unknown id now matches zero rows and returns null instead of creating a
-- permanent row. (Inflating a real game's counter by hammering a valid id is
-- inherent to an anon counter and accepted for a vanity metric; the storage-
-- abuse vector is what this closes.)
--
-- Idempotent: the seed uses ON CONFLICT DO NOTHING so existing real counts are
-- preserved. NEW GAMES: add the game's id here (or a one-off
-- `insert into game_plays(game_id, plays) values ('<id>',0) on conflict do nothing`)
-- when shipping it — see the new-game checklist.

insert into public.game_plays (game_id, plays) values
  ('bagh-chal',0),('bau-cua',0),('cuarenta',0),('dou-shou-qi',0),('durak',0),
  ('fanorona',0),('ganjifa',0),('hnefatafl',0),('konane',0),('latrunculi',0),
  ('mahjong',0),('morabaraba',0),('mu-torere',0),('o-an-quan',0),('oware',0),
  ('pachisi',0),('pallanguzhi',0),('patolli',0),('puluc',0),('scopa',0),
  ('senet',0),('surakarta',0),('tien-len',0),('truc',0),('tsoro-yematatu',0),
  ('yote',0),('yut-nori',0),('cachos',0),('filipino-dama',0),('xinjiang-fangqi',0)
on conflict (game_id) do nothing;

create or replace function public.bump_game_play(p_game_id text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plays bigint;
begin
  if p_game_id is null then
    return null;
  end if;
  -- UPDATE-only: unknown ids match no row → no junk rows can be created
  update game_plays
    set plays = plays + 1, updated_at = now()
    where game_id = p_game_id
    returning plays into v_plays;
  return v_plays;  -- null if the id is not a seeded real game
end;
$$;

grant execute on function public.bump_game_play(text) to anon, authenticated;
