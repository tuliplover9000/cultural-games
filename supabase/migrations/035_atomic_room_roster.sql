-- 035_atomic_room_roster.sql
-- FIX (deep review): room join/leave/rejoin were unserialized client-side
-- read-modify-write full-column updates (js/utils/room.js). Concurrent joins
-- read the same player_ids, both write, and one joiner is silently dropped;
-- capacity overfills; a leave built from a stale cache clobbers a fresh joiner.
--
-- These SECURITY DEFINER mutators append/remove a player against the LIVE row
-- under a FOR UPDATE lock (mirroring room_set_ready / room_append_chat from
-- migration 015), so concurrent calls serialize and no update is lost. Rooms
-- identify players by a client-supplied text pid (guests have no auth.uid()),
-- so pid is a parameter — this fixes CONCURRENCY, not authorization (the coin
-- exploits were closed separately in 033/034). Granted to anon + authenticated.
-- Idempotent; re-adding an existing pid just refreshes their name/avatar.

-- ── room_add_player ──────────────────────────────────────────────────────────
create or replace function public.room_add_player(
  p_room_id uuid,
  p_pid     text,
  p_name    text,
  p_avatar  jsonb default null,
  p_title   text  default null,
  p_role    text  default 'player'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.rooms%rowtype;
begin
  if p_pid is null or length(p_pid) = 0 then
    return jsonb_build_object('success', false, 'error', 'bad_pid');
  end if;

  select * into r from public.rooms where id = p_room_id for update;
  if not found then
    return jsonb_build_object('success', false, 'error', 'not_found');
  end if;
  if r.status = 'finished' then
    return jsonb_build_object('success', false, 'error', 'room_ended');
  end if;

  -- capacity only blocks a genuinely NEW player
  if not (coalesce(r.player_ids, '[]'::jsonb) ? p_pid)
     and jsonb_array_length(coalesce(r.player_ids, '[]'::jsonb)) >= coalesce(r.max_players, 4) then
    return jsonb_build_object('success', false, 'error', 'room_full');
  end if;

  update public.rooms set
    player_ids = case when coalesce(player_ids, '[]'::jsonb) ? p_pid
                      then player_ids
                      else coalesce(player_ids, '[]'::jsonb) || to_jsonb(p_pid) end,
    player_names   = coalesce(player_names, '{}'::jsonb) || jsonb_build_object(p_pid, p_name),
    player_avatars = case when p_avatar is not null
                          then coalesce(player_avatars, '{}'::jsonb) || jsonb_build_object(p_pid, p_avatar)
                          else coalesce(player_avatars, '{}'::jsonb) end,
    player_titles  = case when p_title is not null
                          then coalesce(player_titles, '{}'::jsonb) || jsonb_build_object(p_pid, to_jsonb(p_title))
                          else coalesce(player_titles, '{}'::jsonb) end,
    player_wins  = coalesce(player_wins, '{}'::jsonb)  || (case when coalesce(player_wins, '{}'::jsonb)  ? p_pid then '{}'::jsonb else jsonb_build_object(p_pid, 0) end),
    player_roles = coalesce(player_roles, '{}'::jsonb) || (case when coalesce(player_roles, '{}'::jsonb) ? p_pid then '{}'::jsonb else jsonb_build_object(p_pid, coalesce(p_role, 'player')) end),
    player_ready = coalesce(player_ready, '{}'::jsonb) || (case when coalesce(player_ready, '{}'::jsonb) ? p_pid then '{}'::jsonb else jsonb_build_object(p_pid, false) end),
    guest_id = p_pid,
    status   = case when status = 'waiting' then 'lobby' else status end
  where id = p_room_id
  returning * into r;

  return jsonb_build_object('success', true, 'room', to_jsonb(r));
end;
$$;

-- ── room_remove_player ───────────────────────────────────────────────────────
create or replace function public.room_remove_player(
  p_room_id uuid,
  p_pid     text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r         public.rooms%rowtype;
  v_ids     jsonb;
  v_remain  int;
begin
  if p_pid is null then
    return jsonb_build_object('success', false, 'error', 'bad_pid');
  end if;

  select * into r from public.rooms where id = p_room_id for update;
  if not found then
    return jsonb_build_object('success', false, 'error', 'not_found');
  end if;

  v_ids := coalesce(
    (select jsonb_agg(e) from jsonb_array_elements(coalesce(r.player_ids, '[]'::jsonb)) e
      where e <> to_jsonb(p_pid)),
    '[]'::jsonb);
  v_remain := jsonb_array_length(v_ids);

  if r.host_id = p_pid then
    if v_remain > 0 then
      -- host migration: promote the next remaining player
      update public.rooms set player_ids = v_ids, host_id = (v_ids ->> 0)
        where id = p_room_id returning * into r;
    else
      -- last player out: close the room
      update public.rooms set player_ids = v_ids, status = 'finished'
        where id = p_room_id returning * into r;
    end if;
  else
    update public.rooms set player_ids = v_ids
      where id = p_room_id returning * into r;
  end if;

  return jsonb_build_object('success', true, 'room', to_jsonb(r));
end;
$$;

grant execute on function public.room_add_player(uuid, text, text, jsonb, text, text) to anon, authenticated;
grant execute on function public.room_remove_player(uuid, text) to anon, authenticated;
