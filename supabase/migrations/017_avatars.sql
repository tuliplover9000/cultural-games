-- Migration 017: Customizable avatars (shop + equip)
-- Run in the Supabase SQL Editor. Idempotent (IF NOT EXISTS / OR REPLACE /
-- ON CONFLICT throughout — safe to run more than once).
-- =============================================================================
--
-- Adds:
--   * profiles.equipped_avatar (jsonb)        — the player's chosen config
--   * profiles.owned_avatar_items (jsonb[])   — ids the player has bought
--   * rooms.player_avatars (jsonb)            — cosmetic { pid: config } map
--   * shop_items table                        — server-authoritative price list
--   * buy_avatar_item() / set_avatar() RPCs   — SECURITY DEFINER write paths
--
-- INVARIANT: clients can NEVER write coins, owned_avatar_items, or
-- equipped_avatar directly. The recreated "own update" RLS policy freezes all
-- three; only the SECURITY DEFINER functions below may change them.

-- ── 1. profiles: avatar columns ──────────────────────────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS equipped_avatar jsonb;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS owned_avatar_items jsonb NOT NULL DEFAULT '[]'::jsonb;

-- ── 2. rooms: cosmetic avatar map ────────────────────────────────────────────
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS player_avatars jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ── 3. shop_items: server-authoritative catalog ──────────────────────────────
CREATE TABLE IF NOT EXISTS shop_items (
  id         text PRIMARY KEY,
  category   text NOT NULL,
  price      int  NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE shop_items ENABLE ROW LEVEL SECURITY;

-- Public read so any client can render prices / owned state.
DROP POLICY IF EXISTS "public read shop_items" ON shop_items;
CREATE POLICY "public read shop_items" ON shop_items
  FOR SELECT USING (true);
-- No INSERT/UPDATE/DELETE policy — prices are authoritative, written only here.

-- ── 4. Seed all 30 items (idempotent; keeps prices authoritative) ─────────────
INSERT INTO shop_items (id, category, price) VALUES
  -- skin (all free)
  ('skin-light', 'skin', 0),
  ('skin-tan',   'skin', 0),
  ('skin-brown', 'skin', 0),
  ('skin-deep',  'skin', 0),
  ('skin-olive', 'skin', 0),
  ('skin-mint',  'skin', 0),
  -- eyes
  ('eyes-dot',    'eyes', 0),
  ('eyes-round',  'eyes', 0),
  ('eyes-happy',  'eyes', 40),
  ('eyes-sleepy', 'eyes', 40),
  ('eyes-wink',   'eyes', 60),
  ('eyes-star',   'eyes', 120),
  -- mouth
  ('mouth-smile',   'mouth', 0),
  ('mouth-neutral', 'mouth', 0),
  ('mouth-grin',    'mouth', 40),
  ('mouth-open',    'mouth', 40),
  ('mouth-cool',    'mouth', 60),
  ('mouth-stache',  'mouth', 80),
  -- hat (none = free sentinel)
  ('hat-none',  'hat', 0),
  ('hat-cap',   'hat', 60),
  ('hat-party', 'hat', 80),
  ('hat-band',  'hat', 60),
  ('hat-top',   'hat', 150),
  ('hat-crown', 'hat', 200),
  -- accessory (none = free sentinel)
  ('acc-none',    'accessory', 0),
  ('acc-glasses', 'accessory', 60),
  ('acc-shades',  'accessory', 80),
  ('acc-earring', 'accessory', 40),
  ('acc-flower',  'accessory', 100),
  ('acc-monocle', 'accessory', 120)
ON CONFLICT (id) DO UPDATE SET
  price    = EXCLUDED.price,
  category = EXCLUDED.category;

-- ── 5. Recreate profiles "own update" policy ─────────────────────────────────
-- CRITICAL: preserve the migration-005 coins freeze AND add the new freezes for
-- owned_avatar_items + equipped_avatar. The SECURITY DEFINER functions below
-- bypass this policy, so server-side writes still work. IS NOT DISTINCT FROM is
-- used for the jsonb columns so a NULL equipped_avatar compares correctly.
DROP POLICY IF EXISTS "own update" ON profiles;
CREATE POLICY "own update" ON profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    -- coins must not change via direct client write (migration 005 invariant)
    AND coins = (SELECT coins FROM profiles WHERE id = auth.uid())
    -- owned items + equipped avatar are server-managed too
    AND owned_avatar_items IS NOT DISTINCT FROM (SELECT owned_avatar_items FROM profiles WHERE id = auth.uid())
    AND equipped_avatar     IS NOT DISTINCT FROM (SELECT equipped_avatar     FROM profiles WHERE id = auth.uid())
  );

