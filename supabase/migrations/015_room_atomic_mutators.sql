-- Migration 015: Atomic room mutators (fix lost-update concurrency)
-- Run in the Supabase SQL Editor. Idempotent (safe to run more than once).
--
-- DRAFTED by the multiplayer pass — REVIEW before applying.
-- =============================================================================
--
-- PROBLEM
-- The lobby "list" columns on `rooms` (player_ready, suggestions, chat_messages)
-- are mutated by js/utils/room.js with a read-modify-write against the client's
-- LAST-SEEN cached row (_room), then a full-column UPDATE:
--
--     var msgs = (_room.chat_messages || []).slice(-199);
--     msgs.push({...});
--     authDb().from('rooms').update({ chat_messages: msgs }) ...
--
-- When two players write near-simultaneously, both read the same base array and
-- write back — last write wins, so one chat message / suggestion / ready-flip is
-- silently lost. Same race for player_ready and suggestions.
--
-- FIX
-- Move the append/remove into SECURITY DEFINER functions that operate on the
-- LIVE row value inside a single UPDATE, eliminating the read-modify-write gap.
-- room.js calls these via .rpc() and FALLS BACK to the old path on any error, so
-- this migration can be applied independently of the client (before it's applied,
-- the .rpc() calls error and the client behaves exactly as it does today).
--
-- TRUST MODEL
-- These are SECURITY DEFINER and therefore bypass RLS, matching the existing
-- room write model: guests have no auth identity, so room writes are already not
-- constrainable by RLS (see migration 014 §4). Each function is scoped to a
-- single room id and one narrow, append-only operation — no broader access than
-- the current open UPDATE path. They no-op on a finished/absent room.
-- =============================================================================


-- ── 1. Append a chat message (and trim to the most recent 200) ───────────────
CREATE OR REPLACE FUNCTION room_append_chat(p_room uuid, p_msg jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_arr jsonb;
BEGIN
  SELECT coalesce(chat_messages, '[]'::jsonb) || p_msg
    INTO v_arr
    FROM rooms
   WHERE id = p_room AND status <> 'finished';
  IF v_arr IS NULL THEN RETURN; END IF;                 -- room absent / finished
  -- Keep only the last 200 elements (mirrors the client's slice(-199)+push cap).
  IF jsonb_array_length(v_arr) > 200 THEN
    SELECT jsonb_agg(e ORDER BY ord)
      INTO v_arr
      FROM jsonb_array_elements(v_arr) WITH ORDINALITY AS t(e, ord)
     WHERE ord > jsonb_array_length(v_arr) - 200;
  END IF;
  UPDATE rooms SET chat_messages = v_arr WHERE id = p_room;
END;
$$;


-- ── 2. Add a game suggestion (append one object as a list element) ───────────
CREATE OR REPLACE FUNCTION room_add_suggestion(p_room uuid, p_sugg jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE rooms
     SET suggestions = coalesce(suggestions, '[]'::jsonb) || jsonb_build_array(p_sugg)
   WHERE id = p_room AND status <> 'finished';
END;
$$;


-- ── 3. Remove a suggestion by array index ────────────────────────────────────
CREATE OR REPLACE FUNCTION room_remove_suggestion(p_room uuid, p_idx int)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- jsonb `-` integer removes the element at that index (negative counts from end).
  UPDATE rooms
     SET suggestions = coalesce(suggestions, '[]'::jsonb) - p_idx
   WHERE id = p_room AND status <> 'finished';
END;
$$;


-- ── 4. Set one player's ready flag (merge into the player_ready map) ──────────
CREATE OR REPLACE FUNCTION room_set_ready(p_room uuid, p_pid text, p_ready boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE rooms
     SET player_ready = jsonb_set(
           coalesce(player_ready, '{}'::jsonb),
           array[p_pid],
           to_jsonb(p_ready),
           true)
   WHERE id = p_room AND status <> 'finished';
END;
$$;


-- Allow the app's anon + authenticated roles to call them over the REST API.
GRANT EXECUTE ON FUNCTION room_append_chat(uuid, jsonb)       TO anon, authenticated;
GRANT EXECUTE ON FUNCTION room_add_suggestion(uuid, jsonb)    TO anon, authenticated;
GRANT EXECUTE ON FUNCTION room_remove_suggestion(uuid, int)   TO anon, authenticated;
GRANT EXECUTE ON FUNCTION room_set_ready(uuid, text, boolean) TO anon, authenticated;
