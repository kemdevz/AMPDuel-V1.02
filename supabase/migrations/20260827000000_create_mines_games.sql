CREATE TABLE IF NOT EXISTS public.mines_games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_uuid text NOT NULL,
  creator_username text NOT NULL,
  creator_avatar_url text,
  creator_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  game_mode text NOT NULL,
  grid_size smallint NOT NULL,
  mine_count smallint NOT NULL,
  max_players smallint NOT NULL,
  participants jsonb NOT NULL DEFAULT '[]'::jsonb,
  revealed_cells integer[] NOT NULL DEFAULT '{}'::integer[],
  server_seed_hash text NOT NULL,
  server_seed_encrypted text NOT NULL,
  server_seed text,
  client_seed text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mines_games_mode_check CHECK (game_mode IN ('mm2', 'adm', 'ps99')),
  CONSTRAINT mines_games_grid_check CHECK (grid_size = 5),
  CONSTRAINT mines_games_mine_check CHECK (mine_count BETWEEN 1 AND 24),
  CONSTRAINT mines_games_players_check CHECK (max_players = 2),
  CONSTRAINT mines_games_status_check CHECK (status IN ('open', 'active', 'completed', 'canceled')),
  CONSTRAINT mines_games_items_check CHECK (jsonb_typeof(creator_items) = 'array'),
  CONSTRAINT mines_games_participants_check CHECK (jsonb_typeof(participants) = 'array')
);

-- CREATE TABLE IF NOT EXISTS does not add columns to a legacy mines_games
-- table. Keep this migration safe to rerun against installations that already
-- had the earlier Mines schema.
ALTER TABLE public.mines_games
  ADD COLUMN IF NOT EXISTS server_seed_hash text,
  ADD COLUMN IF NOT EXISTS server_seed_encrypted text,
  ADD COLUMN IF NOT EXISTS server_seed text,
  ADD COLUMN IF NOT EXISTS client_seed text;

UPDATE public.mines_games
SET
  server_seed_hash = coalesce(server_seed_hash, 'legacy-' || id::text),
  server_seed_encrypted = coalesce(server_seed_encrypted, 'legacy'),
  client_seed = coalesce(client_seed, 'legacy-' || id::text)
WHERE server_seed_hash IS NULL
   OR server_seed_encrypted IS NULL
   OR client_seed IS NULL;

ALTER TABLE public.mines_games
  ALTER COLUMN server_seed_hash SET NOT NULL,
  ALTER COLUMN server_seed_encrypted SET NOT NULL,
  ALTER COLUMN client_seed SET NOT NULL;

CREATE INDEX IF NOT EXISTS mines_games_mode_status_created_idx
  ON public.mines_games (game_mode, status, created_at DESC);
CREATE INDEX IF NOT EXISTS mines_games_creator_idx
  ON public.mines_games (creator_uuid, created_at DESC);

ALTER TABLE public.mines_games ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view mines games" ON public.mines_games;
CREATE POLICY "Anyone can view mines games" ON public.mines_games FOR SELECT USING (true);

REVOKE INSERT, UPDATE, DELETE ON public.mines_games FROM anon, authenticated;
GRANT SELECT ON public.mines_games TO anon, authenticated;
GRANT ALL ON public.mines_games TO service_role;

DROP FUNCTION IF EXISTS public.create_mines_game(text, text, text, text, integer, integer, integer, uuid[]);

CREATE OR REPLACE FUNCTION public.create_mines_game(
  p_profile_id text,
  p_username text,
  p_avatar_url text,
  p_game_mode text,
  p_grid_size integer,
  p_mine_count integer,
  p_max_players integer,
  p_item_ids uuid[],
  p_server_seed_hash text,
  p_server_seed_encrypted text,
  p_client_seed text
)
RETURNS public.mines_games
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item_count integer;
  v_items jsonb;
  v_game public.mines_games;
BEGIN
  IF p_profile_id IS NULL OR btrim(p_profile_id) = '' THEN
    RAISE EXCEPTION 'Profile is required.';
  END IF;
  IF p_game_mode NOT IN ('mm2', 'adm', 'ps99') THEN
    RAISE EXCEPTION 'Invalid Mines game mode.';
  END IF;
  IF p_grid_size <> 5 THEN
    RAISE EXCEPTION 'Mines games use a 5x5 grid.';
  END IF;
  IF p_mine_count < 1 OR p_mine_count >= p_grid_size * p_grid_size THEN
    RAISE EXCEPTION 'Mine count must be between 1 and the number of grid spots minus one.';
  END IF;
  IF p_max_players <> 2 THEN
    RAISE EXCEPTION 'Mines games require exactly 2 players.';
  END IF;
  IF coalesce(array_length(p_item_ids, 1), 0) < 1 OR array_length(p_item_ids, 1) > 20 THEN
    RAISE EXCEPTION 'Select between 1 and 20 items.';
  END IF;

  PERFORM 1
  FROM public.inventory_items
  WHERE user_id = p_profile_id AND id = ANY(p_item_ids)
  FOR UPDATE;

  SELECT count(*), coalesce(jsonb_agg(to_jsonb(item_row) ORDER BY item_row.created_at DESC), '[]'::jsonb)
  INTO v_item_count, v_items
  FROM public.inventory_items AS item_row
  WHERE item_row.user_id = p_profile_id AND item_row.id = ANY(p_item_ids);

  IF v_item_count <> array_length(p_item_ids, 1) THEN
    RAISE EXCEPTION 'One or more selected items are missing or no longer owned.';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_items) AS item WHERE coalesce((item->>'value')::numeric, 0) <= 0) THEN
    RAISE EXCEPTION 'Every selected item must have a positive value.';
  END IF;

  INSERT INTO public.mines_games (
    creator_uuid, creator_username, creator_avatar_url, creator_items,
    game_mode, grid_size, mine_count, max_players, participants,
    server_seed_hash, server_seed_encrypted, client_seed
  ) VALUES (
    p_profile_id,
    coalesce(nullif(btrim(p_username), ''), 'Player'),
    nullif(btrim(p_avatar_url), ''),
    v_items,
    p_game_mode,
    p_grid_size,
    p_mine_count,
    p_max_players,
    jsonb_build_array(jsonb_build_object(
      'uuid', p_profile_id,
      'username', coalesce(nullif(btrim(p_username), ''), 'Player'),
      'avatar_url', nullif(btrim(p_avatar_url), ''),
      'items', v_items
    )),
    p_server_seed_hash,
    p_server_seed_encrypted,
    p_client_seed
  )
  RETURNING * INTO v_game;

  DELETE FROM public.inventory_items
  WHERE user_id = p_profile_id AND id = ANY(p_item_ids);

  RETURN v_game;
