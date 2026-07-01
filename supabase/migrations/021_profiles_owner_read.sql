-- Migration 021: Guarantee authenticated users can read their OWN profile row.
--
-- Symptom this addresses: logged-in users saw 0 coins on the profile page.
-- The client reads the user's own `profiles` row to display coins / username /
-- avatar. If `profiles` has RLS enabled but no SELECT policy permitting a user
-- to read their own row, that read returns zero rows and the UI fell back to 0.
--
-- IMPORTANT: the coin balance itself was never lost — record_game_result only
-- ever runs `UPDATE profiles SET coins = GREATEST(0, coins + delta)` (additive),
-- the absolute-set persist_coins backdoor was dropped in migration 014, and RLS
-- blocks direct client coin writes. This was purely a READ visibility problem.
--
-- The client (js/utils/auth.js) now reads the own-profile row with the
-- authenticated client first, so this migration is what makes that read succeed
-- under strict owner-only RLS. It adds a minimal, secure owner-read policy: each
-- user can SELECT only their own row — no other player's balance is exposed.
--
-- Idempotent and additive: safe to run repeatedly, and it does not remove or
-- weaken any existing policy (Postgres RLS policies are OR-ed together).

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles owner read" ON public.profiles;
CREATE POLICY "profiles owner read" ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);
