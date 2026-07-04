-- 026_tournaments_rls_fix.sql
-- Advisor fix (applied to the live project via MCP on 2026-07-04): public.tournaments
-- had Row Level Security DISABLED, leaving it fully exposed — anon could read,
-- insert, and update every row.
--
-- The three intended policies already existed on the live table and are correct
-- for RLS-on:
--   • "public read tournaments"         SELECT  USING (true)
--   • "authenticated create tournament"  INSERT  WITH CHECK (auth.uid() IS NOT NULL)
--   • "host update tournament"           UPDATE  USING (auth.uid() = host_id)
-- There is deliberately NO delete policy → direct client deletes are blocked; all
-- real mutations (register, seed, advance, cancel, forfeit) run through the
-- SECURITY DEFINER tournament functions, which bypass RLS.
--
-- This migration enables enforcement and removes anon's leftover INSERT/UPDATE
-- table grants (anon never legitimately writes tournaments — creating/hosting
-- requires auth.uid()). Authenticated keeps INSERT + the column-limited
-- UPDATE (registration_open) from migration 016. Idempotent; safe to re-run.

alter table public.tournaments enable row level security;

revoke insert, update on public.tournaments from anon;
