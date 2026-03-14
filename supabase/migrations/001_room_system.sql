-- =============================================================================
-- Cultural Games — Room System v2 Migration
-- Run this in the Supabase dashboard SQL editor.
-- Safe to run multiple times (IF NOT EXISTS / IF EXISTS guards throughout).
-- =============================================================================

-- Extend the existing rooms table
ALTER TABLE rooms
  -- Allow longer codes (6-char alphanumeric like "BIRD42")
  ALTER COLUMN code TYPE text,

  -- Ordered player array (up to 4 player IDs)
  ADD COLUMN IF NOT EXISTS player_ids     jsonb        DEFAULT '[]'::jsonb,

  -- Display name per player_id: { "p123abc": "Alice" }
  ADD COLUMN IF NOT EXISTS player_names   jsonb        DEFAULT '{}'::jsonb,

  -- Cumulative win counter: { "p123abc": 3 }
  ADD COLUMN IF NOT EXISTS player_wins    jsonb        DEFAULT '{}'::jsonb,

  -- Role per player: { "p123abc": "player" | "spectator" }
  ADD COLUMN IF NOT EXISTS player_roles   jsonb        DEFAULT '{}'::jsonb,

  -- Ready state: { "p123abc": true }
  ADD COLUMN IF NOT EXISTS player_ready   jsonb        DEFAULT '{}'::jsonb,

  -- Suggestion queue: [{game, suggested_by, name, ts}]
  ADD COLUMN IF NOT EXISTS suggestions    jsonb        DEFAULT '[]'::jsonb,

  -- Lobby selection mode: 'host-pick' | 'lottery'
  ADD COLUMN IF NOT EXISTS lobby_mode     text         DEFAULT 'host-pick',

  -- Game selected by host (after pick or lottery)
  ADD COLUMN IF NOT EXISTS selected_game  text,

  -- Whether to run two simultaneous game instances
  ADD COLUMN IF NOT EXISTS dual_instance  boolean      DEFAULT false,

  -- Game instance state(s): [{instance_id, player_assignments, board_state, status, winner_pid}]
  ADD COLUMN IF NOT EXISTS game_instances jsonb        DEFAULT '[]'::jsonb,

  -- Chat log (capped at 200 entries): [{pid, name, text, ts}]
  ADD COLUMN IF NOT EXISTS chat_messages  jsonb        DEFAULT '[]'::jsonb,

  -- Max players for this room
  ADD COLUMN IF NOT EXISTS max_players    int          DEFAULT 4,

  -- Auto-expire after 4 hours
  ADD COLUMN IF NOT EXISTS expires_at     timestamptz  DEFAULT (now() + interval '4 hours');

-- Ensure unique index on code (may already exist)
CREATE UNIQUE INDEX IF NOT EXISTS rooms_code_idx ON rooms(code);

-- Optional: clean up expired rooms automatically
-- (Requires pg_cron extension. Enable in Supabase dashboard → Database → Extensions)
-- SELECT cron.schedule('cleanup-rooms', '0 * * * *',
--   $$DELETE FROM rooms WHERE expires_at < now()$$
-- );

-- =============================================================================
-- RLS policies (adjust to match your existing setup)
-- These assume anon role can read/update rooms they are a participant of.
-- =============================================================================

-- Allow anyone to read any room (needed for join-by-code lookup)
-- CREATE POLICY "rooms_read" ON rooms FOR SELECT USING (true);

-- Allow anyone to insert a room (host creates)
-- CREATE POLICY "rooms_insert" ON rooms FOR INSERT WITH CHECK (true);

-- Allow anyone to update a room (participants update state)
-- CREATE POLICY "rooms_update" ON rooms FOR UPDATE USING (true);
