-- Coinflip pots with fewer than eight items transfer every escrowed item to
-- the winner. Eight or more items keep the existing 12.5% item tax.
CREATE OR REPLACE FUNCTION public.settle_resolved_coinflip_items()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  expected_opponent_items integer;
  removed_opponent_items integer;
  expected_pot_items integer;
  inserted_winner_items integer := 0;
  inserted_tax_items integer := 0;
  updated_winner integer := 0;
  gross_pot_value bigint := 0;
  tax_item_ids uuid[] := '{}'::uuid[];
  all_pot_items jsonb := '[]'::jsonb;
BEGIN
  IF NEW.result IS NULL OR OLD.result IS NOT NULL THEN RETURN NEW; END IF;
  IF NULLIF(NEW.opponent_uuid, '') IS NULL
     OR NULLIF(NEW.winner_uuid, '') IS NULL
     OR NEW.winner_uuid NOT IN (NEW.creator_uuid, NEW.opponent_uuid) THEN
    RAISE EXCEPTION 'Invalid resolved coinflip participants or winner';
  END IF;

  SELECT count(DISTINCT item->>'id') INTO expected_opponent_items
  FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(NEW.opponent_items) = 'array' THEN NEW.opponent_items ELSE '[]'::jsonb END
  ) wager(item)
  WHERE NULLIF(item->>'id', '') IS NOT NULL;
  IF expected_opponent_items = 0 THEN
    RAISE EXCEPTION 'A coinflip opponent must escrow at least one item';
  END IF;

  DELETE FROM public.inventory_items inventory
  WHERE inventory.user_id = NEW.opponent_uuid
    AND inventory.id::text IN (
      SELECT item->>'id'
      FROM jsonb_array_elements(NEW.opponent_items) wager(item)
      WHERE NULLIF(item->>'id', '') IS NOT NULL
    );
  GET DIAGNOSTICS removed_opponent_items = ROW_COUNT;
  IF removed_opponent_items <> expected_opponent_items THEN
    RAISE EXCEPTION 'One or more opponent coinflip items are no longer owned';
  END IF;

  all_pot_items :=
    (CASE WHEN jsonb_typeof(NEW.creator_items) = 'array' THEN NEW.creator_items ELSE '[]'::jsonb END)
    || (CASE WHEN jsonb_typeof(NEW.opponent_items) = 'array' THEN NEW.opponent_items ELSE '[]'::jsonb END);

  SELECT count(DISTINCT item->>'id'), COALESCE(sum((item->>'value')::bigint), 0)
  INTO expected_pot_items, gross_pot_value
  FROM jsonb_array_elements(all_pot_items) pot(item)
  WHERE COALESCE(item->>'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND COALESCE(item->>'value', '') ~ '^[0-9]+$';
  IF expected_pot_items = 0 OR gross_pot_value <= 0 THEN
    RAISE EXCEPTION 'The Coinflip pot is invalid';
  END IF;

  IF expected_pot_items < 8 THEN
    NEW.tax_rate_bps := 0;
    NEW.tax_value := 0;
    tax_item_ids := '{}'::uuid[];
  ELSE
    NEW.tax_rate_bps := 1250;
    NEW.tax_value := floor(gross_pot_value::numeric * NEW.tax_rate_bps / 10000)::bigint;
    tax_item_ids := public.select_pvp_tax_item_ids(all_pot_items, NEW.tax_value);
  END IF;

  SELECT
    COALESCE(sum((item->>'value')::bigint), 0),
    COALESCE(jsonb_agg(item ORDER BY (item->>'value')::bigint, item->>'id'), '[]'::jsonb)
  INTO NEW.tax_stock_value, NEW.tax_items
  FROM jsonb_array_elements(all_pot_items) pot(item)
  WHERE (item->>'id')::uuid = ANY(tax_item_ids);

  NEW.tax_change_value := NEW.tax_stock_value - NEW.tax_value;
  NEW.net_payout_value := gross_pot_value - NEW.tax_value;

  INSERT INTO public.tax_stock (
    id, item_id, item_uuid, name, value, image_url, type,
    source_game_type, source_game_id, winner_profile_id, tax_rate_bps
  )
  SELECT
    (item->>'id')::uuid,
    CASE WHEN COALESCE(item->>'item_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN (item->>'item_id')::uuid ELSE NULL END,
    CASE WHEN COALESCE(item->>'item_uuid', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN (item->>'item_uuid')::uuid ELSE (item->>'id')::uuid END,
    COALESCE(NULLIF(item->>'name', ''), 'Unknown item'),
    (item->>'value')::integer,
    NULLIF(item->>'image_url', ''),
    NULLIF(item->>'type', ''),
    'coinflip', NEW.id, NEW.winner_uuid, NEW.tax_rate_bps
  FROM jsonb_array_elements(all_pot_items) pot(item)
  WHERE (item->>'id')::uuid = ANY(tax_item_ids);
  GET DIAGNOSTICS inserted_tax_items = ROW_COUNT;

  INSERT INTO public.inventory_items (
    id, item_id, item_uuid, user_id, name, value, image_url, type, created_at, updated_at
  )
  SELECT
    (item->>'id')::uuid,
    CASE WHEN COALESCE(item->>'item_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN (item->>'item_id')::uuid ELSE NULL END,
    CASE WHEN COALESCE(item->>'item_uuid', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN (item->>'item_uuid')::uuid ELSE (item->>'id')::uuid END,
    NEW.winner_uuid,
    COALESCE(NULLIF(item->>'name', ''), 'Unknown item'),
    (item->>'value')::integer,
    NULLIF(item->>'image_url', ''),
    NULLIF(item->>'type', ''),
    now(), now()
  FROM jsonb_array_elements(all_pot_items) pot(item)
  WHERE NOT ((item->>'id')::uuid = ANY(tax_item_ids));
  GET DIAGNOSTICS inserted_winner_items = ROW_COUNT;

  IF inserted_tax_items + inserted_winner_items <> expected_pot_items THEN
    RAISE EXCEPTION 'The complete Coinflip pot could not be distributed';
  END IF;

  UPDATE public.user_profiles
  SET balance = COALESCE(balance, 0) + NEW.tax_change_value,
      updated_at = now()
  WHERE id::text = NEW.winner_uuid;
  GET DIAGNOSTICS updated_winner = ROW_COUNT;
  IF updated_winner <> 1 THEN RAISE EXCEPTION 'The Coinflip winner profile could not be updated'; END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.settle_resolved_coinflip_items()
  FROM PUBLIC, anon, authenticated;
