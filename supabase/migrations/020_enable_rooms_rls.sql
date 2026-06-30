-- Migration 020: Enable RLS on `rooms`  (resolves Supabase "rls_disabled_in_public")
-- Run in the Supabase SQL Editor. Idempotent (safe to run more than once).
--
-- WHY
-- Supabase Security Advisor flagged `rooms` as "Table publicly accessible": RLS
-- was never enabled (migration 001 left its policies commented out), so anyone
-- with the project URL + the public anon key — which necessarily ships in the
-- client — can read, edit, AND delete every row in the table.
--
-- TRUST MODEL (why the policies below are permissive, not auth.uid()-scoped)
-- Room players are identified by a CLIENT-generated player_id, NOT auth.uid()
-- (guests play without accounts). So room reads/writes cannot be constrained by
-- RLS identity without breaking guest play — see migration 014 §4. The client
-- (js/utils/room.js, js/utils/multiplayer.js) does direct SELECT / INSERT / UPDATE
-- on rooms and NEVER deletes a room (leaveRoom UPDATEs to status='finished' or
-- migrates the host; rows expire via expires_at + server-side cleanup).
--
-- WHAT THIS DOES
-- Enable RLS and add permissive SELECT / INSERT / UPDATE policies so the app keeps
-- working, but deliberately add NO DELETE policy. With RLS on and no delete policy,
-- the anon + authenticated roles can no longer DELETE — so a holder of the anon
-- key can't wipe the table, the most destructive attack the advisor warns about.
-- This clears the CRITICAL rls_disabled_in_public finding.
--
-- RESIDUAL LIMITATION + the real long-term fix
-- Reads and updates remain open to anyone with the anon key — inherent to the
-- anonymous-guest room model and unchanged from how the app behaves today. The
-- robust fix is to route every mutating room op through SECURITY DEFINER RPCs that
-- validate the caller is a listed participant (mirroring the coin system and the
-- migration 015 mutators), then drop the open INSERT/UPDATE policies. That is an
-- architectural change (client + DB) for a deliberate pass; THIS migration is the
-- safe immediate mitigation for the security alert.
-- =============================================================================

ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

-- Read: anyone may read any room (needed for join-by-code lookup + realtime sync).
DROP POLICY IF EXISTS "rooms_public_read" ON public.rooms;
CREATE POLICY "rooms_public_read" ON public.rooms
  FOR SELECT USING (true);

-- Insert: anyone may create a room (host create — guests have no auth identity).
DROP POLICY IF EXISTS "rooms_public_insert" ON public.rooms;
CREATE POLICY "rooms_public_insert" ON public.rooms
  FOR INSERT WITH CHECK (true);

-- Update: anyone may update a room (participants sync game state / lobby state).
DROP POLICY IF EXISTS "rooms_public_update" ON public.rooms;
CREATE POLICY "rooms_public_update" ON public.rooms
  FOR UPDATE USING (true) WITH CHECK (true);

-- NB: intentionally NO "FOR DELETE" policy. Clients never delete rooms, so with
-- RLS enabled the anon/authenticated roles are denied DELETE by default — this
-- blocks a mass-wipe via the public key. Server-side cleanup (pg_cron / the
-- service-role key) bypasses RLS and is unaffected.
