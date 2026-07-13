-- 034_lock_tournament_tables_to_rpc_writes.sql
-- Applied to prod via MCP on 2026-07-06.
--
-- SECURITY FIX (deep online/tournament review, CRITICAL): the tournament_players
-- "owner register" INSERT policy (auth.uid()=user_id) let a client directly INSERT
-- a registration row with entry_fee_paid set — bypassing register_for_tournament's
-- coin escrow — which cancel_tournament then refunds as REAL coins (unbounded mint).
--
-- The client never writes these tables directly (registration, advancement,
-- forfeit, spectating all go through SECURITY DEFINER RPCs owned by postgres; the
-- client only READs them). Revoke all client write grants so writes are RPC-only —
-- the RPCs bypass this because they run as the table owner. Public SELECT stays for
-- bracket rendering.
--
-- Verified against prod: a direct INSERT into tournament_players as role
-- 'authenticated' now returns 42501 permission denied; only SELECT/REFERENCES/
-- TRIGGER grants remain.

revoke insert, update, delete, truncate on public.tournament_players    from anon, authenticated;
revoke insert, update, delete, truncate on public.tournament_matches    from anon, authenticated;
revoke insert, update, delete, truncate on public.tournament_spectators from anon, authenticated;
