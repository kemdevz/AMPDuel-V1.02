CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.upgrader_games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,

  profile_id uuid NOT NULL
    REFERENCES public.user_profiles(id)
    ON DELETE RESTRICT,

  wager_mode text NOT NULL
    CHECK (wager_mode IN ('coins', 'items')),

  roll_mode text NOT NULL DEFAULT 'under'
    CHECK (roll_mode IN ('under', 'over')),

  zone_start_degrees numeric(12,8) NOT NULL
    CHECK (zone_start_degrees >= 0 AND zone_start_degrees < 360),

  coin_wager bigint NOT NULL DEFAULT 0
    CHECK (coin_wager >= 0),

  wager_value bigint NOT NULL
    CHECK (wager_value > 0),

  wager_items jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(wager_items) = 'array'),

  wager_inventory_uuids uuid[] NOT NULL DEFAULT '{}',

  target_value bigint NOT NULL
    CHECK (target_value > 0),

  target_items jsonb NOT NULL
    CHECK (
      jsonb_typeof(target_items) = 'array'
      AND jsonb_array_length(target_items) > 0
    ),

  target_stock_uuids uuid[] NOT NULL
    CHECK (cardinality(target_stock_uuids) > 0),

  target_stock_table text NOT NULL
    CHECK (target_stock_table IN ('exchange_stock', 'upgrader_stock')),

  -- Basis points: 100 = 1%, 7500 = 75%.
  chance_bps integer NOT NULL
    CHECK (chance_bps BETWEEN 100 AND 7500),

  -- 1000 basis points = a 10% house edge / 90% RTP.
  house_edge_bps integer NOT NULL DEFAULT 1000
    CHECK (house_edge_bps BETWEEN 0 AND 10000),

  server_seed_hash text NOT NULL
    CHECK (char_length(server_seed_hash) = 64),

  fairness_seed_id uuid NOT NULL,

  -- Must remain server-only until the finalized game is returned.
  server_seed text NOT NULL,

  client_seed text NOT NULL
    CHECK (char_length(client_seed) BETWEEN 1 AND 128),

  nonce bigint NOT NULL
    CHECK (nonce >= 0),

  roll numeric(12,8) NOT NULL
    CHECK (roll >= 0 AND roll < 100),

  won boolean NOT NULL,

  payout_value bigint NOT NULL DEFAULT 0
    CHECK (payout_value >= 0),

  balance_before bigint,
  balance_after_wager bigint,
  balance_after_settlement bigint,

  error_message text,

  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT upgrader_games_wager_source_check CHECK (
    (
      wager_mode = 'coins'
      AND coin_wager = wager_value
      AND coin_wager > 0
      AND cardinality(wager_inventory_uuids) = 0
      AND target_stock_table = 'exchange_stock'
    )
    OR
    (
      wager_mode = 'items'
      AND coin_wager = 0
      AND cardinality(wager_inventory_uuids) > 0
      AND target_stock_table = 'upgrader_stock'
    )
  )
);

-- Keep this migration safe if an earlier draft of the table was already run.
ALTER TABLE public.upgrader_games
  DROP COLUMN IF EXISTS status CASCADE;

ALTER TABLE public.upgrader_games
  ADD COLUMN IF NOT EXISTS zone_start_degrees numeric(12,8) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fairness_seed_id uuid NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE public.upgrader_games
  DROP CONSTRAINT IF EXISTS upgrader_games_zone_start_check;
ALTER TABLE public.upgrader_games
  ADD CONSTRAINT upgrader_games_zone_start_check
  CHECK (zone_start_degrees >= 0 AND zone_start_degrees < 360) NOT VALID;

ALTER TABLE public.upgrader_games
  DROP CONSTRAINT IF EXISTS upgrader_games_result_check;

ALTER TABLE public.upgrader_games
  ADD CONSTRAINT upgrader_games_result_check CHECK (
    won IS NOT NULL
    AND (
      (won IS TRUE AND payout_value > 0)
      OR
      (won IS FALSE AND payout_value = 0)
    )
  ) NOT VALID;

