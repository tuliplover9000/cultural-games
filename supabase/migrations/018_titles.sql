-- Migration 018: Achievement titles + exclusive Tiến Lên accessories
-- Run in the Supabase SQL Editor. Idempotent (IF NOT EXISTS / ON CONFLICT
-- throughout — safe to run more than once).
-- =============================================================================
--
-- Adds:
--   * profiles.equipped_title (text)          — the player's chosen wearable title
--   * rooms.player_titles (jsonb)             — cosmetic { pid: title } map
--   * 2 exclusive shop_items (price 0)        — unbuyable accessories gated
--                                               CLIENT-SIDE by achievement
--
-- INVARIANT: equipped_title is INTENTIONALLY client-writable (non-frozen).
-- Titles are purely cosmetic and are gated client-side by unlocked achievements;
-- a malicious client can write arbitrary text here, so every render of a title
-- MUST go through escaping (see lobby.js / profile-titles.js). No coins, no
-- frozen columns, and no RLS/RPC are touched by this migration.

-- ── 1. profiles: equipped title ──────────────────────────────────────────────
-- Deliberately NOT frozen by the "own update" RLS policy: a client may set this
-- directly via PostgREST. This is acceptable because the column is cosmetic-only
-- and every consumer escapes it before rendering.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS equipped_title text;

-- ── 2. rooms: cosmetic title map ─────────────────────────────────────────────
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS player_titles jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ── 3. Seed the 2 exclusive accessories (price 0) ────────────────────────────
-- price 0 → the existing set_avatar() RPC (migration 017) treats them as "free",
-- so it accepts them without an ownership check. They are NOT buyable (the shop
-- UI never shows a price for them); access is gated CLIENT-SIDE by achievement:
--   acc-tl-card  ← tl_wins_10 (Saigon Shark, silver)
--   hat-tl-lord  ← tl_wins_50 (Lord of the South, gold)
INSERT INTO shop_items (id, category, price) VALUES
  ('acc-tl-card', 'accessory', 0),
  ('hat-tl-lord', 'hat',       0)
ON CONFLICT (id) DO UPDATE SET
  price    = EXCLUDED.price,
  category = EXCLUDED.category;

-- No new RLS policy and no new RPC. equipped_title stays client-writable on
-- purpose (cosmetic, escaped at render time); the avatar/coin freezes from
-- migration 017 are left exactly as they are.
