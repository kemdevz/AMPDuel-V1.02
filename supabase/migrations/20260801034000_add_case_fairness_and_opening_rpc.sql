ALTER TABLE public.user_profiles
  ALTER COLUMN balance TYPE bigint USING COALESCE(balance, 0)::bigint;

DROP POLICY IF EXISTS "Allow public read/write user_profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can view own user_profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can insert own user_profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can update own user_profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Public profiles are readable" ON public.user_profiles;

CREATE POLICY "Public profiles are readable"
ON public.user_profiles
FOR SELECT
TO anon, authenticated
USING (true);

REVOKE INSERT, UPDATE, DELETE ON public.user_profiles FROM anon, authenticated;
GRANT SELECT ON public.user_profiles TO anon, authenticated;

CREATE TABLE IF NOT EXISTS public.case_fairness_states (
  user_id uuid PRIMARY KEY,
  seed_id uuid NOT NULL UNIQUE,
  server_seed_hash text NOT NULL CHECK (server_seed_hash ~ '^[0-9a-f]{64}$'),
  server_seed_encrypted text NOT NULL CHECK (length(server_seed_encrypted) > 0),
  client_seed text NOT NULL CHECK (length(client_seed) BETWEEN 1 AND 128),
  nonce bigint NOT NULL DEFAULT 0 CHECK (nonce >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT case_fairness_states_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.user_profiles(id) ON UPDATE CASCADE ON DELETE CASCADE
);

ALTER TABLE public.case_fairness_states ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.case_fairness_states FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.ensure_case_fairness_state(
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
  v_profile public.user_profiles%ROWTYPE;
  v_state public.case_fairness_states%ROWTYPE;
BEGIN
  SELECT * INTO v_profile
  FROM public.user_profiles
  WHERE id::text = p_profile_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Your user profile could not be found.';
  END IF;

  INSERT INTO public.case_fairness_states (
    user_id, seed_id, server_seed_hash, server_seed_encrypted, client_seed, nonce
  )
  VALUES (
    v_profile.id, p_seed_id, p_server_seed_hash, p_server_seed_encrypted, p_client_seed, 0
  )
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO STRICT v_state
  FROM public.case_fairness_states
  WHERE user_id = v_profile.id;

  RETURN jsonb_build_object(
    'user_id', v_state.user_id,
    'seed_id', v_state.seed_id,
    'server_seed_hash', v_state.server_seed_hash,
    'server_seed_encrypted', v_state.server_seed_encrypted,
    'client_seed', v_state.client_seed,
    'nonce', v_state.nonce
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.rotate_case_fairness_state(
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
  v_state public.case_fairness_states%ROWTYPE;
BEGIN
  SELECT * INTO v_state
  FROM public.case_fairness_states
  WHERE user_id::text = p_profile_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Case fairness state could not be found.';
  END IF;
  IF v_state.seed_id <> p_expected_seed_id
    OR v_state.server_seed_hash <> p_expected_server_seed_hash
    OR v_state.nonce <> p_expected_nonce THEN
    RAISE EXCEPTION 'Case fairness state changed. Please try again.';
  END IF;

  UPDATE public.case_openings
  SET server_seed = p_previous_server_seed
  WHERE user_id = v_state.user_id
    AND fairness_seed_id = v_state.seed_id
    AND server_seed IS NULL;

  UPDATE public.case_fairness_states
  SET seed_id = p_new_seed_id,
      server_seed_hash = p_new_server_seed_hash,
      server_seed_encrypted = p_new_server_seed_encrypted,
      client_seed = p_new_client_seed,
      nonce = 0,
      updated_at = now()
  WHERE user_id = v_state.user_id;

  RETURN jsonb_build_object(
    'seed_id', p_new_seed_id,
    'server_seed_hash', p_new_server_seed_hash,
    'client_seed', p_new_client_seed,
    'nonce', 0,
    'previous_server_seed', p_previous_server_seed,
    'previous_client_seed', v_state.client_seed,
    'previous_nonce', v_state.nonce
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_case_opening(
  p_profile_id text,
  p_case_id uuid,
  p_batch_id uuid,
  p_expected_seed_id uuid,
  p_expected_server_seed_hash text,
  p_expected_nonce bigint,
  p_client_seed text,
  p_rolls integer[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.user_profiles%ROWTYPE;
  v_case public.cases%ROWTYPE;
  v_state public.case_fairness_states%ROWTYPE;
  v_existing_count integer;
  v_quantity integer;
  v_index integer;
  v_roll integer;
  v_item jsonb;
  v_opening_id uuid;
  v_roll_start integer;
  v_roll_end integer;
  v_item_value bigint;
  v_running_balance bigint;
  v_total_cost bigint;
  v_results jsonb := '[]'::jsonb;
BEGIN
  v_quantity := COALESCE(array_length(p_rolls, 1), 0);
  IF v_quantity < 1 OR v_quantity > 4 THEN
    RAISE EXCEPTION 'Open between 1 and 4 cases at once.';
  END IF;
  IF p_client_seed IS NULL OR length(btrim(p_client_seed)) < 1 OR length(p_client_seed) > 128 THEN
    RAISE EXCEPTION 'Client seed must contain between 1 and 128 characters.';
  END IF;

  SELECT * INTO v_profile
  FROM public.user_profiles
  WHERE id::text = p_profile_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Your user profile could not be found.';
  END IF;

  SELECT count(*) INTO v_existing_count
  FROM public.case_openings
  WHERE user_id = v_profile.id AND batch_id = p_batch_id;

  IF v_existing_count > 0 THEN
    IF v_existing_count <> v_quantity THEN
      RAISE EXCEPTION 'Opening request ID was already used with a different quantity.';
    END IF;
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'opening_id', opening_row.id,
      'batch_position', opening_row.batch_position,
      'item_id', opening_row.winning_item_id,
      'name', opening_row.winning_item_name,
      'value', opening_row.winning_item_value,
      'image_url', opening_row.winning_item_image_url,
      'type', opening_row.winning_item_type,
      'chance', opening_row.winning_item_chance,
      'roll', opening_row.roll,
      'roll_range', jsonb_build_object('start', opening_row.roll_range_start, 'end', opening_row.roll_range_end),
      'nonce', opening_row.nonce
    ) ORDER BY opening_row.batch_position), '[]'::jsonb)
    INTO v_results
    FROM public.case_openings AS opening_row
    WHERE opening_row.user_id = v_profile.id AND opening_row.batch_id = p_batch_id;

    RETURN jsonb_build_object(
      'batch_id', p_batch_id,
      'balance', COALESCE(v_profile.balance, 0),
      'nonce', (SELECT nonce FROM public.case_fairness_states WHERE user_id = v_profile.id),
      'results', v_results,
      'replayed', true
    );
  END IF;

  SELECT * INTO v_state
  FROM public.case_fairness_states
  WHERE user_id = v_profile.id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Case fairness state could not be found.';
  END IF;
  IF v_state.seed_id <> p_expected_seed_id
    OR v_state.server_seed_hash <> p_expected_server_seed_hash
    OR v_state.nonce <> p_expected_nonce
    OR v_state.client_seed <> p_client_seed THEN
    RAISE EXCEPTION 'Case fairness state changed. Please try again.';
  END IF;

  SELECT * INTO v_case
  FROM public.cases
  WHERE uuid = p_case_id
  FOR SHARE;
  IF NOT FOUND OR v_case.active = false THEN
    RAISE EXCEPTION 'This case is unavailable.';
  END IF;
  IF jsonb_typeof(v_case.items) <> 'array' OR jsonb_array_length(v_case.items) < 1 THEN
    RAISE EXCEPTION 'This case has no configured drops.';
  END IF;

  v_total_cost := v_case.price * v_quantity;
  v_running_balance := COALESCE(v_profile.balance, 0);
  IF v_running_balance < v_total_cost THEN
    RAISE EXCEPTION 'Insufficient balance.';
  END IF;

  FOR v_index IN 1..v_quantity LOOP
    v_roll := p_rolls[v_index];
    IF v_roll IS NULL OR v_roll < 0 OR v_roll > 99999 THEN
      RAISE EXCEPTION 'Invalid case roll.';
    END IF;

    SELECT item_row.value INTO v_item
    FROM jsonb_array_elements(v_case.items) AS item_row(value)
    WHERE v_roll BETWEEN
      (item_row.value->'roll_range'->>'start')::integer
      AND (item_row.value->'roll_range'->>'end')::integer
    LIMIT 1;

    IF v_item IS NULL THEN
      RAISE EXCEPTION 'The case roll does not match a configured item range.';
    END IF;

    v_roll_start := (v_item->'roll_range'->>'start')::integer;
    v_roll_end := (v_item->'roll_range'->>'end')::integer;
    v_item_value := (v_item->>'value')::bigint;
    IF v_item_value < 0 OR COALESCE(v_item->>'name', '') = '' THEN
      RAISE EXCEPTION 'The winning item configuration is invalid.';
    END IF;

    v_opening_id := gen_random_uuid();
    INSERT INTO public.case_openings (
      id, batch_id, batch_position, batch_quantity, case_id, user_id,
      case_name, case_price, case_items_snapshot,
      balance_before, coin_payout, balance_after,
      winning_item_id, winning_item_name, winning_item_value, winning_item_image_url,
      winning_item_type, winning_item_chance,
      roll, roll_range_start, roll_range_end,
      fairness_seed_id, server_seed_hash, server_seed, client_seed, nonce
    )
    VALUES (
      v_opening_id, p_batch_id, v_index - 1, v_quantity, v_case.uuid, v_profile.id,
      v_case.name, v_case.price, v_case.items,
      v_running_balance, v_item_value, v_running_balance - v_case.price + v_item_value,
      NULLIF(v_item->>'item_id', '')::uuid, v_item->>'name', v_item_value, v_item->>'image_url',
      COALESCE(NULLIF(v_item->>'type', ''), 'PS99'), (v_item->>'chance')::numeric,
      v_roll, v_roll_start, v_roll_end,
      v_state.seed_id, v_state.server_seed_hash, NULL, v_state.client_seed, v_state.nonce + v_index - 1
    );

    v_running_balance := v_running_balance - v_case.price + v_item_value;
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'opening_id', v_opening_id,
      'batch_position', v_index - 1,
      'item_id', NULLIF(v_item->>'item_id', '')::uuid,
      'name', v_item->>'name',
      'value', v_item_value,
      'image_url', v_item->>'image_url',
      'type', COALESCE(NULLIF(v_item->>'type', ''), 'PS99'),
      'chance', (v_item->>'chance')::numeric,
      'roll', v_roll,
      'roll_range', v_item->'roll_range',
      'nonce', v_state.nonce + v_index - 1
    ));
  END LOOP;

  UPDATE public.user_profiles
  SET balance = v_running_balance,
      updated_at = now()
  WHERE id = v_profile.id;

  UPDATE public.case_fairness_states
  SET nonce = nonce + v_quantity,
      updated_at = now()
  WHERE user_id = v_profile.id;

  RETURN jsonb_build_object(
    'batch_id', p_batch_id,
    'balance', v_running_balance,
    'nonce', v_state.nonce + v_quantity,
    'results', v_results,
    'replayed', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_case_fairness_state(text, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rotate_case_fairness_state(text, uuid, text, bigint, text, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_case_opening(text, uuid, uuid, uuid, text, bigint, text, integer[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_case_fairness_state(text, uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.rotate_case_fairness_state(text, uuid, text, bigint, text, uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_case_opening(text, uuid, uuid, uuid, text, bigint, text, integer[]) TO service_role;
