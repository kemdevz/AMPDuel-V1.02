-- Make every Mines balance/state transition atomic. The browser and Node
-- server must never be able to update these tables directly.

-- mines_games contains the unrevealed board. Even read access would let a
-- browser bypass the public serializer and inspect mine_positions.
REVOKE ALL ON public.mines_games FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mines_games TO service_role;

DROP POLICY IF EXISTS "Users can view mines_games" ON public.mines_games;
DROP POLICY IF EXISTS "Users can insert mines_games" ON public.mines_games;
DROP POLICY IF EXISTS "Users can update mines_games" ON public.mines_games;

CREATE OR REPLACE FUNCTION public.create_mines_game_secure(
  p_profile_id text,
  p_game_id uuid,
  p_wager_value bigint,
  p_mines_count integer,
  p_grid_size integer,
  p_mine_positions jsonb,
  p_server_seed_encrypted text,
  p_server_seed_hash text,
  p_fairness_seed_id uuid,
  p_client_seed text,
  p_nonce bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_profile public.user_profiles%ROWTYPE;
  selected_state public.mines_fairness_states%ROWTYPE;
  created_game public.mines_games%ROWTYPE;
  total_positions integer;
  position_count integer;
BEGIN
  IF p_wager_value < 5000 OR p_wager_value > 10000000
     OR p_grid_size NOT BETWEEN 5 AND 8 THEN
    RAISE EXCEPTION 'Invalid Mines wager or grid size.';
  END IF;

  total_positions := p_grid_size * p_grid_size;
  IF p_mines_count < 1 OR p_mines_count >= total_positions
     OR jsonb_typeof(p_mine_positions) <> 'array' THEN
    RAISE EXCEPTION 'Invalid Mines board.';
  END IF;

  SELECT count(DISTINCT value::integer)
  INTO position_count
  FROM jsonb_array_elements_text(p_mine_positions) AS positions(value)
  WHERE value ~ '^[0-9]+$'
    AND value::integer >= 0
    AND value::integer < total_positions;

  IF position_count <> p_mines_count
     OR jsonb_array_length(p_mine_positions) <> p_mines_count THEN
    RAISE EXCEPTION 'Invalid Mines board.';
  END IF;

  -- Serializes all starts for this player, including simultaneous HTTP requests.
  PERFORM pg_advisory_xact_lock(hashtextextended('mines:' || p_profile_id, 0));

  SELECT * INTO selected_profile
  FROM public.user_profiles
  WHERE id::text = p_profile_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found.'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.mines_games
    WHERE profile_id = p_profile_id AND game_state = 'active'
  ) THEN
    RAISE EXCEPTION 'You already have an active Mines game.';
  END IF;

  SELECT * INTO selected_state
  FROM public.mines_fairness_states
  WHERE user_id::text = p_profile_id
  FOR UPDATE;
  IF NOT FOUND
     OR selected_state.seed_id <> p_fairness_seed_id
     OR selected_state.server_seed_hash <> p_server_seed_hash
     OR selected_state.client_seed <> p_client_seed
     OR selected_state.nonce <> p_nonce THEN
    RAISE EXCEPTION 'Mines fairness state changed. Please try again.';
  END IF;

  IF COALESCE(selected_profile.balance, 0) < p_wager_value THEN
    RAISE EXCEPTION 'Insufficient balance.';
  END IF;

  UPDATE public.user_profiles
  SET balance = balance - p_wager_value, updated_at = now()
  WHERE id = selected_profile.id
  RETURNING * INTO selected_profile;

  UPDATE public.mines_fairness_states
  SET nonce = nonce + 1, updated_at = now()
  WHERE user_id = selected_state.user_id;

  INSERT INTO public.mines_games (
    id, profile_id, username, avatar_url, wager_value, mines_count,
    revealed_positions, mine_positions, game_state, multiplier, current_value,
    server_seed_encrypted, server_seed_hash, fairness_seed_id, client_seed,
    nonce, grid_size
  ) VALUES (
    p_game_id, p_profile_id, selected_profile.username, selected_profile.avatar_url,
    p_wager_value, p_mines_count, '[]'::jsonb, p_mine_positions, 'active', 1, 0,
    p_server_seed_encrypted, p_server_seed_hash, p_fairness_seed_id,
    p_client_seed, p_nonce, p_grid_size
  )
  RETURNING * INTO created_game;

  RETURN jsonb_build_object(
    'game', to_jsonb(created_game),
    'balance', selected_profile.balance
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reveal_mines_position_secure(
  p_profile_id text,
  p_game_id uuid,
  p_position integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_game public.mines_games%ROWTYPE;
  total_positions integer;
  already_revealed boolean;
  is_mine boolean;
  revealed_count integer;
  safe_positions integer;
  index_value integer;
  next_multiplier numeric := 1;
BEGIN
  SELECT * INTO selected_game
  FROM public.mines_games
  WHERE id = p_game_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Mines game not found.'; END IF;
  IF selected_game.profile_id <> p_profile_id THEN
    RAISE EXCEPTION 'You can only reveal your own games.';
  END IF;

  total_positions := COALESCE(selected_game.grid_size, 5) * COALESCE(selected_game.grid_size, 5);
  IF p_position < 0 OR p_position >= total_positions THEN
    RAISE EXCEPTION 'Invalid game or position.';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(COALESCE(selected_game.revealed_positions, '[]'::jsonb)) item
    WHERE item.value::integer = p_position
  ) INTO already_revealed;

  SELECT EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(selected_game.mine_positions) item
    WHERE item.value::integer = p_position
  ) INTO is_mine;

  -- Network retries of an already committed reveal are harmless and idempotent.
  IF already_revealed THEN
    RETURN jsonb_build_object(
      'game', to_jsonb(selected_game), 'is_mine', is_mine, 'duplicate', true
    );
  END IF;
  IF selected_game.game_state <> 'active' THEN
    RAISE EXCEPTION 'Game is not active.';
  END IF;

  selected_game.revealed_positions := selected_game.revealed_positions || to_jsonb(p_position);

  IF is_mine THEN
    UPDATE public.mines_games
    SET revealed_positions = selected_game.revealed_positions,
        game_state = 'exploded', multiplier = 0, current_value = 0
    WHERE id = selected_game.id
    RETURNING * INTO selected_game;
  ELSE
    revealed_count := jsonb_array_length(selected_game.revealed_positions);
    safe_positions := total_positions - selected_game.mines_count;
    FOR index_value IN 0..revealed_count - 1 LOOP
      next_multiplier := next_multiplier
        * (total_positions - index_value)::numeric
        / (safe_positions - index_value)::numeric;
    END LOOP;
    next_multiplier := round(next_multiplier * 0.95, 2);

    UPDATE public.mines_games
    SET revealed_positions = selected_game.revealed_positions,
        multiplier = next_multiplier,
        current_value = round(selected_game.wager_value * next_multiplier)
    WHERE id = selected_game.id
    RETURNING * INTO selected_game;
  END IF;

  RETURN jsonb_build_object(
    'game', to_jsonb(selected_game), 'is_mine', is_mine, 'duplicate', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_mines_game_secure(
  text, uuid, bigint, integer, integer, jsonb, text, text, uuid, text, bigint
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reveal_mines_position_secure(text, uuid, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_mines_game_secure(
  text, uuid, bigint, integer, integer, jsonb, text, text, uuid, text, bigint
) TO service_role;
GRANT EXECUTE ON FUNCTION public.reveal_mines_position_secure(text, uuid, integer)
  TO service_role;
