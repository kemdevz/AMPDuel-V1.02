-- Only items worth at least 250,000 coins may be sold to the exchange.
-- A 5% fee is retained from every item-to-coins exchange and recorded on
-- each history row alongside the net coin amount paid to the user.

ALTER TABLE public.items_to_coins_exchanges
  ADD COLUMN IF NOT EXISTS fee_amount integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.items_to_coins_exchanges.fee_amount IS
  'Five percent exchange fee deducted from the item value before coin_amount is credited.';

CREATE OR REPLACE FUNCTION public.exchange_items_atomic(
  p_profile_id text,
  p_mode text,
  p_item_uuids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requested_count integer;
  v_available_count integer;
  v_total_value bigint;
  v_fee_amount bigint := 0;
  v_coin_amount bigint;
  v_profile public.user_profiles%ROWTYPE;
  v_new_balance bigint;
BEGIN
  v_requested_count := COALESCE(cardinality(p_item_uuids), 0);
  IF v_requested_count = 0 THEN
    RAISE EXCEPTION 'Select at least one item to exchange.';
  END IF;
  IF p_mode NOT IN ('coins_to_items', 'items_to_coins') THEN
    RAISE EXCEPTION 'Invalid exchange mode.';
  END IF;

  SELECT *
  INTO v_profile
  FROM public.user_profiles
  WHERE id::text = p_profile_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Your user profile could not be found.';
  END IF;

  IF p_mode = 'items_to_coins' THEN
    PERFORM 1
    FROM public.inventory_items
    WHERE id = ANY(p_item_uuids)
      AND user_id::text = p_profile_id
    ORDER BY id
    FOR UPDATE;

    SELECT count(*)::integer, COALESCE(sum(COALESCE(value, 0)), 0)::bigint
    INTO v_available_count, v_total_value
    FROM public.inventory_items
    WHERE id = ANY(p_item_uuids)
      AND user_id::text = p_profile_id;

    IF v_available_count <> v_requested_count THEN
      RAISE EXCEPTION 'One or more selected items are no longer available.';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.inventory_items
      WHERE id = ANY(p_item_uuids)
        AND user_id::text = p_profile_id
        AND COALESCE(value, 0) < 250000
    ) THEN
      RAISE EXCEPTION 'Items must be worth at least 250,000 coins to exchange.';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.inventory_items AS inventory_item
      LEFT JOIN public.items AS item ON item.id = inventory_item.item_id
      WHERE inventory_item.id = ANY(p_item_uuids)
        AND inventory_item.user_id::text = p_profile_id
        AND item.id IS NULL
    ) THEN
      RAISE EXCEPTION 'One or more selected items are missing a valid item UUID.';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.inventory_items AS inventory_item
      JOIN public.exchange_stock AS stock_item
        ON stock_item.item_uuid = inventory_item.item_uuid
      WHERE inventory_item.id = ANY(p_item_uuids)
        AND inventory_item.user_id::text = p_profile_id
    ) THEN
      RAISE EXCEPTION 'A selected individual item UUID already exists in exchange stock.';
    END IF;

    SELECT COALESCE(sum(ROUND(COALESCE(value, 0)::numeric * 0.05)), 0)::bigint
    INTO v_fee_amount
    FROM public.inventory_items
    WHERE id = ANY(p_item_uuids)
      AND user_id::text = p_profile_id;

    v_coin_amount := v_total_value - v_fee_amount;

    INSERT INTO public.items_to_coins_exchanges (
      item_id,
      item_uuid,
      user_id,
      user_name,
      item_name,
      value,
      image_url,
      type,
      fee_amount,
      coin_amount
    )
    SELECT
      item_id,
      item_uuid,
      p_profile_id,
      v_profile.username,
      name,
      COALESCE(value, 0),
      image_url,
      type,
      ROUND(COALESCE(value, 0)::numeric * 0.05)::integer,
      COALESCE(value, 0) - ROUND(COALESCE(value, 0)::numeric * 0.05)::integer
    FROM public.inventory_items
    WHERE id = ANY(p_item_uuids)
      AND user_id::text = p_profile_id;

    INSERT INTO public.exchange_stock (
      item_id,
      item_uuid,
      name,
      value,
      image_url,
      type,
      from_user
    )
    SELECT
      item_id,
      item_uuid,
      name,
      COALESCE(value, 0),
      image_url,
      type,
      v_profile.username
    FROM public.inventory_items
    WHERE id = ANY(p_item_uuids)
      AND user_id::text = p_profile_id;

    DELETE FROM public.inventory_items
    WHERE id = ANY(p_item_uuids)
      AND user_id::text = p_profile_id;

    UPDATE public.user_profiles
    SET balance = COALESCE(balance, 0) + v_coin_amount,
        updated_at = now()
    WHERE id::text = p_profile_id
    RETURNING balance INTO v_new_balance;
  ELSE
    PERFORM 1
    FROM public.exchange_stock
    WHERE uuid = ANY(p_item_uuids)
    ORDER BY uuid
    FOR UPDATE;

    SELECT count(*)::integer, COALESCE(sum(COALESCE(value, 0)), 0)::bigint
    INTO v_available_count, v_total_value
    FROM public.exchange_stock
    WHERE uuid = ANY(p_item_uuids);

    IF v_available_count <> v_requested_count THEN
      RAISE EXCEPTION 'One or more stock items are no longer available.';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.exchange_stock AS stock_item
      LEFT JOIN public.items AS item ON item.id = stock_item.item_id
      WHERE stock_item.uuid = ANY(p_item_uuids)
        AND item.id IS NULL
    ) THEN
      RAISE EXCEPTION 'One or more stock items are missing a valid item UUID.';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.exchange_stock AS stock_item
      JOIN public.inventory_items AS inventory_item
        ON inventory_item.item_uuid = stock_item.item_uuid
      WHERE stock_item.uuid = ANY(p_item_uuids)
    ) THEN
      RAISE EXCEPTION 'A selected individual item UUID already exists in an inventory.';
    END IF;

    IF COALESCE(v_profile.balance, 0) < v_total_value THEN
      RAISE EXCEPTION 'You do not have enough coins for this purchase.';
    END IF;

    INSERT INTO public.coins_to_items_exchanges (
      item_id,
      item_uuid,
      user_id,
      user_name,
      item_name,
      value,
      image_url,
      type,
      coin_amount
    )
    SELECT
      item_id,
      item_uuid,
      p_profile_id,
      v_profile.username,
      name,
      COALESCE(value, 0),
      image_url,
      type,
      COALESCE(value, 0)
    FROM public.exchange_stock
    WHERE uuid = ANY(p_item_uuids);

    INSERT INTO public.inventory_items (
      item_id,
      item_uuid,
      user_id,
      name,
      value,
      image_url,
      type
    )
    SELECT
      item_id,
      item_uuid,
      p_profile_id,
      name,
      COALESCE(value, 0),
      image_url,
      type
    FROM public.exchange_stock
    WHERE uuid = ANY(p_item_uuids);

    DELETE FROM public.exchange_stock
    WHERE uuid = ANY(p_item_uuids);

    UPDATE public.user_profiles
    SET balance = COALESCE(balance, 0) - v_total_value,
        updated_at = now()
    WHERE id::text = p_profile_id
    RETURNING balance INTO v_new_balance;

    v_coin_amount := v_total_value;
  END IF;

  RETURN jsonb_build_object(
    'mode', p_mode,
    'item_count', v_available_count,
    'value', v_total_value,
    'fee_amount', v_fee_amount,
    'coin_amount', v_coin_amount,
    'balance', v_new_balance
  );
END;
$$;

REVOKE ALL ON FUNCTION public.exchange_items_atomic(text, text, uuid[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.exchange_items_atomic(text, text, uuid[])
  TO service_role;
