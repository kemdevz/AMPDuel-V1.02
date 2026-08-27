-- Preserve fractional Adopt Me values when a canceled Coinflip restores its
-- escrow. The previous whole-number-only parser converted values such as 0.75
-- to zero. Repair catalog-linked zero snapshots and prevent future inventory
-- writes from introducing another non-positive value. Withdrawal snapshots
-- use the same fixed precision so canceling a withdrawal cannot restore a
-- rounded zero.
ALTER TABLE public.withdraws
  ALTER COLUMN value TYPE numeric(20, 4) USING value::numeric;

WITH ranked_repairs AS (
  SELECT
    owned.id AS inventory_id,
    catalog.id AS catalog_id,
    catalog.value AS catalog_value,
    catalog.image_url AS catalog_image_url,
    row_number() OVER (
      PARTITION BY owned.id
      ORDER BY (catalog.id = owned.item_id) DESC, catalog.updated_at DESC NULLS LAST, catalog.id
    ) AS repair_rank
  FROM public.inventory_items AS owned
  JOIN public.items AS catalog
    ON catalog.type = 'AMP'
   AND catalog.value > 0
   AND (
     catalog.id = owned.item_id
     OR lower(btrim(catalog.name)) = lower(btrim(owned.name))
   )
  WHERE upper(COALESCE(owned.type, '')) IN ('AMP', 'ADM')
    AND (
      owned.value IS DISTINCT FROM catalog.value
      OR owned.item_id IS DISTINCT FROM catalog.id
      OR owned.type IS DISTINCT FROM 'AMP'
    )
)
UPDATE public.inventory_items AS owned
SET item_id = repair.catalog_id,
    value = repair.catalog_value,
    image_url = COALESCE(repair.catalog_image_url, owned.image_url),
    type = 'AMP',
    updated_at = now()
FROM ranked_repairs AS repair
WHERE repair.repair_rank = 1
  AND owned.id = repair.inventory_id;

WITH ranked_withdrawal_repairs AS (
  SELECT
    pending.id AS withdrawal_id,
    catalog.value AS catalog_value,
    catalog.image_url AS catalog_image_url,
    row_number() OVER (
      PARTITION BY pending.id
      ORDER BY catalog.updated_at DESC NULLS LAST, catalog.id
    ) AS repair_rank
  FROM public.withdraws AS pending
  JOIN public.items AS catalog
    ON catalog.type = 'AMP'
   AND catalog.value > 0
   AND lower(btrim(catalog.name)) = lower(btrim(pending.item_name))
  WHERE upper(COALESCE(pending.item_type, '')) IN ('AMP', 'ADM')
    AND pending.canceled IS FALSE
    AND pending.completed_at IS NULL
)
UPDATE public.withdraws AS pending
SET value = repair.catalog_value,
    image_url = COALESCE(repair.catalog_image_url, pending.image_url),
    item_type = 'AMP'
FROM ranked_withdrawal_repairs AS repair
WHERE repair.repair_rank = 1
  AND pending.id = repair.withdrawal_id;

CREATE OR REPLACE FUNCTION public.restore_cancelled_coinflip_items()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.canceled IS NOT TRUE OR OLD.canceled IS TRUE THEN
    RETURN NEW;
  END IF;

  WITH escrowed_items AS (
    SELECT NEW.creator_uuid AS owner_id, entry.item
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(NEW.creator_items) = 'array' THEN NEW.creator_items ELSE '[]'::jsonb END
    ) AS entry(item)

    UNION ALL

    SELECT NEW.opponent_uuid AS owner_id, entry.item
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(NEW.opponent_items) = 'array' THEN NEW.opponent_items ELSE '[]'::jsonb END
    ) AS entry(item)
    WHERE NULLIF(NEW.opponent_uuid, '') IS NOT NULL
  ),
  normalized_items AS (
    SELECT DISTINCT ON (inventory_id)
      inventory_id,
      owner_id,
      item
    FROM (
      SELECT
        CASE
          WHEN COALESCE(item->>'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            THEN (item->>'id')::uuid
          ELSE gen_random_uuid()
        END AS inventory_id,
        owner_id,
        item
      FROM escrowed_items
      WHERE NULLIF(owner_id, '') IS NOT NULL
    ) AS prepared_items
    ORDER BY inventory_id, owner_id
  )
  INSERT INTO public.inventory_items (
    id, item_id, item_uuid, user_id, name, value, image_url, type, created_at, updated_at
  )
  SELECT
    normalized_items.inventory_id,
    CASE
      WHEN COALESCE(item->>'item_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        THEN (item->>'item_id')::uuid
      ELSE NULL
    END,
    CASE
      WHEN COALESCE(item->>'item_uuid', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        THEN (item->>'item_uuid')::uuid
      ELSE normalized_items.inventory_id
    END,
    owner_id,
    COALESCE(NULLIF(item->>'name', ''), 'Unknown item'),
    CASE
      WHEN COALESCE(item->>'value', '') ~ '^[0-9]+(\.[0-9]{1,4})?$'
        THEN (item->>'value')::numeric
      ELSE 0
    END,
    NULLIF(item->>'image_url', ''),
    NULLIF(item->>'type', ''),
    now(),
    now()
  FROM normalized_items
  ON CONFLICT (id) DO UPDATE
  SET item_id = COALESCE(EXCLUDED.item_id, inventory_items.item_id),
      item_uuid = COALESCE(inventory_items.item_uuid, EXCLUDED.item_uuid),
      user_id = EXCLUDED.user_id,
      name = EXCLUDED.name,
      value = EXCLUDED.value,
      image_url = EXCLUDED.image_url,
      type = COALESCE(EXCLUDED.type, inventory_items.type),
      updated_at = now();

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.restore_cancelled_coinflip_items()
  FROM PUBLIC, anon, authenticated;

ALTER TABLE public.inventory_items
  DROP CONSTRAINT IF EXISTS inventory_items_positive_value;
ALTER TABLE public.inventory_items
  ADD CONSTRAINT inventory_items_positive_value CHECK (value > 0) NOT VALID;

ALTER TABLE public.withdraws
  DROP CONSTRAINT IF EXISTS withdraws_positive_value;
ALTER TABLE public.withdraws
  ADD CONSTRAINT withdraws_positive_value CHECK (value > 0) NOT VALID;

NOTIFY pgrst, 'reload schema';
