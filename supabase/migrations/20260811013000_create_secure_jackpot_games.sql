CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.jackpot_games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'countdown', 'resolved', 'cancelled')),
  entrants jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(entrants) = 'array'),
  pot_items jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(pot_items) = 'array'),
  entrant_count integer NOT NULL DEFAULT 0 CHECK (entrant_count >= 0 AND entrant_count <= 50),
  pot_value bigint NOT NULL DEFAULT 0 CHECK (pot_value >= 0),
  server_seed_hash text NOT NULL CHECK (server_seed_hash ~ '^[0-9a-f]{64}$'),
  server_seed_encrypted text NOT NULL,
  server_seed text,
  client_seed text NOT NULL CHECK (length(client_seed) BETWEEN 1 AND 128),
  winning_ticket bigint,
  winner_profile_id text,
  winner_username text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  ends_at timestamptz,
  resolved_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (winning_ticket IS NULL OR winning_ticket >= 0),
  CHECK (status <> 'resolved' OR (
    winner_profile_id IS NOT NULL
    AND winning_ticket IS NOT NULL
    AND server_seed IS NOT NULL
    AND resolved_at IS NOT NULL
  ))
);

CREATE UNIQUE INDEX IF NOT EXISTS jackpot_games_one_active_uidx
  ON public.jackpot_games ((true))
  WHERE status IN ('waiting', 'countdown');
CREATE INDEX IF NOT EXISTS jackpot_games_created_idx
  ON public.jackpot_games (created_at DESC);

ALTER TABLE public.jackpot_games ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.jackpot_games FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.jackpot_games TO service_role;

CREATE OR REPLACE FUNCTION public.join_jackpot_game(
  p_game_id uuid,
  p_profile_id text,
  p_item_ids uuid[],
  p_entrant jsonb,
  p_ends_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_game public.jackpot_games%ROWTYPE;
  v_profile public.user_profiles%ROWTYPE;
  v_items jsonb := '[]'::jsonb;
  v_item_count integer := 0;
  v_item_value bigint := 0;
  v_requested_count integer := 0;
  v_removed_count integer := 0;
  v_entrant jsonb;
BEGIN
  IF p_game_id IS NULL OR NULLIF(btrim(p_profile_id), '') IS NULL THEN
    RAISE EXCEPTION 'The Jackpot entry is invalid.';
  END IF;

  v_requested_count := COALESCE(array_length(p_item_ids, 1), 0);
  IF v_requested_count < 1 OR v_requested_count > 20
     OR v_requested_count <> (SELECT count(DISTINCT item_id) FROM unnest(p_item_ids) AS requested(item_id)) THEN
    RAISE EXCEPTION 'Select between 1 and 20 unique items.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('jackpot:' || p_game_id::text, 0));

  SELECT * INTO v_game
  FROM public.jackpot_games
  WHERE id = p_game_id
  FOR UPDATE;

  IF NOT FOUND OR v_game.status NOT IN ('waiting', 'countdown') THEN
    RAISE EXCEPTION 'Betting has closed for this Jackpot round.';
  END IF;
  IF v_game.status = 'countdown' AND v_game.ends_at <= now() THEN
    RAISE EXCEPTION 'Betting has closed for this Jackpot round.';
  END IF;
  IF v_game.entrant_count >= 50 THEN
    RAISE EXCEPTION 'This Jackpot round is full.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_game.entrants) AS entry(value)
    WHERE entry.value->>'profileId' = p_profile_id
  ) THEN
    RAISE EXCEPTION 'You have already joined this Jackpot round.';
  END IF;

  SELECT * INTO v_profile
  FROM public.user_profiles
  WHERE id::text = p_profile_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Your user profile could not be found.';
  END IF;

  WITH locked_items AS MATERIALIZED (
    SELECT inventory.*
    FROM public.inventory_items AS inventory
    WHERE inventory.user_id = p_profile_id
      AND inventory.id = ANY(p_item_ids)
    ORDER BY inventory.id
    FOR UPDATE
  )
  SELECT
    count(*)::integer,
    COALESCE(sum(value), 0)::bigint,
    COALESCE(jsonb_agg(jsonb_build_object(
      'id', id,
      'item_id', item_id,
      'item_uuid', item_uuid,
      'name', name,
      'value', value,
      'image_url', image_url,
      'type', type
    ) ORDER BY id), '[]'::jsonb)
  INTO v_item_count, v_item_value, v_items
  FROM locked_items;

  IF v_item_count <> v_requested_count THEN
    RAISE EXCEPTION 'One or more selected items are no longer in your inventory.';
  END IF;
  IF v_item_value <= 0 THEN
    RAISE EXCEPTION 'Jackpot items must have a positive value.';
  END IF;

  DELETE FROM public.inventory_items
  WHERE user_id = p_profile_id AND id = ANY(p_item_ids);
  GET DIAGNOSTICS v_removed_count = ROW_COUNT;
  IF v_removed_count <> v_requested_count THEN
    RAISE EXCEPTION 'One or more selected items could not be secured.';
  END IF;

  v_entrant := jsonb_build_object(
    'profileId', p_profile_id,
    'username', COALESCE(NULLIF(v_profile.username, ''), NULLIF(p_entrant->>'username', ''), 'Player'),
    'avatar', COALESCE(NULLIF(v_profile.avatar_headshot_url, ''), NULLIF(v_profile.avatar_url, ''), NULLIF(p_entrant->>'avatar', '')),
    'value', v_item_value,
    'items', v_items,
    'joinedAt', now()
  );

  UPDATE public.jackpot_games
  SET status = 'countdown',
      entrants = entrants || jsonb_build_array(v_entrant),
      pot_items = pot_items || v_items,
      entrant_count = entrant_count + 1,
      pot_value = pot_value + v_item_value,
      started_at = COALESCE(started_at, now()),
      ends_at = COALESCE(ends_at, p_ends_at),
      updated_at = now()
  WHERE id = p_game_id
  RETURNING * INTO v_game;

  RETURN to_jsonb(v_game);
