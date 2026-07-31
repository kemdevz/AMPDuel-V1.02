CREATE EXTENSION IF NOT EXISTS pgcrypto;

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
      CASE
        WHEN jsonb_typeof(NEW.creator_items) = 'array' THEN NEW.creator_items
        ELSE '[]'::jsonb
      END
    ) AS entry(item)

    UNION ALL

    SELECT NEW.opponent_uuid AS owner_id, entry.item
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(NEW.opponent_items) = 'array' THEN NEW.opponent_items
        ELSE '[]'::jsonb
      END
    ) AS entry(item)
    WHERE NULLIF(NEW.opponent_uuid, '') IS NOT NULL
  ),
  normalized_items AS (
    SELECT DISTINCT ON (item_id)
      item_id,
      owner_id,
      item
    FROM (
      SELECT
        CASE
          WHEN COALESCE(item->>'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            THEN (item->>'id')::uuid
          ELSE gen_random_uuid()
        END AS item_id,
        owner_id,
        item
      FROM escrowed_items
      WHERE NULLIF(owner_id, '') IS NOT NULL
    ) AS prepared_items
    ORDER BY item_id, owner_id
  )
  INSERT INTO public.inventory_items (
    id,
    item_id,
    user_id,
    name,
    value,
    image_url,
    type,
    created_at,
    updated_at
  )
  SELECT
    normalized_items.item_id,
    CASE
      WHEN COALESCE(item->>'item_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        THEN (item->>'item_id')::uuid
      ELSE NULL
    END,
    owner_id,
    COALESCE(NULLIF(item->>'name', ''), 'Unknown item'),
    CASE
      WHEN COALESCE(item->>'value', '') ~ '^-?[0-9]+$'
        THEN (item->>'value')::integer
      ELSE 0
    END,
    NULLIF(item->>'image_url', ''),
    NULLIF(item->>'type', ''),
    now(),
    now()
  FROM normalized_items
  ON CONFLICT (id) DO UPDATE
  SET item_id = COALESCE(EXCLUDED.item_id, inventory_items.item_id),
      user_id = EXCLUDED.user_id,
      name = EXCLUDED.name,
      value = EXCLUDED.value,
      image_url = EXCLUDED.image_url,
      type = COALESCE(EXCLUDED.type, inventory_items.type),
      updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS restore_cancelled_coinflip_items_trigger
  ON public.coinflip_games;

CREATE TRIGGER restore_cancelled_coinflip_items_trigger
AFTER UPDATE OF canceled ON public.coinflip_games
FOR EACH ROW
WHEN (NEW.canceled IS TRUE AND OLD.canceled IS DISTINCT FROM TRUE)
EXECUTE FUNCTION public.restore_cancelled_coinflip_items();

REVOKE ALL ON FUNCTION public.restore_cancelled_coinflip_items() FROM PUBLIC, anon, authenticated;
