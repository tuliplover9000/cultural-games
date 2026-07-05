-- 027_pin_trigger_search_paths.sql
-- Advisor hardening (applied to the live project via MCP on 2026-07-04): the two
-- SECURITY DEFINER trigger functions were created without a pinned search_path —
-- the 014 hardening pinned every RPC but missed these. Pinning prevents a
-- caller-manipulated search_path from redirecting their table references.
-- No body changes; idempotent.

alter function public._enforce_result_rate_limit()  set search_path = public;
alter function public._prevent_direct_coin_update() set search_path = public;
