-- Preserve the catalog item UUID throughout both exchange directions.
-- The UUID sent to exchange_items_atomic identifies an inventory/stock row;
-- item_id identifies the underlying public.items row.

ALTER TABLE public.exchange_stock
  ADD COLUMN IF NOT EXISTS item_id uuid;

ALTER TABLE public.items_to_coins_exchanges
  ADD COLUMN IF NOT EXISTS item_id uuid;

ALTER TABLE public.coins_to_items_exchanges
  ADD COLUMN IF NOT EXISTS item_id uuid;

-- Recover catalog UUIDs for legacy rows when their copied item details uniquely
-- identify an entry in the item database.
UPDATE public.exchange_stock AS exchange_row
SET item_id = (
  SELECT item.id
  FROM public.items AS item
  WHERE item.name = exchange_row.name
    AND item.value = exchange_row.value
    AND item.image_url IS NOT DISTINCT FROM exchange_row.image_url
    AND item.type IS NOT DISTINCT FROM exchange_row.type
  ORDER BY item.created_at, item.id
  LIMIT 1
)
WHERE exchange_row.item_id IS NULL;

UPDATE public.items_to_coins_exchanges AS exchange_row
SET item_id = (
  SELECT item.id
  FROM public.items AS item
  WHERE item.name = exchange_row.item_name
    AND item.value = exchange_row.value
    AND item.image_url IS NOT DISTINCT FROM exchange_row.image_url
    AND item.type IS NOT DISTINCT FROM exchange_row.type
  ORDER BY item.created_at, item.id
  LIMIT 1
)
WHERE exchange_row.item_id IS NULL;

UPDATE public.coins_to_items_exchanges AS exchange_row
SET item_id = (
  SELECT item.id
  FROM public.items AS item
  WHERE item.name = exchange_row.item_name
    AND item.value = exchange_row.value
    AND item.image_url IS NOT DISTINCT FROM exchange_row.image_url
    AND item.type IS NOT DISTINCT FROM exchange_row.type
  ORDER BY item.created_at, item.id
  LIMIT 1
)
WHERE exchange_row.item_id IS NULL;

CREATE INDEX IF NOT EXISTS exchange_stock_item_id_idx
  ON public.exchange_stock (item_id);

CREATE INDEX IF NOT EXISTS items_to_coins_exchanges_item_id_idx
  ON public.items_to_coins_exchanges (item_id);

CREATE INDEX IF NOT EXISTS coins_to_items_exchanges_item_id_idx
  ON public.coins_to_items_exchanges (item_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.exchange_stock'::regclass
      AND conname = 'exchange_stock_item_id_fkey'
  ) THEN
    ALTER TABLE public.exchange_stock
      ADD CONSTRAINT exchange_stock_item_id_fkey
      FOREIGN KEY (item_id)
      REFERENCES public.items(id)
      ON DELETE RESTRICT
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.items_to_coins_exchanges'::regclass
      AND conname = 'items_to_coins_exchanges_item_id_fkey'
  ) THEN
    ALTER TABLE public.items_to_coins_exchanges
      ADD CONSTRAINT items_to_coins_exchanges_item_id_fkey
      FOREIGN KEY (item_id)
      REFERENCES public.items(id)
      ON DELETE RESTRICT
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.coins_to_items_exchanges'::regclass
      AND conname = 'coins_to_items_exchanges_item_id_fkey'
  ) THEN
    ALTER TABLE public.coins_to_items_exchanges
      ADD CONSTRAINT coins_to_items_exchanges_item_id_fkey
      FOREIGN KEY (item_id)
      REFERENCES public.items(id)
      ON DELETE RESTRICT
      NOT VALID;
  END IF;
END
$$;

-- NOT VALID keeps unresolvable legacy rows deployable while enforcing item_id
-- for every row inserted or updated after this migration.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.exchange_stock'::regclass
      AND conname = 'exchange_stock_item_id_required'
  ) THEN
    ALTER TABLE public.exchange_stock
      ADD CONSTRAINT exchange_stock_item_id_required
      CHECK (item_id IS NOT NULL)
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.items_to_coins_exchanges'::regclass
      AND conname = 'items_to_coins_exchanges_item_id_required'
  ) THEN
    ALTER TABLE public.items_to_coins_exchanges
      ADD CONSTRAINT items_to_coins_exchanges_item_id_required
      CHECK (item_id IS NOT NULL)
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.coins_to_items_exchanges'::regclass
      AND conname = 'coins_to_items_exchanges_item_id_required'
  ) THEN
    ALTER TABLE public.coins_to_items_exchanges
      ADD CONSTRAINT coins_to_items_exchanges_item_id_required
      CHECK (item_id IS NOT NULL)
      NOT VALID;
  END IF;
END
$$;

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
      FROM public.inventory_items AS inventory_item
      LEFT JOIN public.items AS item ON item.id = inventory_item.item_id
      WHERE inventory_item.id = ANY(p_item_uuids)
        AND inventory_item.user_id::text = p_profile_id
        AND item.id IS NULL
    ) THEN
      RAISE EXCEPTION 'One or more selected items are missing a valid item UUID.';
    END IF;

    INSERT INTO public.items_to_coins_exchanges (
      item_id,
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
      p_profile_id,
      v_profile.username,
      name,
      COALESCE(value, 0),
      image_url,
      type,
      COALESCE(value, 0)
    FROM public.inventory_items
    WHERE id = ANY(p_item_uuids)
      AND user_id::text = p_profile_id;

    INSERT INTO public.exchange_stock (
      item_id,
      name,
      value,
      image_url,
      type,
      from_user
    )
    SELECT
      item_id,
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
    SET balance = COALESCE(balance, 0) + v_total_value,
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

    IF COALESCE(v_profile.balance, 0) < v_total_value THEN
      RAISE EXCEPTION 'You do not have enough coins for this purchase.';
    END IF;

    INSERT INTO public.coins_to_items_exchanges (
      item_id,
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
      user_id,
      name,
      value,
      image_url,
      type
    )
    SELECT
      item_id,
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
  END IF;

  RETURN jsonb_build_object(
    'mode', p_mode,
    'item_count', v_available_count,
    'value', v_total_value,
    'balance', v_new_balance
  );
END;
$$;

REVOKE ALL ON FUNCTION public.exchange_items_atomic(text, text, uuid[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.exchange_items_atomic(text, text, uuid[])
  TO service_role;

COMMENT ON COLUMN public.exchange_stock.item_id IS
  'Catalog item UUID referencing public.items.id.';
COMMENT ON COLUMN public.items_to_coins_exchanges.item_id IS
  'Catalog item UUID referencing public.items.id.';
COMMENT ON COLUMN public.coins_to_items_exchanges.item_id IS
  'Catalog item UUID referencing public.items.id.';
