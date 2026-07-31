-- A withdrawal is a historical snapshot. It must not retain a foreign key to
-- inventory_items because the inventory row is deleted after the withdrawal
-- is created. ON DELETE SET NULL was erasing the UUID from withdraws.item_id.
DO $$
DECLARE
  v_constraint_name text;
BEGIN
  FOR v_constraint_name IN
    SELECT DISTINCT constraint_row.conname
    FROM pg_constraint AS constraint_row
    JOIN pg_attribute AS attribute_row
      ON attribute_row.attrelid = constraint_row.conrelid
      AND attribute_row.attnum = ANY(constraint_row.conkey)
    WHERE constraint_row.conrelid = 'public.withdraws'::regclass
      AND constraint_row.contype = 'f'
      AND attribute_row.attname = 'item_id'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.withdraws DROP CONSTRAINT %I',
      v_constraint_name
    );
  END LOOP;
END $$;

-- Remove fields from an earlier version of this migration. item_id is the
-- single source of truth and stores inventory_items.id.
DROP INDEX IF EXISTS public.withdraws_inventory_item_uuid_idx;
DROP INDEX IF EXISTS public.withdraws_catalog_item_uuid_idx;

ALTER TABLE public.withdraws
  DROP COLUMN IF EXISTS inventory_item_uuid,
  DROP COLUMN IF EXISTS catalog_item_uuid,
  DROP COLUMN IF EXISTS item_type;

COMMENT ON COLUMN public.withdraws.item_id IS
  'Immutable snapshot of the withdrawn inventory_items.id UUID; intentionally has no foreign key.';

CREATE OR REPLACE FUNCTION public.create_item_withdrawals(
  p_owner_ids text[],
  p_user_name text,
  p_item_uuids uuid[]
)
RETURNS TABLE (withdraw_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requested_count integer;
  v_available_count integer;
BEGIN
  v_requested_count := COALESCE(cardinality(p_item_uuids), 0);

  IF v_requested_count = 0 THEN
    RAISE EXCEPTION 'Select at least one item to withdraw.';
  END IF;

  IF COALESCE(cardinality(p_owner_ids), 0) = 0 THEN
    RAISE EXCEPTION 'A withdrawal owner is required.';
  END IF;

  PERFORM 1
  FROM public.inventory_items
  WHERE id = ANY(p_item_uuids)
    AND user_id::text = ANY(p_owner_ids)
  ORDER BY id
  FOR UPDATE;

  SELECT count(*)::integer
  INTO v_available_count
  FROM public.inventory_items
  WHERE id = ANY(p_item_uuids)
    AND user_id::text = ANY(p_owner_ids);

  IF v_available_count <> v_requested_count THEN
    RAISE EXCEPTION 'One or more selected inventory items are no longer available.';
  END IF;

  RETURN QUERY
  INSERT INTO public.withdraws AS created_withdraw (
    user_id,
    user_name,
    item_id,
    item_name,
    image_url,
    value,
    canceled
  )
  SELECT
    inventory_item.user_id,
    NULLIF(btrim(p_user_name), ''),
    inventory_item.id,
    inventory_item.name,
    inventory_item.image_url,
    COALESCE(inventory_item.value, 0),
    false
  FROM public.inventory_items AS inventory_item
  WHERE inventory_item.id = ANY(p_item_uuids)
    AND inventory_item.user_id::text = ANY(p_owner_ids)
  RETURNING created_withdraw.id;

  DELETE FROM public.inventory_items
  WHERE id = ANY(p_item_uuids)
    AND user_id::text = ANY(p_owner_ids);
END;
$$;

REVOKE ALL ON FUNCTION public.create_item_withdrawals(text[], text, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_item_withdrawals(text[], text, uuid[])
  TO anon, authenticated;