ALTER TABLE public.upgrader_games
  DROP CONSTRAINT IF EXISTS upgrader_games_finalized_check;

ALTER TABLE public.upgrader_games
  ADD CONSTRAINT upgrader_games_finalized_check CHECK (
    roll IS NOT NULL
    AND server_seed IS NOT NULL
    AND resolved_at IS NOT NULL
  ) NOT VALID;

CREATE INDEX IF NOT EXISTS upgrader_games_profile_created_idx
  ON public.upgrader_games (profile_id, created_at DESC);

CREATE INDEX IF NOT EXISTS upgrader_games_created_idx
  ON public.upgrader_games (created_at DESC);

CREATE INDEX IF NOT EXISTS upgrader_games_resolved_idx
  ON public.upgrader_games (resolved_at DESC)
  WHERE resolved_at IS NOT NULL;

ALTER TABLE public.upgrader_games ENABLE ROW LEVEL SECURITY;

-- Game creation and settlement must only happen through the trusted backend.
REVOKE ALL ON TABLE public.upgrader_games FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.upgrader_games TO service_role;

COMMENT ON TABLE public.upgrader_games IS
  'Server-authoritative Upgrader game history, settlement state and provably-fair evidence.';

COMMENT ON COLUMN public.upgrader_games.wager_items IS
  'Immutable wager item snapshots retained after inventory rows are consumed.';

COMMENT ON COLUMN public.upgrader_games.target_items IS
  'Immutable target item snapshots retained after stock rows are awarded or removed.';

COMMENT ON COLUMN public.upgrader_games.server_seed IS
  'Secret server seed; never expose it until the game reaches a terminal state.';