END;
$$;

REVOKE ALL ON FUNCTION public.create_mines_game(text, text, text, text, integer, integer, integer, uuid[], text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_mines_game(text, text, text, text, integer, integer, integer, uuid[], text, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.cancel_mines_game(p_game_id uuid, p_profile_id text)
RETURNS public.mines_games
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_game public.mines_games;
BEGIN
  SELECT * INTO v_game
  FROM public.mines_games
  WHERE id = p_game_id
  FOR UPDATE;

  IF v_game.id IS NULL THEN
    RAISE EXCEPTION 'Mines game not found.';
  END IF;
  IF v_game.creator_uuid <> p_profile_id THEN
    RAISE EXCEPTION 'Only the creator can cancel this Mines game.';
  END IF;
  IF v_game.status <> 'open' OR jsonb_array_length(v_game.participants) <> 1 THEN
    RAISE EXCEPTION 'This Mines game cannot be canceled after another player joins.';
  END IF;

  INSERT INTO public.inventory_items
  SELECT restored.*
  FROM jsonb_populate_recordset(NULL::public.inventory_items, v_game.creator_items) AS restored
  ON CONFLICT (id) DO NOTHING;

  UPDATE public.mines_games
  SET status = 'canceled', updated_at = now()
  WHERE id = p_game_id
  RETURNING * INTO v_game;

  RETURN v_game;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_mines_game(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_mines_game(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.join_mines_game(
  p_game_id uuid,
  p_profile_id text,
  p_username text,
  p_avatar_url text,
  p_item_ids uuid[]
)
RETURNS public.mines_games
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_game public.mines_games;
  v_items jsonb;
  v_item_count integer;
  v_creator_value numeric;
  v_join_value numeric;
  v_participant jsonb;
BEGIN
  SELECT * INTO v_game
  FROM public.mines_games
  WHERE id = p_game_id
  FOR UPDATE;

  IF v_game.id IS NULL THEN
    RAISE EXCEPTION 'Mines game not found.';
  END IF;
  IF v_game.status NOT IN ('open', 'active') OR jsonb_array_length(v_game.participants) >= v_game.max_players THEN
    RAISE EXCEPTION 'This Mines lobby is already full.';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_game.participants) participant WHERE participant->>'uuid' = p_profile_id) THEN
    RAISE EXCEPTION 'You are already in this Mines game.';
  END IF;
  IF coalesce(array_length(p_item_ids, 1), 0) < 1 OR array_length(p_item_ids, 1) > 20 THEN
    RAISE EXCEPTION 'Select between 1 and 20 items.';
  END IF;

  PERFORM 1 FROM public.inventory_items
  WHERE user_id = p_profile_id AND id = ANY(p_item_ids)
  FOR UPDATE;

  SELECT count(*), coalesce(jsonb_agg(to_jsonb(item_row) ORDER BY item_row.created_at DESC), '[]'::jsonb)
  INTO v_item_count, v_items
  FROM public.inventory_items AS item_row
  WHERE item_row.user_id = p_profile_id AND item_row.id = ANY(p_item_ids);

  IF v_item_count <> array_length(p_item_ids, 1) THEN
    RAISE EXCEPTION 'One or more selected items are missing or no longer owned.';
  END IF;

  SELECT coalesce(sum((item->>'value')::numeric), 0)
  INTO v_creator_value
  FROM jsonb_array_elements(v_game.creator_items) item;
  SELECT coalesce(sum((item->>'value')::numeric), 0)
  INTO v_join_value
  FROM jsonb_array_elements(v_items) item;

  IF v_creator_value <= 0 OR v_join_value * 10 < v_creator_value * 9 OR v_join_value * 10 > v_creator_value * 11 THEN
    RAISE EXCEPTION 'Your wager must be within 10%% of the creator wager.';
  END IF;

  v_participant := jsonb_build_object(
    'uuid', p_profile_id,
    'username', coalesce(nullif(btrim(p_username), ''), 'Player'),
    'avatar_url', nullif(btrim(p_avatar_url), ''),
    'items', v_items
  );

  DELETE FROM public.inventory_items
  WHERE user_id = p_profile_id AND id = ANY(p_item_ids);

  UPDATE public.mines_games
  SET participants = participants || jsonb_build_array(v_participant),
      status = CASE WHEN jsonb_array_length(participants) + 1 >= max_players THEN 'active' ELSE 'open' END,
      updated_at = now()
  WHERE id = p_game_id
  RETURNING * INTO v_game;

  RETURN v_game;
END;
$$;

REVOKE ALL ON FUNCTION public.join_mines_game(uuid, text, text, text, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.join_mines_game(uuid, text, text, text, uuid[]) TO service_role;

NOTIFY pgrst, 'reload schema';