END;
$$;

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
  v_inserted_count integer := 0;
  v_expected_count integer := 0;
  v_updated_profiles integer := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('jackpot:' || p_game_id::text, 0));

  SELECT * INTO v_game
  FROM public.jackpot_games
  WHERE id = p_game_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The Jackpot round could not be found.';
  END IF;
  IF v_game.status = 'resolved' THEN
    RETURN to_jsonb(v_game);
  END IF;
  IF v_game.status <> 'countdown' OR v_game.ends_at > now() THEN
    RAISE EXCEPTION 'This Jackpot round is not ready to settle.';
  END IF;
  IF v_game.entrant_count < 1 OR v_game.pot_value <= 0 OR p_random_value < 0 THEN
    RAISE EXCEPTION 'The Jackpot result is invalid.';
  END IF;
  IF encode(digest(p_server_seed, 'sha256'), 'hex') <> v_game.server_seed_hash THEN
    RAISE EXCEPTION 'The Jackpot server seed does not match its commitment.';
  END IF;

  v_winning_ticket := p_random_value % v_game.pot_value;

  SELECT ranged.entrant INTO v_winner
  FROM (
    SELECT
      entry.entrant,
      sum((entry.entrant->>'value')::bigint) OVER (ORDER BY entry.ordinality) AS range_end
    FROM jsonb_array_elements(v_game.entrants) WITH ORDINALITY AS entry(entrant, ordinality)
  ) AS ranged
  WHERE v_winning_ticket < ranged.range_end
  ORDER BY ranged.range_end
  LIMIT 1;

  IF v_winner IS NULL THEN
    RAISE EXCEPTION 'The Jackpot winner could not be determined.';
  END IF;
  v_winner_id := v_winner->>'profileId';
  v_winner_username := COALESCE(NULLIF(v_winner->>'username', ''), 'Player');

  SELECT jsonb_array_length(v_game.pot_items) INTO v_expected_count;

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
    NULLIF(item->>'image_url', ''),
    NULLIF(item->>'type', ''),
    now(),
    now()
  FROM jsonb_array_elements(v_game.pot_items) AS pot(item);

  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;
  IF v_inserted_count <> v_expected_count THEN
    RAISE EXCEPTION 'The complete Jackpot pot could not be paid out.';
  END IF;

  -- A one-person round is refunded without generating played, won, lost, or
  -- XP totals. This prevents risk-free Jackpot stat/XP farming.
  IF v_game.entrant_count = 1 THEN
    UPDATE public.jackpot_games
    SET status = 'cancelled',
        server_seed = p_server_seed,
        resolved_at = now(),
        updated_at = now()
    WHERE id = p_game_id
    RETURNING * INTO v_game;
    RETURN to_jsonb(v_game);
  END IF;

  FOR v_entrant IN SELECT value FROM jsonb_array_elements(v_game.entrants)
  LOOP
    v_wager := (v_entrant->>'value')::bigint;
    UPDATE public.user_profiles
    SET played = COALESCE(played, 0) + v_wager,
        won = COALESCE(won, 0) + CASE
          WHEN id::text = v_winner_id THEN GREATEST(v_game.pot_value - v_wager, 0)
          ELSE 0
        END,
        lost = COALESCE(lost, 0) + CASE WHEN id::text = v_winner_id THEN 0 ELSE v_wager END,
        updated_at = now()
    WHERE id::text = v_entrant->>'profileId';

    GET DIAGNOSTICS v_updated_profiles = ROW_COUNT;
    IF v_updated_profiles <> 1 THEN
      RAISE EXCEPTION 'A Jackpot participant profile could not be updated.';
    END IF;

    PERFORM public.award_profile_game_xp(
      v_entrant->>'profileId',
      'jackpot',
      v_game.id::text,
      v_wager
    );
  END LOOP;

  UPDATE public.jackpot_games
  SET status = 'resolved',
      winning_ticket = v_winning_ticket,
      winner_profile_id = v_winner_id,
      winner_username = v_winner_username,
      server_seed = p_server_seed,
      resolved_at = now(),
      updated_at = now()
  WHERE id = p_game_id
  RETURNING * INTO v_game;

  RETURN to_jsonb(v_game);
