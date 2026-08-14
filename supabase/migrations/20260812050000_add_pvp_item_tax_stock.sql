CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Physical PS99 items cannot be split. When the exact 12.5% value falls
-- inside an item, the complete item is retained here and the winner receives
-- the untaxed remainder as a coin balance credit.
CREATE TABLE IF NOT EXISTS public.tax_stock (
  id uuid PRIMARY KEY,
  item_id uuid REFERENCES public.items(id) ON DELETE SET NULL,
  item_uuid uuid NOT NULL UNIQUE,
  name text NOT NULL,
  value integer NOT NULL CHECK (value >= 0),
  image_url text,
  type text,
  source_game_type text NOT NULL CHECK (source_game_type IN ('coinflip', 'jackpot')),
  source_game_id uuid NOT NULL,
  winner_profile_id text NOT NULL,
  tax_rate_bps smallint NOT NULL DEFAULT 1250 CHECK (tax_rate_bps = 1250),
  taxed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_game_type, source_game_id, id)
);

CREATE INDEX IF NOT EXISTS tax_stock_source_game_idx
  ON public.tax_stock (source_game_type, source_game_id);
CREATE INDEX IF NOT EXISTS tax_stock_taxed_at_idx
  ON public.tax_stock (taxed_at DESC);
CREATE INDEX IF NOT EXISTS tax_stock_item_id_idx
  ON public.tax_stock (item_id);

ALTER TABLE public.tax_stock ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tax_stock FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tax_stock TO service_role;

COMMENT ON TABLE public.tax_stock IS
  'Server-owned custody for whole PS99 items retained to fund Coinflip and Jackpot tax.';

ALTER TABLE public.coinflip_games
  ADD COLUMN IF NOT EXISTS tax_rate_bps smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_value bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_stock_value bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_change_value bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS net_payout_value bigint NOT NULL DEFAULT 0;

ALTER TABLE public.jackpot_games
  ADD COLUMN IF NOT EXISTS tax_rate_bps smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_value bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_stock_value bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_change_value bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS net_payout_value bigint NOT NULL DEFAULT 0;

ALTER TABLE public.coinflip_games
  DROP CONSTRAINT IF EXISTS coinflip_games_tax_rate_check,
  DROP CONSTRAINT IF EXISTS coinflip_games_tax_values_check,
  DROP CONSTRAINT IF EXISTS coinflip_games_tax_items_check;
ALTER TABLE public.coinflip_games
  ADD CONSTRAINT coinflip_games_tax_rate_check CHECK (tax_rate_bps IN (0, 1250)),
  ADD CONSTRAINT coinflip_games_tax_values_check CHECK (
    tax_value >= 0 AND tax_stock_value >= tax_value AND tax_change_value = tax_stock_value - tax_value
    AND net_payout_value >= 0
  ),
  ADD CONSTRAINT coinflip_games_tax_items_check CHECK (jsonb_typeof(tax_items) = 'array');

ALTER TABLE public.jackpot_games
  DROP CONSTRAINT IF EXISTS jackpot_games_tax_rate_check,
  DROP CONSTRAINT IF EXISTS jackpot_games_tax_values_check,
  DROP CONSTRAINT IF EXISTS jackpot_games_tax_items_check;
ALTER TABLE public.jackpot_games
  ADD CONSTRAINT jackpot_games_tax_rate_check CHECK (tax_rate_bps IN (0, 1250)),
  ADD CONSTRAINT jackpot_games_tax_values_check CHECK (
    tax_value >= 0 AND tax_stock_value >= tax_value AND tax_change_value = tax_stock_value - tax_value
    AND net_payout_value >= 0
  ),
  ADD CONSTRAINT jackpot_games_tax_items_check CHECK (jsonb_typeof(tax_items) = 'array');

-- Historical settled rows remain accurately marked as untaxed. Any open round
-- and every newly-created round uses the new rate.
UPDATE public.coinflip_games
SET tax_rate_bps = 1250
WHERE result IS NULL AND canceled = false;
UPDATE public.jackpot_games
SET tax_rate_bps = 1250
WHERE status IN ('waiting', 'countdown');

ALTER TABLE public.coinflip_games ALTER COLUMN tax_rate_bps SET DEFAULT 1250;
ALTER TABLE public.jackpot_games ALTER COLUMN tax_rate_bps SET DEFAULT 1250;

-- Choose the lowest-valued whole items until their stock value covers the
-- exact tax target. The excess is returned to the winner as coins.
CREATE OR REPLACE FUNCTION public.select_pvp_tax_item_ids(
  p_items jsonb,
  p_tax_value bigint
)
RETURNS uuid[]
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  selected_ids uuid[] := '{}'::uuid[];
  selected_value bigint := 0;
  selected_item record;
