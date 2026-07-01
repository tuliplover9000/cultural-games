-- Migration 023: Hair slot + more eyes/mouth avatar items
-- Run in the Supabase SQL Editor. Idempotent (ON CONFLICT / OR REPLACE).
-- =============================================================================
--
-- Adds server-authoritative price rows for the new avatar items (a new "hair"
-- slot plus extra eyes and mouths) and teaches set_avatar() to validate the new
-- hair slot. Without this, buy_avatar_item() would reject the new items as
-- 'invalid_item' and they could not be purchased.
--
-- Prices are tuned to the coin economy (a win pays 100, long games 500): most
-- cosmetics cost ~1 win, premium ones ~1.5-2 wins.

-- ── 1. Seed the new shop_items rows ──────────────────────────────────────────
INSERT INTO shop_items (id, category, price) VALUES
  -- more eyes
  ('eyes-side',   'eyes', 40),
  ('eyes-angry',  'eyes', 60),
  ('eyes-cute',   'eyes', 80),
  ('eyes-heart',  'eyes', 150),
  ('eyes-money',  'eyes', 150),
  -- more mouths
  ('mouth-frown',  'mouth', 40),
  ('mouth-o',      'mouth', 40),
  ('mouth-smirk',  'mouth', 60),
  ('mouth-tongue', 'mouth', 80),
  ('mouth-beard',  'mouth', 150),
  -- hair (new slot; hair-none/hair-short are the free options)
  ('hair-none',  'hair', 0),
  ('hair-short', 'hair', 0),
  ('hair-buzz',  'hair', 40),
  ('hair-side',  'hair', 60),
  ('hair-bun',   'hair', 100),
  ('hair-curly', 'hair', 120),
  ('hair-pony',  'hair', 150),
  ('hair-long',  'hair', 200)
ON CONFLICT (id) DO UPDATE SET
  price    = EXCLUDED.price,
  category = EXCLUDED.category;

-- ── 2. Recreate set_avatar() to validate the new "hair" slot ──────────────────
-- Same logic as migration 017, with 'hair' added to the validated slot list and
-- its free 'hair-none' sentinel treated like the hat/accessory "none" sentinels.
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
  v_slots   text[] := ARRAY['skin','eyes','mouth','hair','hat','accessory'];
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
    -- ONLY for the optional slots (hat/accessory/hair). A NULL/sentinel in a
    -- required slot (skin/eyes/mouth) falls through to the catalog lookup and is
    -- rejected as invalid_item, so a semantically-broken config can't be stored.
    IF (v_slot IN ('hat', 'accessory') AND (v_val IS NULL OR v_val = 'hat-none' OR v_val = 'acc-none'))
       OR (v_slot = 'hair' AND (v_val IS NULL OR v_val = 'hair-none')) THEN
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

GRANT EXECUTE ON FUNCTION set_avatar(jsonb) TO authenticated;
