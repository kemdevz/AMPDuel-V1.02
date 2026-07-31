-- Repair legacy inventory and exchange rows whose copied metadata differs
-- slightly from the current item database. Item name is the stable identity;
-- value, image, and type are used to choose the best match when needed.

UPDATE public.inventory_items AS inventory_row
SET item_id = COALESCE(
  (
    SELECT item.id
    FROM public.items AS item
    WHERE item.id = inventory_row.id
  ),
  (
    SELECT item.id
    FROM public.items AS item
    WHERE lower(btrim(item.name)) = lower(btrim(inventory_row.name))
    ORDER BY
      (item.value = inventory_row.value) DESC,
      (item.image_url IS NOT DISTINCT FROM inventory_row.image_url) DESC,
      (item.type IS NOT DISTINCT FROM inventory_row.type) DESC,
      item.created_at,
      item.id
    LIMIT 1
  )
)
WHERE inventory_row.item_id IS NULL;

UPDATE public.exchange_stock AS exchange_row
SET item_id = (
  SELECT item.id
  FROM public.items AS item
  WHERE lower(btrim(item.name)) = lower(btrim(exchange_row.name))
  ORDER BY
    (item.value = exchange_row.value) DESC,
    (item.image_url IS NOT DISTINCT FROM exchange_row.image_url) DESC,
    (item.type IS NOT DISTINCT FROM exchange_row.type) DESC,
    item.created_at,
    item.id
  LIMIT 1
)
WHERE exchange_row.item_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.items AS item
    WHERE lower(btrim(item.name)) = lower(btrim(exchange_row.name))
  );

UPDATE public.items_to_coins_exchanges AS exchange_row
SET item_id = (
  SELECT item.id
  FROM public.items AS item
  WHERE lower(btrim(item.name)) = lower(btrim(exchange_row.item_name))
  ORDER BY
    (item.value = exchange_row.value) DESC,
    (item.image_url IS NOT DISTINCT FROM exchange_row.image_url) DESC,
    (item.type IS NOT DISTINCT FROM exchange_row.type) DESC,
    item.created_at,
    item.id
  LIMIT 1
)
WHERE exchange_row.item_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.items AS item
    WHERE lower(btrim(item.name)) = lower(btrim(exchange_row.item_name))
  );

UPDATE public.coins_to_items_exchanges AS exchange_row
SET item_id = (
  SELECT item.id
  FROM public.items AS item
  WHERE lower(btrim(item.name)) = lower(btrim(exchange_row.item_name))
  ORDER BY
    (item.value = exchange_row.value) DESC,
    (item.image_url IS NOT DISTINCT FROM exchange_row.image_url) DESC,
    (item.type IS NOT DISTINCT FROM exchange_row.type) DESC,
    item.created_at,
    item.id
  LIMIT 1
)
WHERE exchange_row.item_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.items AS item
    WHERE lower(btrim(item.name)) = lower(btrim(exchange_row.item_name))
  );

CREATE OR REPLACE FUNCTION public.assign_inventory_item_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.item_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Some older flows used the catalog UUID as the inventory row UUID.
  SELECT item.id
  INTO NEW.item_id
  FROM public.items AS item
  WHERE item.id = NEW.id;

  IF NEW.item_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT item.id
  INTO NEW.item_id
  FROM public.items AS item
  WHERE lower(btrim(item.name)) = lower(btrim(NEW.name))
  ORDER BY
    (item.value = NEW.value) DESC,
    (item.image_url IS NOT DISTINCT FROM NEW.image_url) DESC,
    (item.type IS NOT DISTINCT FROM NEW.type) DESC,
    item.created_at,
    item.id
  LIMIT 1;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS inventory_items_assign_item_id
  ON public.inventory_items;

CREATE TRIGGER inventory_items_assign_item_id
BEFORE INSERT OR UPDATE OF item_id, name, value, image_url, type
ON public.inventory_items
FOR EACH ROW
WHEN (NEW.item_id IS NULL)
EXECUTE FUNCTION public.assign_inventory_item_id();

REVOKE ALL ON FUNCTION public.assign_inventory_item_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_inventory_item_id() TO service_role;
