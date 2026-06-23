-- Migration 019: Per-game exclusive achievement cosmetics
-- Run in the Supabase SQL Editor AFTER migration 018. Idempotent (ON CONFLICT —
-- safe to run more than once).
-- =============================================================================
--
-- Extends the Tiến Lên proof-of-concept (migration 018) to EVERY other game:
--   * each game's silver  *_wins_10 achievement → an exclusive ACCESSORY
--   * each game's gold     *_wins_50 achievement → an exclusive HAT
--
-- Seeds these as shop_items at price 0. As with 018, price 0 → the set_avatar()
-- RPC (migration 017) treats them as "free" and accepts them without an
-- ownership check; they are NOT buyable (the shop never shows a price) and
-- access is gated CLIENT-SIDE by the unlocked achievement (see js/utils/avatar.js
-- CATALOG `unlock` fields). The Tiến Lên items acc-tl-card / hat-tl-lord are
-- seeded by 018 and are deliberately NOT re-seeded here.
--
-- INVARIANT: ADDITIVE only. No coins, no frozen columns, no RLS, no RPC, and no
-- ALTERs are touched by this migration — it only inserts cosmetic shop_items.

INSERT INTO shop_items (id, category, price) VALUES
  -- ── Silver (*_wins_10) accessories ──
  ('acc-fn',  'accessory', 0),   -- fn_wins_10  Vaho's Tactician   (fanorona)
  ('acc-ht',  'accessory', 0),   -- ht_wins_10  Jarl of the Board  (hnefatafl)
  ('acc-pc',  'accessory', 0),   -- pc_wins_10  Court Favourite    (pachisi)
  ('acc-gj',  'accessory', 0),   -- gj_wins_10  Mughal Dealer      (ganjifa)
  ('acc-mj',  'accessory', 0),   -- mj_wins_10  Tile Master        (mahjong)
  ('acc-ow',  'accessory', 0),   -- ow_wins_10  Seed Counter       (oware)
  ('acc-oaq', 'accessory', 0),   -- oaq_wins_10 Market Master      (o-an-quan)
  ('acc-pt',  'accessory', 0),   -- pt_wins_10  Serpent Caller     (patolli)
  ('acc-pu',  'accessory', 0),   -- pu_wins_10  War Runner         (puluc)
  ('acc-pg',  'accessory', 0),   -- pg_wins_10  Pit Master         (pallanguzhi)
  ('acc-bc',  'accessory', 0),   -- bc_wins_10  Sea Gambler        (bau-cua)
  ('acc-lt',  'accessory', 0),   -- lt_wins_10  Praetorian Guard   (latrunculi)
  ('acc-ca',  'accessory', 0),   -- ca_wins_10  Cup Master         (cachos)
  ('acc-xf',  'accessory', 0),   -- xf_wins_10  Square Master      (xinjiang-fangqi)
  ('acc-fd',  'accessory', 0),   -- fd_wins_10  Dama Majestro      (filipino-dama)
  ('acc-cu',  'accessory', 0),   -- cu_wins_10  Maestro de Mano    (cuarenta)
  ('acc-yn',  'accessory', 0),   -- yn_wins_10  윷 명인             (yut-nori)
  ('acc-yo',  'accessory', 0),   -- yo_wins_10  Sand Strategist    (yote)
  ('acc-se',  'accessory', 0),   -- se_wins_10  Scribe of the Duat (senet)
  ('acc-tu',  'accessory', 0),   -- tu_wins_10  Trucador de Barri  (truc)
  -- ── Gold (*_wins_50) hats ──
  ('hat-fn',  'hat',       0),   -- fn_wins_50  Master of Fanoron   (fanorona)
  ('hat-ht',  'hat',       0),   -- ht_wins_50  Viking Warlord      (hnefatafl)
  ('hat-pc',  'hat',       0),   -- pc_wins_50  Akbar's Champion    (pachisi)
  ('hat-gj',  'hat',       0),   -- gj_wins_50  Grand Vizier        (ganjifa)
  ('hat-mj',  'hat',       0),   -- mj_wins_50  Dragon of the East  (mahjong)
  ('hat-ow',  'hat',       0),   -- ow_wins_50  Grand Harvester     (oware)
  ('hat-lt',  'hat',       0),   -- lt_wins_50  Consul of the Board (latrunculi)
  ('hat-ca',  'hat',       0),   -- ca_wins_50  El Gran Tahúr       (cachos)
  ('hat-xf',  'hat',       0),   -- xf_wins_50  Khan of the Board   (xinjiang-fangqi)
  ('hat-fd',  'hat',       0),   -- fd_wins_50  Hari ng Dama        (filipino-dama)
  ('hat-cu',  'hat',       0),   -- cu_wins_50  Rey de la Baraja    (cuarenta)
  ('hat-yn',  'hat',       0),   -- yn_wins_50  말 대장              (yut-nori)
  ('hat-yo',  'hat',       0),   -- yo_wins_50  Master of Yoté      (yote)
  ('hat-se',  'hat',       0),   -- se_wins_50  Justified Soul      (senet)
  ('hat-tu',  'hat',       0)    -- tu_wins_50  Campió de Penya     (truc)
ON CONFLICT (id) DO UPDATE SET
  price    = EXCLUDED.price,
  category = EXCLUDED.category;

-- No RLS policy, no RPC, no coin/frozen-column changes. The avatar/coin freezes
-- from migration 017 and the title columns from 018 are left exactly as-is.