-- ── 6. buy_avatar_item() — the only path to spend coins on an item ────────────
-- SECURITY DEFINER: runs as DB owner, bypasses RLS for the internal writes.
CREATE OR REPLACE FUNCTION buy_avatar_item(p_item_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_price   int;
  v_coins   int;
  v_owned   jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  -- Look up price + existence in the authoritative catalog.
  SELECT price INTO v_price FROM shop_items WHERE id = p_item_id;
  IF v_price IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_item');
  END IF;

  -- Free items are never "bought" — they're always available.
  IF v_price = 0 THEN
    RETURN jsonb_build_object('success', true, 'already', true);
  END IF;

  -- FOR UPDATE locks the profile row so two concurrent buys of the same item
  -- can't both pass the ownership/balance checks and double-append / double-charge.
  SELECT coins, owned_avatar_items INTO v_coins, v_owned
  FROM profiles WHERE id = v_user_id FOR UPDATE;

  -- Already owned → idempotent success.
  IF v_owned ? p_item_id THEN
    RETURN jsonb_build_object('success', true, 'already', true,
      'new_balance', v_coins, 'owned', v_owned);
  END IF;

  -- Not enough coins.
  IF v_coins < v_price THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_coins',
      'new_balance', v_coins);
  END IF;

  -- Deduct + append atomically.
  UPDATE profiles
  SET coins              = coins - v_price,
      owned_avatar_items = owned_avatar_items || to_jsonb(p_item_id)
  WHERE id = v_user_id
  RETURNING coins, owned_avatar_items INTO v_coins, v_owned;

  RETURN jsonb_build_object('success', true,
    'new_balance', v_coins, 'owned', v_owned);
END;
$$;

-- ── 7. set_avatar() — validate every slot is owned/free, then equip ───────────
-- SECURITY DEFINER: bypasses the equipped_avatar freeze in the RLS policy.
CREATE OR REPLACE FUNCTION set_avatar(p_config jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_owned   jsonb;
  v_slot    text;
  v_val     text;
  v_price   int;
  v_slots   text[] := ARRAY['skin','eyes','mouth','hat','accessory'];
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  SELECT owned_avatar_items INTO v_owned FROM profiles WHERE id = v_user_id;

  FOREACH v_slot IN ARRAY v_slots LOOP
    -- Skip slots not present in the submitted config.
    IF NOT (p_config ? v_slot) THEN
      CONTINUE;
    END IF;

    v_val := p_config ->> v_slot;

    -- Optional-slot sentinels (and NULL) render nothing → always allowed, but
    -- ONLY for the optional slots. A NULL/sentinel in a required slot
    -- (skin/eyes/mouth) falls through to the catalog lookup below and is
    -- rejected as invalid_item, so a semantically-broken config can't be stored.
    IF v_slot IN ('hat', 'accessory')
       AND (v_val IS NULL OR v_val = 'hat-none' OR v_val = 'acc-none') THEN
      CONTINUE;
    END IF;

    -- Must be a known catalog id.
    SELECT price INTO v_price FROM shop_items WHERE id = v_val;
    IF v_price IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'invalid_item', 'item', v_val);
    END IF;

    -- Free items are always usable; paid items must be owned.
    IF v_price > 0 AND NOT (v_owned ? v_val) THEN
      RETURN jsonb_build_object('success', false, 'error', 'not_owned', 'item', v_val);
    END IF;
  END LOOP;

  UPDATE profiles SET equipped_avatar = p_config WHERE id = v_user_id;
  RETURN jsonb_build_object('success', true);
END;
$$;

-- ── 8. Grant execute to authenticated users ───────────────────────────────────
GRANT EXECUTE ON FUNCTION buy_avatar_item(text) TO authenticated;
GRANT EXECUTE ON FUNCTION set_avatar(jsonb)      TO authenticated;