BEGIN
  IF p_tax_value <= 0 THEN RETURN selected_ids; END IF;

  FOR selected_item IN
    SELECT
      (entry.item->>'id')::uuid AS inventory_id,
      (entry.item->>'value')::bigint AS item_value
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_items) = 'array' THEN p_items ELSE '[]'::jsonb END) entry(item)
    WHERE COALESCE(entry.item->>'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      AND COALESCE(entry.item->>'value', '') ~ '^[0-9]+$'
      AND (entry.item->>'value')::bigint > 0
    ORDER BY (entry.item->>'value')::bigint, (entry.item->>'id')::uuid
  LOOP
    selected_ids := array_append(selected_ids, selected_item.inventory_id);
    selected_value := selected_value + selected_item.item_value;
    EXIT WHEN selected_value >= p_tax_value;
  END LOOP;

  IF selected_value < p_tax_value THEN
    RAISE EXCEPTION 'The item pot cannot cover its tax value.';
  END IF;
  RETURN selected_ids;
END;
$$;

REVOKE ALL ON FUNCTION public.select_pvp_tax_item_ids(jsonb, bigint)
  FROM PUBLIC, anon, authenticated;

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

  -- A 12.5% whole-item tax requires at least eight items before a complete
  -- item can represent one eighth of the pot. Smaller pots remain untaxed so
  -- settlement never retains too much of a low-item-count wager.
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

DROP TRIGGER IF EXISTS settle_resolved_coinflip_items_trigger ON public.coinflip_games;
CREATE TRIGGER settle_resolved_coinflip_items_trigger
BEFORE UPDATE OF result ON public.coinflip_games
FOR EACH ROW
WHEN (NEW.result IS NOT NULL AND OLD.result IS NULL)
EXECUTE FUNCTION public.settle_resolved_coinflip_items();

REVOKE ALL ON FUNCTION public.settle_resolved_coinflip_items()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.update_resolved_coinflip_profile_stats()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  creator_wager bigint;
  opponent_wager bigint;
  winner_wager bigint;
  updated_profiles integer;
BEGIN
  IF NEW.result IS NULL OR OLD.result IS NOT NULL THEN RETURN NEW; END IF;
  IF NULLIF(NEW.creator_uuid, '') IS NULL OR NULLIF(NEW.opponent_uuid, '') IS NULL
     OR NEW.creator_uuid = NEW.opponent_uuid OR NULLIF(NEW.winner_uuid, '') IS NULL
     OR NEW.winner_uuid NOT IN (NEW.creator_uuid, NEW.opponent_uuid) THEN
    RAISE EXCEPTION 'Invalid resolved coinflip participants or winner';
  END IF;

  SELECT COALESCE(sum(CASE WHEN COALESCE(item->>'value', '') ~ '^[0-9]+$'
    THEN (item->>'value')::bigint ELSE 0 END), 0)
  INTO creator_wager
  FROM jsonb_array_elements(CASE WHEN jsonb_typeof(NEW.creator_items) = 'array' THEN NEW.creator_items ELSE '[]'::jsonb END) wager(item);
  SELECT COALESCE(sum(CASE WHEN COALESCE(item->>'value', '') ~ '^[0-9]+$'
    THEN (item->>'value')::bigint ELSE 0 END), 0)
  INTO opponent_wager
  FROM jsonb_array_elements(CASE WHEN jsonb_typeof(NEW.opponent_items) = 'array' THEN NEW.opponent_items ELSE '[]'::jsonb END) wager(item);
  IF creator_wager <= 0 OR opponent_wager <= 0 THEN
    RAISE EXCEPTION 'Resolved coinflip wagers must have a positive value';
  END IF;
  winner_wager := CASE WHEN NEW.winner_uuid = NEW.creator_uuid THEN creator_wager ELSE opponent_wager END;

  UPDATE public.user_profiles profile
  SET played = profile.played + CASE WHEN profile.id::text = NEW.creator_uuid THEN creator_wager ELSE opponent_wager END,
      won = profile.won + CASE WHEN profile.id::text = NEW.winner_uuid
        THEN GREATEST(NEW.net_payout_value - winner_wager, 0) ELSE 0 END,
      lost = profile.lost + CASE WHEN profile.id::text = NEW.winner_uuid THEN 0
        WHEN profile.id::text = NEW.creator_uuid THEN creator_wager ELSE opponent_wager END,
      updated_at = now()
  WHERE profile.id::text IN (NEW.creator_uuid, NEW.opponent_uuid);
  GET DIAGNOSTICS updated_profiles = ROW_COUNT;
  IF updated_profiles <> 2 THEN RAISE EXCEPTION 'Both coinflip participant profiles must exist'; END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.update_resolved_coinflip_profile_stats()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.settle_jackpot_game(
  p_game_id uuid,
  p_random_value bigint,
  p_server_seed text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_game public.jackpot_games%ROWTYPE;
  v_winner jsonb;
  v_entrant jsonb;
  v_winner_id text;
  v_winner_username text;
  v_winning_ticket bigint;
  v_wager bigint;
  v_tax_value bigint := 0;
  v_tax_stock_value bigint := 0;
  v_tax_change_value bigint := 0;
  v_net_payout_value bigint := 0;
  v_tax_item_ids uuid[] := '{}'::uuid[];
  v_tax_items jsonb := '[]'::jsonb;
  v_inserted_count integer := 0;
  v_taxed_count integer := 0;
  v_expected_count integer := 0;
  v_updated_profiles integer := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('jackpot:' || p_game_id::text, 0));
  SELECT * INTO v_game FROM public.jackpot_games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'The Jackpot round could not be found.'; END IF;
  IF v_game.status = 'resolved' THEN RETURN to_jsonb(v_game); END IF;
  IF v_game.status <> 'countdown' OR v_game.ends_at > now() THEN
    RAISE EXCEPTION 'This Jackpot round is not ready to settle.';
  END IF;
  IF v_game.entrant_count < 1 OR v_game.pot_value <= 0 OR p_random_value < 0 THEN
    RAISE EXCEPTION 'The Jackpot result is invalid.';
  END IF;
  IF encode(extensions.digest(convert_to(p_server_seed, 'UTF8'), 'sha256'::text), 'hex') <> v_game.server_seed_hash THEN
    RAISE EXCEPTION 'The Jackpot server seed does not match its commitment.';
  END IF;

  v_winning_ticket := p_random_value % v_game.pot_value;
  SELECT ranged.entrant INTO v_winner
  FROM (
    SELECT entry.entrant,
      sum((entry.entrant->>'value')::bigint) OVER (ORDER BY entry.ordinality) AS range_end
    FROM jsonb_array_elements(v_game.entrants) WITH ORDINALITY entry(entrant, ordinality)
  ) ranged
  WHERE v_winning_ticket < ranged.range_end
  ORDER BY ranged.range_end
  LIMIT 1;
  IF v_winner IS NULL THEN RAISE EXCEPTION 'The Jackpot winner could not be determined.'; END IF;
  v_winner_id := v_winner->>'profileId';
  v_winner_username := COALESCE(NULLIF(v_winner->>'username', ''), 'Player');
  SELECT jsonb_array_length(v_game.pot_items) INTO v_expected_count;

  -- A one-person round is a complete untaxed refund.
  IF v_game.entrant_count = 1 THEN
    INSERT INTO public.inventory_items (
      id, item_id, item_uuid, user_id, name, value, image_url, type, created_at, updated_at
    )
    SELECT
      (item->>'id')::uuid,
      NULLIF(item->>'item_id', '')::uuid,
      COALESCE(NULLIF(item->>'item_uuid', '')::uuid, (item->>'id')::uuid),
      v_winner_id,
      COALESCE(NULLIF(item->>'name', ''), 'Unknown item'),
      (item->>'value')::integer,
      NULLIF(item->>'image_url', ''), NULLIF(item->>'type', ''), now(), now()
    FROM jsonb_array_elements(v_game.pot_items) pot(item);
    GET DIAGNOSTICS v_inserted_count = ROW_COUNT;
    IF v_inserted_count <> v_expected_count THEN
      RAISE EXCEPTION 'The complete Jackpot refund could not be paid out.';
    END IF;

    UPDATE public.jackpot_games
    SET status = 'cancelled', tax_rate_bps = 1250, tax_value = 0,
        tax_stock_value = 0, tax_change_value = 0, tax_items = '[]'::jsonb,
        net_payout_value = pot_value, server_seed = p_server_seed,
        resolved_at = now(), updated_at = now()
    WHERE id = p_game_id RETURNING * INTO v_game;
    RETURN to_jsonb(v_game);
  END IF;

  v_tax_value := floor(v_game.pot_value::numeric * 1250 / 10000)::bigint;
  v_tax_item_ids := public.select_pvp_tax_item_ids(v_game.pot_items, v_tax_value);
  SELECT
    COALESCE(sum((item->>'value')::bigint), 0),
    COALESCE(jsonb_agg(item ORDER BY (item->>'value')::bigint, item->>'id'), '[]'::jsonb)
  INTO v_tax_stock_value, v_tax_items
  FROM jsonb_array_elements(v_game.pot_items) pot(item)
  WHERE (item->>'id')::uuid = ANY(v_tax_item_ids);
  v_tax_change_value := v_tax_stock_value - v_tax_value;
  v_net_payout_value := v_game.pot_value - v_tax_value;

  INSERT INTO public.tax_stock (
    id, item_id, item_uuid, name, value, image_url, type,
    source_game_type, source_game_id, winner_profile_id, tax_rate_bps
  )
  SELECT
    (item->>'id')::uuid,
    NULLIF(item->>'item_id', '')::uuid,
    COALESCE(NULLIF(item->>'item_uuid', '')::uuid, (item->>'id')::uuid),
    COALESCE(NULLIF(item->>'name', ''), 'Unknown item'),
    (item->>'value')::integer,
    NULLIF(item->>'image_url', ''), NULLIF(item->>'type', ''),
    'jackpot', v_game.id, v_winner_id, 1250
  FROM jsonb_array_elements(v_game.pot_items) pot(item)
  WHERE (item->>'id')::uuid = ANY(v_tax_item_ids);
  GET DIAGNOSTICS v_taxed_count = ROW_COUNT;

  INSERT INTO public.inventory_items (
    id, item_id, item_uuid, user_id, name, value, image_url, type, created_at, updated_at
  )
  SELECT
    (item->>'id')::uuid,
    NULLIF(item->>'item_id', '')::uuid,
    COALESCE(NULLIF(item->>'item_uuid', '')::uuid, (item->>'id')::uuid),
    v_winner_id,
    COALESCE(NULLIF(item->>'name', ''), 'Unknown item'),
    (item->>'value')::integer,
    NULLIF(item->>'image_url', ''), NULLIF(item->>'type', ''), now(), now()
  FROM jsonb_array_elements(v_game.pot_items) pot(item)
  WHERE NOT ((item->>'id')::uuid = ANY(v_tax_item_ids));
  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;
  IF v_inserted_count + v_taxed_count <> v_expected_count THEN
    RAISE EXCEPTION 'The complete Jackpot pot could not be distributed.';
  END IF;

  UPDATE public.user_profiles
  SET balance = COALESCE(balance, 0) + v_tax_change_value,
      updated_at = now()
  WHERE id::text = v_winner_id;
  GET DIAGNOSTICS v_updated_profiles = ROW_COUNT;
  IF v_updated_profiles <> 1 THEN RAISE EXCEPTION 'The Jackpot winner profile could not be updated.'; END IF;

  FOR v_entrant IN SELECT value FROM jsonb_array_elements(v_game.entrants)
  LOOP
    v_wager := (v_entrant->>'value')::bigint;
    UPDATE public.user_profiles
    SET played = COALESCE(played, 0) + v_wager,
        won = COALESCE(won, 0) + CASE WHEN id::text = v_winner_id
          THEN GREATEST(v_net_payout_value - v_wager, 0) ELSE 0 END,
        lost = COALESCE(lost, 0) + CASE WHEN id::text = v_winner_id THEN 0 ELSE v_wager END,
        updated_at = now()
    WHERE id::text = v_entrant->>'profileId';
    GET DIAGNOSTICS v_updated_profiles = ROW_COUNT;
    IF v_updated_profiles <> 1 THEN
      RAISE EXCEPTION 'A Jackpot participant profile could not be updated.';
    END IF;
    PERFORM public.award_profile_game_xp(
      v_entrant->>'profileId', 'jackpot', v_game.id::text, v_wager
    );
  END LOOP;

  UPDATE public.jackpot_games
  SET status = 'resolved', winning_ticket = v_winning_ticket,
      winner_profile_id = v_winner_id, winner_username = v_winner_username,
      tax_rate_bps = 1250, tax_value = v_tax_value,
      tax_stock_value = v_tax_stock_value, tax_change_value = v_tax_change_value,
      tax_items = v_tax_items, net_payout_value = v_net_payout_value,
      server_seed = p_server_seed, resolved_at = now(), updated_at = now()
  WHERE id = p_game_id RETURNING * INTO v_game;
  RETURN to_jsonb(v_game);
END;
$$;

REVOKE ALL ON FUNCTION public.settle_jackpot_game(uuid, bigint, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_jackpot_game(uuid, bigint, text)
  TO service_role;
