CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- A result update, opponent escrow removal, and winner payout must succeed or
-- fail together. This trigger runs inside the transaction that resolves a game.
CREATE OR REPLACE FUNCTION public.settle_resolved_coinflip_items()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  expected_opponent_items integer;
  removed_opponent_items integer;
BEGIN
  IF NEW.result IS NULL OR OLD.result IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NULLIF(NEW.opponent_uuid, '') IS NULL
     OR NULLIF(NEW.winner_uuid, '') IS NULL
     OR NEW.winner_uuid NOT IN (NEW.creator_uuid, NEW.opponent_uuid) THEN
    RAISE EXCEPTION 'Invalid resolved coinflip participants or winner';
  END IF;

  -- Remove the opponent's still-owned wager before rebuilding the complete pot
  -- in the winner's inventory. Creator items were escrowed when the game opened.
  SELECT count(DISTINCT item->>'id')
  INTO expected_opponent_items
  FROM jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(NEW.opponent_items) = 'array' THEN NEW.opponent_items
      ELSE '[]'::jsonb
    END
  ) AS wager(item)
  WHERE NULLIF(item->>'id', '') IS NOT NULL;

  IF expected_opponent_items = 0 THEN
    RAISE EXCEPTION 'A coinflip opponent must escrow at least one item';
  END IF;

  DELETE FROM public.inventory_items AS inventory
  WHERE inventory.user_id = NEW.opponent_uuid
    AND inventory.id::text IN (
      SELECT item->>'id'
      FROM jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(NEW.opponent_items) = 'array' THEN NEW.opponent_items
          ELSE '[]'::jsonb
        END
      ) AS wager(item)
      WHERE NULLIF(item->>'id', '') IS NOT NULL
    );

  GET DIAGNOSTICS removed_opponent_items = ROW_COUNT;
  IF removed_opponent_items <> expected_opponent_items THEN
    RAISE EXCEPTION 'One or more opponent coinflip items are no longer owned';
  END IF;

  WITH pot_items AS (
    SELECT entry.item
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(NEW.creator_items) = 'array' THEN NEW.creator_items
        ELSE '[]'::jsonb
      END
    ) AS entry(item)

    UNION ALL

    SELECT entry.item
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(NEW.opponent_items) = 'array' THEN NEW.opponent_items
        ELSE '[]'::jsonb
      END
    ) AS entry(item)
  ),
  normalized_items AS (
    SELECT DISTINCT ON (inventory_id)
      inventory_id,
      item
    FROM (
      SELECT
        CASE
          WHEN COALESCE(item->>'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            THEN (item->>'id')::uuid
          ELSE gen_random_uuid()
        END AS inventory_id,
        item
      FROM pot_items
    ) AS prepared_items
    ORDER BY inventory_id
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
    NEW.winner_uuid,
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
      item_uuid = COALESCE(EXCLUDED.item_uuid, inventory_items.item_uuid),
      user_id = EXCLUDED.user_id,
      name = EXCLUDED.name,
      value = EXCLUDED.value,
      image_url = EXCLUDED.image_url,
      type = COALESCE(EXCLUDED.type, inventory_items.type),
      updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS settle_resolved_coinflip_items_trigger
  ON public.coinflip_games;

CREATE TRIGGER settle_resolved_coinflip_items_trigger
AFTER UPDATE OF result ON public.coinflip_games
FOR EACH ROW
WHEN (NEW.result IS NOT NULL AND OLD.result IS NULL)
EXECUTE FUNCTION public.settle_resolved_coinflip_items();

REVOKE ALL ON FUNCTION public.settle_resolved_coinflip_items()
  FROM PUBLIC, anon, authenticated;