END;
$$;

ALTER TABLE public.profile_xp_events
  DROP CONSTRAINT IF EXISTS profile_xp_events_game_type_check;
ALTER TABLE public.profile_xp_events
  ADD CONSTRAINT profile_xp_events_game_type_check
  CHECK (game_type IN ('case', 'coinflip', 'mines', 'roll', 'jackpot'));

CREATE OR REPLACE FUNCTION public.award_profile_game_xp(
  p_profile_id text,
  p_game_type text,
  p_game_id text,
  p_wager_amount bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_profile public.user_profiles%ROWTYPE;
  inserted_event_id uuid;
  next_level integer;
  next_xp bigint;
  next_lifetime_xp bigint;
  required_xp bigint;
BEGIN
  IF NULLIF(trim(p_profile_id), '') IS NULL
     OR NULLIF(trim(p_game_id), '') IS NULL
     OR p_game_type NOT IN ('case', 'coinflip', 'mines', 'roll', 'jackpot')
     OR p_wager_amount IS NULL
     OR p_wager_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid game XP award.';
  END IF;

  INSERT INTO public.profile_xp_events (profile_id, game_type, game_id, wager_amount, xp_awarded)
  VALUES (p_profile_id, p_game_type, p_game_id, p_wager_amount, p_wager_amount)
  ON CONFLICT (profile_id, game_type, game_id) DO NOTHING
  RETURNING id INTO inserted_event_id;

  SELECT * INTO selected_profile
  FROM public.user_profiles
  WHERE id::text = p_profile_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The XP profile could not be found.';
  END IF;

  IF inserted_event_id IS NULL THEN
    RETURN jsonb_build_object(
      'awarded', false,
      'level', selected_profile.level,
      'xp', selected_profile.xp,
      'lifetime_xp', selected_profile.lifetime_xp
    );
  END IF;

  next_level := LEAST(GREATEST(COALESCE(selected_profile.level, 1), 1), 200);
  next_xp := GREATEST(COALESCE(selected_profile.xp, 0), 0) + p_wager_amount;
  next_lifetime_xp := GREATEST(COALESCE(selected_profile.lifetime_xp, 0), 0) + p_wager_amount;

  WHILE next_level < 200 LOOP
    required_xp := public.profile_xp_required_for_level(next_level);
    EXIT WHEN next_xp < required_xp;
    next_xp := next_xp - required_xp;
    next_level := next_level + 1;
  END LOOP;

  IF next_level >= 200 THEN
    next_level := 200;
    next_xp := 0;
  END IF;

  UPDATE public.user_profiles
  SET level = next_level,
      xp = next_xp,
      lifetime_xp = next_lifetime_xp,
      updated_at = now()
  WHERE id::text = p_profile_id
  RETURNING * INTO selected_profile;

  RETURN jsonb_build_object(
    'awarded', true,
    'xp_awarded', p_wager_amount,
    'level', selected_profile.level,
    'xp', selected_profile.xp,
    'lifetime_xp', selected_profile.lifetime_xp
  );
END;
$$;

REVOKE ALL ON FUNCTION public.join_jackpot_game(uuid, text, uuid[], jsonb, timestamptz)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.settle_jackpot_game(uuid, bigint, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.award_profile_game_xp(text, text, text, bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.join_jackpot_game(uuid, text, uuid[], jsonb, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_jackpot_game(uuid, bigint, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.award_profile_game_xp(text, text, text, bigint) TO service_role;

COMMENT ON TABLE public.jackpot_games IS
  'Server-owned item Jackpot rounds with immutable wager snapshots and provably-fair weighted settlement.';
