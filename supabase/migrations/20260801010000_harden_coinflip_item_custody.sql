CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Escrow the creator's wager in the same transaction that creates the room.
-- Any missing item aborts the insert, so an unbacked room cannot be published.
CREATE OR REPLACE FUNCTION public.escrow_created_coinflip_items()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  expected_items integer;
  removed_items integer;
BEGIN
  SELECT count(DISTINCT item->>'id')
  INTO expected_items
  FROM jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(NEW.creator_items) = 'array' THEN NEW.creator_items
      ELSE '[]'::jsonb
    END
  ) AS wager(item)
  WHERE NULLIF(item->>'id', '') IS NOT NULL;

  IF expected_items = 0 THEN
    RAISE EXCEPTION 'A coinflip creator must escrow at least one item';
  END IF;

  DELETE FROM public.inventory_items AS inventory
  WHERE inventory.user_id = NEW.creator_uuid
    AND inventory.id::text IN (
      SELECT item->>'id'
      FROM jsonb_array_elements(NEW.creator_items) AS wager(item)
      WHERE NULLIF(item->>'id', '') IS NOT NULL
    );

  GET DIAGNOSTICS removed_items = ROW_COUNT;
  IF removed_items <> expected_items THEN
    RAISE EXCEPTION 'One or more creator coinflip items are no longer owned';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS escrow_created_coinflip_items_trigger
  ON public.coinflip_games;

CREATE TRIGGER escrow_created_coinflip_items_trigger
AFTER INSERT ON public.coinflip_games
FOR EACH ROW
EXECUTE FUNCTION public.escrow_created_coinflip_items();

REVOKE ALL ON FUNCTION public.escrow_created_coinflip_items()
  FROM PUBLIC, anon, authenticated;

-- Preserve the permanent item-instance UUID when an open game is canceled.
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
    id,
    item_id,
    item_uuid,
    user_id,
    name,
    value,
    image_url,
    type,
    created_at,
    updated_at
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
    CASE WHEN COALESCE(item->>'value', '') ~ '^-?[0-9]+$' THEN (item->>'value')::integer ELSE 0 END,
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

-- Coinflip state and inventory custody are server-owned. Browsers only need
-- read access for the lobby and realtime display.
REVOKE INSERT, UPDATE, DELETE ON public.coinflip_games FROM anon, authenticated;
GRANT SELECT ON public.coinflip_games TO anon, authenticated;

DROP POLICY IF EXISTS "Users can insert coinflip_games" ON public.coinflip_games;
DROP POLICY IF EXISTS "Users can update coinflip_games" ON public.coinflip_games;
DROP POLICY IF EXISTS "Users can delete coinflip_games" ON public.coinflip_games;
