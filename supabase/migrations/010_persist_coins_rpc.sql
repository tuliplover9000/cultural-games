-- Migration 010: persist_coins RPC
-- Allows the client to sync the coin balance for games that modify coins
-- directly (e.g. Bầu Cua real-coin mode) without going through
-- record_game_result. SECURITY DEFINER bypasses the RLS policy that
-- blocks direct client writes to profiles.coins.
-- Safe to run multiple times (CREATE OR REPLACE).

CREATE OR REPLACE FUNCTION persist_coins(p_new_balance int)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  UPDATE profiles
  SET coins = GREATEST(0, p_new_balance)
  WHERE id = v_user_id;

  RETURN jsonb_build_object('success', true);
END;
$$;
