-- Cultural Games — Room Names
-- Add optional room_name column so hosts can give rooms a custom name.
ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS room_name text;
