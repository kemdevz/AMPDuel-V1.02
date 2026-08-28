-- Complete the two-player Mines lifecycle with authoritative turns, settlement,
-- and the same whole-item 12.5% tax policy used by Coinflip.

ALTER TABLE public.mines_games
  ADD COLUMN IF NOT EXISTS mine_positions integer[] NOT NULL DEFAULT '{}'::integer[],
  ADD COLUMN IF NOT EXISTS current_turn_uuid text,
  ADD COLUMN IF NOT EXISTS turn_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS winner_uuid text,
  ADD COLUMN IF NOT EXISTS loser_uuid text,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS tax_rate_bps smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_value numeric(20, 4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_stock_value numeric(20, 4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_change_value numeric(20, 4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS net_payout_value numeric(20, 4) NOT NULL DEFAULT 0;

ALTER TABLE public.mines_games
  DROP CONSTRAINT IF EXISTS mines_games_tax_rate_check,
  DROP CONSTRAINT IF EXISTS mines_games_tax_values_check,
  DROP CONSTRAINT IF EXISTS mines_games_tax_items_check;

ALTER TABLE public.mines_games
  ADD CONSTRAINT mines_games_tax_rate_check CHECK (tax_rate_bps IN (0, 1250)),
  ADD CONSTRAINT mines_games_tax_values_check CHECK (
    tax_value >= 0 AND tax_stock_value >= tax_value
    AND tax_change_value = tax_stock_value - tax_value
    AND net_payout_value >= 0
  ),
  ADD CONSTRAINT mines_games_tax_items_check CHECK (jsonb_typeof(tax_items) = 'array');

-- Mines and Coinflip fund the same item-tax stock.
ALTER TABLE public.tax_stock
  DROP CONSTRAINT IF EXISTS tax_stock_source_game_type_check;
ALTER TABLE public.tax_stock
  ADD CONSTRAINT tax_stock_source_game_type_check
  CHECK (source_game_type IN ('coinflip', 'mines'));

CREATE OR REPLACE FUNCTION public.start_mines_game(
  p_game_id uuid,
  p_mine_positions integer[],
  p_first_turn_uuid text
)
RETURNS public.mines_games
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_game public.mines_games;
  v_distinct_positions integer;
BEGIN
  SELECT * INTO v_game FROM public.mines_games WHERE id = p_game_id FOR UPDATE;
  IF v_game.id IS NULL THEN RAISE EXCEPTION 'Mines game not found.'; END IF;
  IF v_game.status <> 'active' OR jsonb_array_length(v_game.participants) <> 2 THEN
    RAISE EXCEPTION 'Mines game is not ready to start.';
  END IF;
  IF coalesce(array_length(v_game.mine_positions, 1), 0) > 0
     AND nullif(v_game.current_turn_uuid, '') IS NOT NULL
     AND v_game.turn_expires_at IS NOT NULL THEN
    RETURN v_game;
  END IF;

  SELECT count(DISTINCT position) INTO v_distinct_positions FROM unnest(p_mine_positions) position;
  IF coalesce(array_length(p_mine_positions, 1), 0) <> v_game.mine_count
     OR v_distinct_positions <> v_game.mine_count
     OR EXISTS (SELECT 1 FROM unnest(p_mine_positions) position WHERE position < 0 OR position >= v_game.grid_size * v_game.grid_size) THEN
    RAISE EXCEPTION 'Invalid Mines board layout.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_game.participants) participant
    WHERE participant->>'uuid' = p_first_turn_uuid
  ) THEN
    RAISE EXCEPTION 'Invalid starting Mines player.';
  END IF;

  UPDATE public.mines_games
  SET mine_positions = p_mine_positions,
      current_turn_uuid = p_first_turn_uuid,
      turn_expires_at = now() + interval '20 seconds',
      updated_at = now()
  WHERE id = p_game_id
  RETURNING * INTO v_game;
  RETURN v_game;
END;
$$;

REVOKE ALL ON FUNCTION public.start_mines_game(uuid, integer[], text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_mines_game(uuid, integer[], text) TO service_role;

CREATE OR REPLACE FUNCTION public.settle_completed_mines_items()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  expected_pot_items integer := 0;
  inserted_winner_items integer := 0;
  inserted_tax_items integer := 0;
  updated_winner integer := 0;
  gross_pot_value numeric := 0;
  tax_item_ids uuid[] := '{}'::uuid[];
  all_pot_items jsonb := '[]'::jsonb;
BEGIN
  IF NEW.status <> 'completed' OR OLD.status = 'completed' THEN RETURN NEW; END IF;
  IF NULLIF(NEW.winner_uuid, '') IS NULL OR NULLIF(NEW.loser_uuid, '') IS NULL
     OR NEW.winner_uuid = NEW.loser_uuid
     OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(NEW.participants) p WHERE p->>'uuid' = NEW.winner_uuid)
     OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(NEW.participants) p WHERE p->>'uuid' = NEW.loser_uuid) THEN
    RAISE EXCEPTION 'Invalid resolved Mines participants or winner.';
  END IF;

  SELECT coalesce(jsonb_agg(item.value), '[]'::jsonb)
  INTO all_pot_items
  FROM jsonb_array_elements(NEW.participants) participant
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(participant->'items') = 'array' THEN participant->'items' ELSE '[]'::jsonb END
  ) item(value);

  SELECT count(DISTINCT item->>'id'), coalesce(sum((item->>'value')::numeric), 0)
  INTO expected_pot_items, gross_pot_value
  FROM jsonb_array_elements(all_pot_items) pot(item)
  WHERE coalesce(item->>'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND coalesce(item->>'value', '') ~ '^[0-9]+(\.[0-9]{1,4})?$';
  IF expected_pot_items = 0 OR gross_pot_value <= 0 THEN RAISE EXCEPTION 'The Mines pot is invalid.'; END IF;

  IF expected_pot_items < 8 THEN
    NEW.tax_rate_bps := 0;
    NEW.tax_value := 0;
  ELSE
    NEW.tax_rate_bps := 1250;
    NEW.tax_value := round(gross_pot_value * NEW.tax_rate_bps / 10000, 4);
    tax_item_ids := public.select_pvp_tax_item_ids(all_pot_items, NEW.tax_value);
  END IF;

  SELECT coalesce(sum((item->>'value')::numeric), 0),
         coalesce(jsonb_agg(item ORDER BY (item->>'value')::numeric, item->>'id'), '[]'::jsonb)
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
    CASE WHEN coalesce(item->>'item_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN (item->>'item_id')::uuid ELSE NULL END,
    CASE WHEN coalesce(item->>'item_uuid', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN (item->>'item_uuid')::uuid ELSE (item->>'id')::uuid END,
    coalesce(nullif(item->>'name', ''), 'Unknown item'),
    (item->>'value')::numeric,
    nullif(item->>'image_url', ''),
    nullif(item->>'type', ''),
    'mines', NEW.id, NEW.winner_uuid, NEW.tax_rate_bps
  FROM jsonb_array_elements(all_pot_items) pot(item)
  WHERE (item->>'id')::uuid = ANY(tax_item_ids);
  GET DIAGNOSTICS inserted_tax_items = ROW_COUNT;

  INSERT INTO public.inventory_items (
    id, item_id, item_uuid, user_id, name, value, image_url, type, created_at, updated_at
  )
  SELECT
    (item->>'id')::uuid,
    CASE WHEN coalesce(item->>'item_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN (item->>'item_id')::uuid ELSE NULL END,
    CASE WHEN coalesce(item->>'item_uuid', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN (item->>'item_uuid')::uuid ELSE (item->>'id')::uuid END,
    NEW.winner_uuid,
    coalesce(nullif(item->>'name', ''), 'Unknown item'),
    (item->>'value')::numeric,
    nullif(item->>'image_url', ''),
    nullif(item->>'type', ''),
    now(), now()
  FROM jsonb_array_elements(all_pot_items) pot(item)
  WHERE NOT ((item->>'id')::uuid = ANY(tax_item_ids));
  GET DIAGNOSTICS inserted_winner_items = ROW_COUNT;

  IF inserted_tax_items + inserted_winner_items <> expected_pot_items THEN
    RAISE EXCEPTION 'The complete Mines pot could not be distributed.';
  END IF;

  UPDATE public.user_profiles
  SET balance = coalesce(balance, 0) + NEW.tax_change_value, updated_at = now()
  WHERE id::text = NEW.winner_uuid;
  GET DIAGNOSTICS updated_winner = ROW_COUNT;
  IF updated_winner <> 1 THEN RAISE EXCEPTION 'The Mines winner profile could not be updated.'; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS settle_completed_mines_items_trigger ON public.mines_games;
CREATE TRIGGER settle_completed_mines_items_trigger
BEFORE UPDATE OF status ON public.mines_games
FOR EACH ROW
WHEN (NEW.status = 'completed' AND OLD.status <> 'completed')
EXECUTE FUNCTION public.settle_completed_mines_items();

REVOKE ALL ON FUNCTION public.settle_completed_mines_items() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.play_mines_turn(
  p_game_id uuid,
  p_profile_id text,
  p_cell integer,
  p_is_auto boolean,
  p_server_seed text
)
RETURNS public.mines_games
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_game public.mines_games;
  v_first_uuid text;
  v_second_uuid text;
  v_next_uuid text;
  v_hit_mine boolean;
BEGIN
  SELECT * INTO v_game FROM public.mines_games WHERE id = p_game_id FOR UPDATE;
  IF v_game.id IS NULL THEN RAISE EXCEPTION 'Mines game not found.'; END IF;
  IF v_game.status <> 'active' OR coalesce(array_length(v_game.mine_positions, 1), 0) <> v_game.mine_count THEN
    RAISE EXCEPTION 'This Mines game is not active.';
  END IF;
  IF v_game.current_turn_uuid <> p_profile_id THEN RAISE EXCEPTION 'It is not this player''s turn.'; END IF;
  IF p_is_auto AND now() < v_game.turn_expires_at THEN RAISE EXCEPTION 'This Mines turn has not expired.'; END IF;
  IF NOT p_is_auto AND now() > v_game.turn_expires_at THEN RAISE EXCEPTION 'This Mines turn has expired.'; END IF;
  IF p_cell < 0 OR p_cell >= v_game.grid_size * v_game.grid_size OR p_cell = ANY(v_game.revealed_cells) THEN
    RAISE EXCEPTION 'Invalid or already revealed Mines cell.';
  END IF;
  IF encode(extensions.digest(p_server_seed, 'sha256'), 'hex') <> v_game.server_seed_hash THEN
    RAISE EXCEPTION 'Mines server seed commitment is invalid.';
  END IF;

  v_first_uuid := v_game.participants->0->>'uuid';
  v_second_uuid := v_game.participants->1->>'uuid';
  v_next_uuid := CASE WHEN p_profile_id = v_first_uuid THEN v_second_uuid ELSE v_first_uuid END;
  v_hit_mine := p_cell = ANY(v_game.mine_positions);

  UPDATE public.mines_games
  SET revealed_cells = array_append(revealed_cells, p_cell),
      current_turn_uuid = CASE WHEN v_hit_mine THEN NULL ELSE v_next_uuid END,
      turn_expires_at = CASE WHEN v_hit_mine THEN NULL ELSE now() + interval '20 seconds' END,
      winner_uuid = CASE WHEN v_hit_mine THEN v_next_uuid ELSE winner_uuid END,
      loser_uuid = CASE WHEN v_hit_mine THEN p_profile_id ELSE loser_uuid END,
      status = CASE WHEN v_hit_mine THEN 'completed' ELSE status END,
      server_seed = CASE WHEN v_hit_mine THEN p_server_seed ELSE server_seed END,
      resolved_at = CASE WHEN v_hit_mine THEN now() ELSE resolved_at END,
      updated_at = now()
  WHERE id = p_game_id
  RETURNING * INTO v_game;
  RETURN v_game;
END;
$$;

REVOKE ALL ON FUNCTION public.play_mines_turn(uuid, text, integer, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.play_mines_turn(uuid, text, integer, boolean, text) TO service_role;

CREATE OR REPLACE FUNCTION public.update_completed_mines_profile_stats()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_first_uuid text := NEW.participants->0->>'uuid';
  v_second_uuid text := NEW.participants->1->>'uuid';
  v_first_wager numeric := 0;
  v_second_wager numeric := 0;
  v_winner_wager numeric := 0;
  v_updated integer := 0;
BEGIN
  IF NEW.status <> 'completed' OR OLD.status = 'completed' THEN RETURN NEW; END IF;
  SELECT coalesce(sum((item->>'value')::numeric), 0) INTO v_first_wager
  FROM jsonb_array_elements(NEW.participants->0->'items') item;
  SELECT coalesce(sum((item->>'value')::numeric), 0) INTO v_second_wager
  FROM jsonb_array_elements(NEW.participants->1->'items') item;
  v_winner_wager := CASE WHEN NEW.winner_uuid = v_first_uuid THEN v_first_wager ELSE v_second_wager END;

  UPDATE public.user_profiles profile
  SET played = profile.played + CASE WHEN profile.id::text = v_first_uuid THEN v_first_wager ELSE v_second_wager END,
      won = profile.won + CASE WHEN profile.id::text = NEW.winner_uuid THEN greatest(NEW.net_payout_value - v_winner_wager, 0) ELSE 0 END,
      lost = profile.lost + CASE WHEN profile.id::text = NEW.loser_uuid THEN CASE WHEN profile.id::text = v_first_uuid THEN v_first_wager ELSE v_second_wager END ELSE 0 END,
      updated_at = now()
  WHERE profile.id::text IN (v_first_uuid, v_second_uuid);
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 2 THEN RAISE EXCEPTION 'Both Mines participant profiles must exist.'; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_completed_mines_profile_stats_trigger ON public.mines_games;
CREATE TRIGGER update_completed_mines_profile_stats_trigger
AFTER UPDATE OF status ON public.mines_games
FOR EACH ROW
WHEN (NEW.status = 'completed' AND OLD.status <> 'completed')
EXECUTE FUNCTION public.update_completed_mines_profile_stats();

REVOKE ALL ON FUNCTION public.update_completed_mines_profile_stats() FROM PUBLIC, anon, authenticated;

CREATE INDEX IF NOT EXISTS mines_games_expired_turn_idx
  ON public.mines_games (turn_expires_at)
  WHERE status = 'active';

NOTIFY pgrst, 'reload schema';