CREATE TABLE IF NOT EXISTS public.upgrader_fairness_states (
  profile_id uuid PRIMARY KEY REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  seed_id uuid NOT NULL UNIQUE,
  server_seed_hash text NOT NULL CHECK (char_length(server_seed_hash) = 64),
  server_seed_encrypted text NOT NULL,
  client_seed text NOT NULL CHECK (char_length(client_seed) BETWEEN 1 AND 128),
  nonce bigint NOT NULL DEFAULT 0 CHECK (nonce >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.upgrader_fairness_states ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.upgrader_fairness_states FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.upgrader_fairness_states TO service_role;

CREATE OR REPLACE FUNCTION public.ensure_upgrader_fairness_state(
  p_profile_id text,
  p_seed_id uuid,
  p_server_seed_hash text,
  p_server_seed_encrypted text,
  p_client_seed text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id uuid;
  v_state public.upgrader_fairness_states%ROWTYPE;
BEGIN
  SELECT id INTO v_profile_id FROM public.user_profiles WHERE id::text = p_profile_id;
  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'Your user profile could not be found.'; END IF;

  INSERT INTO public.upgrader_fairness_states (
    profile_id, seed_id, server_seed_hash, server_seed_encrypted, client_seed
  ) VALUES (
    v_profile_id, p_seed_id, p_server_seed_hash, p_server_seed_encrypted, p_client_seed
  ) ON CONFLICT (profile_id) DO NOTHING;

  SELECT * INTO v_state FROM public.upgrader_fairness_states WHERE profile_id = v_profile_id;
  RETURN to_jsonb(v_state);
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_upgrader_game(
  p_profile_id text,
  p_request_id uuid,
  p_wager_mode text,
  p_roll_mode text,
  p_coin_wager bigint,
  p_wager_inventory_uuids uuid[],
  p_target_stock_uuids uuid[],
  p_zone_start_degrees numeric,
  p_expected_seed_id uuid,
  p_expected_server_seed_hash text,
  p_expected_nonce bigint,
  p_client_seed text,
  p_server_seed text,
  p_roll numeric,
  p_next_seed_id uuid,
  p_next_server_seed_hash text,
  p_next_server_seed_encrypted text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.user_profiles%ROWTYPE;
  v_state public.upgrader_fairness_states%ROWTYPE;
  v_existing public.upgrader_games%ROWTYPE;
  v_game_id uuid := gen_random_uuid();
  v_wager_count integer := COALESCE(cardinality(p_wager_inventory_uuids), 0);
  v_target_count integer := COALESCE(cardinality(p_target_stock_uuids), 0);
  v_available_count integer;
  v_wager_value bigint := 0;
  v_target_value bigint := 0;
  v_chance_bps integer;
  v_won boolean;
  v_distance numeric;
  v_balance_before bigint;
  v_balance_after_wager bigint;
  v_wager_items jsonb := '[]'::jsonb;
  v_target_items jsonb := '[]'::jsonb;
  v_target_table text;
BEGIN
  IF p_wager_mode NOT IN ('coins', 'items') OR p_roll_mode NOT IN ('under', 'over') THEN
    RAISE EXCEPTION 'Invalid Upgrader mode.';
  END IF;
  IF v_target_count < 1 OR v_target_count > 25 THEN RAISE EXCEPTION 'Select between 1 and 25 target items.'; END IF;
  IF p_zone_start_degrees IS NULL OR p_zone_start_degrees < 0 OR p_zone_start_degrees >= 360 THEN
    RAISE EXCEPTION 'Invalid Upgrader win-zone position.';
  END IF;
  IF p_roll IS NULL OR p_roll < 0 OR p_roll >= 100 THEN RAISE EXCEPTION 'Invalid Upgrader roll.'; END IF;
  IF p_client_seed IS NULL OR length(btrim(p_client_seed)) < 1 OR length(p_client_seed) > 128 THEN
    RAISE EXCEPTION 'Client seed must contain between 1 and 128 characters.';
  END IF;
  IF (SELECT count(DISTINCT value) FROM unnest(p_target_stock_uuids) AS selected(value)) <> v_target_count THEN
    RAISE EXCEPTION 'Duplicate target items are not allowed.';
  END IF;

  SELECT * INTO v_profile FROM public.user_profiles WHERE id::text = p_profile_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Your user profile could not be found.'; END IF;

  SELECT * INTO v_existing FROM public.upgrader_games
  WHERE profile_id = v_profile.id AND idempotency_key = p_request_id;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'game_id', v_existing.id, 'request_id', v_existing.idempotency_key,
      'won', v_existing.won, 'roll', v_existing.roll,
      'chance_bps', v_existing.chance_bps, 'wager_value', v_existing.wager_value,
      'target_value', v_existing.target_value, 'payout_value', v_existing.payout_value,
      'balance', v_existing.balance_after_settlement, 'awarded_items', v_existing.target_items,
      'server_seed', v_existing.server_seed, 'server_seed_hash', v_existing.server_seed_hash,
      'client_seed', v_existing.client_seed, 'nonce', v_existing.nonce, 'replayed', true
    );
  END IF;

  SELECT * INTO v_state FROM public.upgrader_fairness_states
  WHERE profile_id = v_profile.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Upgrader fairness state could not be found.'; END IF;
  IF v_state.seed_id <> p_expected_seed_id
    OR v_state.server_seed_hash <> p_expected_server_seed_hash
    OR v_state.nonce <> p_expected_nonce
    OR v_state.client_seed <> p_client_seed
    OR encode(digest(convert_to(p_server_seed, 'UTF8'), 'sha256'::text), 'hex') <> v_state.server_seed_hash THEN
    RAISE EXCEPTION 'Upgrader fairness state changed. Please try again.';
  END IF;

  IF p_wager_mode = 'coins' THEN
    IF v_wager_count <> 0 OR COALESCE(p_coin_wager, 0) <= 0 THEN RAISE EXCEPTION 'Enter a valid coin wager.'; END IF;
    v_wager_value := p_coin_wager;
    v_target_table := 'exchange_stock';
    PERFORM 1 FROM public.exchange_stock WHERE uuid = ANY(p_target_stock_uuids) ORDER BY uuid FOR UPDATE;
    SELECT count(*)::integer, COALESCE(sum(value), 0)::bigint,
      COALESCE(jsonb_agg(jsonb_build_object(
        'stock_uuid', uuid, 'item_id', item_id, 'item_uuid', item_uuid, 'name', name,
        'value', value, 'image_url', image_url, 'type', type
      ) ORDER BY uuid), '[]'::jsonb)
    INTO v_available_count, v_target_value, v_target_items
    FROM public.exchange_stock WHERE uuid = ANY(p_target_stock_uuids);
  ELSE
    IF v_wager_count < 1 OR COALESCE(p_coin_wager, 0) <> 0 THEN RAISE EXCEPTION 'Select at least one wager item.'; END IF;
    IF (SELECT count(DISTINCT value) FROM unnest(p_wager_inventory_uuids) AS selected(value)) <> v_wager_count THEN
      RAISE EXCEPTION 'Duplicate wager items are not allowed.';
    END IF;
    v_target_table := 'upgrader_stock';
    PERFORM 1 FROM public.inventory_items
      WHERE id = ANY(p_wager_inventory_uuids) AND user_id = p_profile_id ORDER BY id FOR UPDATE;
    SELECT count(*)::integer, COALESCE(sum(value), 0)::bigint,
      COALESCE(jsonb_agg(jsonb_build_object(
        'inventory_uuid', id, 'item_id', item_id, 'item_uuid', item_uuid, 'name', name,
        'value', value, 'image_url', image_url, 'type', type
      ) ORDER BY id), '[]'::jsonb)
    INTO v_available_count, v_wager_value, v_wager_items
    FROM public.inventory_items WHERE id = ANY(p_wager_inventory_uuids) AND user_id = p_profile_id;
    IF v_available_count <> v_wager_count THEN RAISE EXCEPTION 'One or more wager items are no longer available.'; END IF;

    PERFORM 1 FROM public.upgrader_stock WHERE uuid = ANY(p_target_stock_uuids) ORDER BY uuid FOR UPDATE;
    SELECT count(*)::integer, COALESCE(sum(value), 0)::bigint,
      COALESCE(jsonb_agg(jsonb_build_object(
        'stock_uuid', uuid, 'item_id', item_id, 'item_uuid', item_uuid, 'name', name,
        'value', value, 'image_url', image_url, 'type', type
      ) ORDER BY uuid), '[]'::jsonb)
    INTO v_available_count, v_target_value, v_target_items
    FROM public.upgrader_stock WHERE uuid = ANY(p_target_stock_uuids);
  END IF;

  IF v_available_count <> v_target_count THEN RAISE EXCEPTION 'One or more target items are no longer available.'; END IF;
  IF v_wager_value <= 0 OR v_target_value <= 0 THEN RAISE EXCEPTION 'The wager or target value is invalid.'; END IF;

  v_chance_bps := round((v_wager_value::numeric * 9000) / v_target_value)::integer;
  IF v_chance_bps < 100 OR v_chance_bps > 7500 THEN RAISE EXCEPTION 'Upgrade chance must be between 1%% and 75%%.'; END IF;

  v_balance_before := COALESCE(v_profile.balance, 0);
  v_balance_after_wager := v_balance_before;
  IF p_wager_mode = 'coins' THEN
    IF v_balance_before < v_wager_value THEN RAISE EXCEPTION 'Insufficient balance.'; END IF;
    v_balance_after_wager := v_balance_before - v_wager_value;
    UPDATE public.user_profiles SET balance = v_balance_after_wager, updated_at = now() WHERE id = v_profile.id;
  ELSE
    INSERT INTO public.upgrader_stock (item_id, item_uuid, name, value, image_url, type, from_user)
    SELECT item_id, item_uuid, name, value, image_url, type, v_profile.username
    FROM public.inventory_items WHERE id = ANY(p_wager_inventory_uuids) AND user_id = p_profile_id;
    DELETE FROM public.inventory_items WHERE id = ANY(p_wager_inventory_uuids) AND user_id = p_profile_id;
  END IF;

  v_distance := mod((p_roll * 3.6 - p_zone_start_degrees + 360)::numeric, 360::numeric);
  v_won := v_distance <= (v_chance_bps::numeric / 10000) * 360;

  IF v_won THEN
    IF p_wager_mode = 'coins' THEN
      INSERT INTO public.inventory_items (item_id, item_uuid, user_id, name, value, image_url, type)
      SELECT item_id, item_uuid, p_profile_id, name, value, image_url, type
      FROM public.exchange_stock WHERE uuid = ANY(p_target_stock_uuids);
      DELETE FROM public.exchange_stock WHERE uuid = ANY(p_target_stock_uuids);
    ELSE
      INSERT INTO public.inventory_items (item_id, item_uuid, user_id, name, value, image_url, type)
      SELECT item_id, item_uuid, p_profile_id, name, value, image_url, type
      FROM public.upgrader_stock WHERE uuid = ANY(p_target_stock_uuids);
      DELETE FROM public.upgrader_stock WHERE uuid = ANY(p_target_stock_uuids);
    END IF;
  END IF;

  UPDATE public.user_profiles
  SET played = COALESCE(played, 0) + v_wager_value,
      won = COALESCE(won, 0) + CASE WHEN v_won THEN GREATEST(v_target_value - v_wager_value, 0) ELSE 0 END,
      lost = COALESCE(lost, 0) + CASE WHEN v_won THEN 0 ELSE v_wager_value END,
      updated_at = now()
  WHERE id = v_profile.id;

  INSERT INTO public.upgrader_games (
    id, idempotency_key, profile_id, wager_mode, roll_mode, zone_start_degrees,
    coin_wager, wager_value, wager_items, wager_inventory_uuids,
    target_value, target_items, target_stock_uuids, target_stock_table,
    chance_bps, fairness_seed_id, server_seed_hash, server_seed, client_seed, nonce,
    roll, won, payout_value, balance_before, balance_after_wager, balance_after_settlement
  ) VALUES (
    v_game_id, p_request_id, v_profile.id, p_wager_mode, p_roll_mode, p_zone_start_degrees,
    CASE WHEN p_wager_mode = 'coins' THEN v_wager_value ELSE 0 END,
    v_wager_value, v_wager_items, COALESCE(p_wager_inventory_uuids, '{}'),
    v_target_value, v_target_items, p_target_stock_uuids, v_target_table,
    v_chance_bps, v_state.seed_id, v_state.server_seed_hash, p_server_seed, v_state.client_seed, v_state.nonce,
    p_roll, v_won, CASE WHEN v_won THEN v_target_value ELSE 0 END,
    v_balance_before, v_balance_after_wager, v_balance_after_wager
  );

  UPDATE public.upgrader_fairness_states
  SET seed_id = p_next_seed_id,
      server_seed_hash = p_next_server_seed_hash,
      server_seed_encrypted = p_next_server_seed_encrypted,
      nonce = 0,
      updated_at = now()
  WHERE profile_id = v_profile.id;

  RETURN jsonb_build_object(
    'game_id', v_game_id, 'request_id', p_request_id, 'won', v_won, 'roll', p_roll,
    'chance_bps', v_chance_bps, 'wager_value', v_wager_value, 'target_value', v_target_value,
    'payout_value', CASE WHEN v_won THEN v_target_value ELSE 0 END,
    'balance', v_balance_after_wager,
    'awarded_items', CASE WHEN v_won THEN v_target_items ELSE '[]'::jsonb END,
    'server_seed', p_server_seed, 'server_seed_hash', v_state.server_seed_hash,
    'client_seed', v_state.client_seed, 'nonce', v_state.nonce, 'replayed', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.rotate_upgrader_fairness_state(
  p_profile_id text,
  p_expected_seed_id uuid,
  p_expected_server_seed_hash text,
  p_expected_nonce bigint,
  p_previous_server_seed text,
  p_new_seed_id uuid,
  p_new_server_seed_hash text,
  p_new_server_seed_encrypted text,
  p_new_client_seed text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state public.upgrader_fairness_states%ROWTYPE;
BEGIN
  SELECT state.* INTO v_state
  FROM public.upgrader_fairness_states AS state
  JOIN public.user_profiles AS profile ON profile.id = state.profile_id
  WHERE profile.id::text = p_profile_id
  FOR UPDATE OF state;
  IF NOT FOUND THEN RAISE EXCEPTION 'Upgrader fairness state could not be found.'; END IF;
  IF v_state.seed_id <> p_expected_seed_id
    OR v_state.server_seed_hash <> p_expected_server_seed_hash
    OR v_state.nonce <> p_expected_nonce
    OR encode(digest(convert_to(p_previous_server_seed, 'UTF8'), 'sha256'::text), 'hex') <> v_state.server_seed_hash THEN
    RAISE EXCEPTION 'Upgrader fairness state changed. Please try again.';
  END IF;
  IF p_new_client_seed IS NULL OR length(btrim(p_new_client_seed)) < 1 OR length(p_new_client_seed) > 128 THEN
    RAISE EXCEPTION 'Client seed must contain between 1 and 128 characters.';
  END IF;

  UPDATE public.upgrader_fairness_states
  SET seed_id = p_new_seed_id,
      server_seed_hash = p_new_server_seed_hash,
      server_seed_encrypted = p_new_server_seed_encrypted,
      client_seed = p_new_client_seed,
      nonce = 0,
      updated_at = now()
  WHERE profile_id = v_state.profile_id;

  RETURN jsonb_build_object(
    'seed_id', p_new_seed_id, 'server_seed_hash', p_new_server_seed_hash,
    'client_seed', p_new_client_seed, 'nonce', 0,
    'previous_server_seed', p_previous_server_seed,
    'previous_server_seed_hash', v_state.server_seed_hash,
    'previous_client_seed', v_state.client_seed, 'previous_nonce', v_state.nonce
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_upgrader_fairness_state(text, uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rotate_upgrader_fairness_state(text, uuid, text, bigint, text, uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_upgrader_game(text, uuid, text, text, bigint, uuid[], uuid[], numeric, uuid, text, bigint, text, text, numeric, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_upgrader_fairness_state(text, uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.rotate_upgrader_fairness_state(text, uuid, text, bigint, text, uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_upgrader_game(text, uuid, text, text, bigint, uuid[], uuid[], numeric, uuid, text, bigint, text, text, numeric, uuid, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.award_upgrader_game_xp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_level integer;
  v_xp bigint;
  v_lifetime_xp bigint;
  v_required bigint;
BEGIN
  SELECT LEAST(GREATEST(COALESCE(level, 1), 1), 200),
         GREATEST(COALESCE(xp, 0), 0) + NEW.wager_value,
         GREATEST(COALESCE(lifetime_xp, 0), 0) + NEW.wager_value
  INTO v_level, v_xp, v_lifetime_xp
  FROM public.user_profiles
  WHERE id = NEW.profile_id
  FOR UPDATE;

  WHILE v_level < 200 LOOP
    v_required := public.profile_xp_required_for_level(v_level);
    EXIT WHEN v_xp < v_required;
    v_xp := v_xp - v_required;
    v_level := v_level + 1;
  END LOOP;
  IF v_level >= 200 THEN v_level := 200; v_xp := 0; END IF;

  UPDATE public.user_profiles
  SET level = v_level, xp = v_xp, lifetime_xp = v_lifetime_xp, updated_at = now()
  WHERE id = NEW.profile_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS award_upgrader_game_xp_trigger ON public.upgrader_games;
CREATE TRIGGER award_upgrader_game_xp_trigger
AFTER INSERT ON public.upgrader_games
FOR EACH ROW EXECUTE FUNCTION public.award_upgrader_game_xp();

REVOKE ALL ON FUNCTION public.award_upgrader_game_xp() FROM PUBLIC, anon, authenticated;
