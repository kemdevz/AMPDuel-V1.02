CREATE OR REPLACE FUNCTION public.join_case_battle_game(
  p_battle_id uuid,
  p_profile_id text,
  p_slot_index smallint,
  p_player jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_game public.case_battle_games%ROWTYPE;
  v_profile public.user_profiles%ROWTYPE;
  v_players jsonb;
  v_player_count integer;
  v_balance bigint;
BEGIN
  SELECT * INTO v_game
  FROM public.case_battle_games
  WHERE id = p_battle_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Case Battle not found.'; END IF;
  IF v_game.status <> 'waiting' THEN RAISE EXCEPTION 'This Case Battle is no longer accepting players.'; END IF;
  IF p_slot_index <= 0 OR p_slot_index >= v_game.max_players THEN RAISE EXCEPTION 'Invalid player slot.'; END IF;
  IF v_game.player_count >= v_game.max_players THEN RAISE EXCEPTION 'This Case Battle is full.'; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(COALESCE(v_game.players, '[]'::jsonb)) entry
    WHERE entry->>'profile_type' = 'user' AND entry->>'profile_id' = p_profile_id
  ) THEN
    RAISE EXCEPTION 'You have already joined this Case Battle.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(COALESCE(v_game.players, '[]'::jsonb)) entry
    WHERE (entry->>'slot_index')::integer = p_slot_index
  ) THEN
    RAISE EXCEPTION 'That player slot is already occupied.';
  END IF;

  SELECT * INTO v_profile
  FROM public.user_profiles
  WHERE id::text = p_profile_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found.'; END IF;
  IF COALESCE(v_profile.balance, 0) < v_game.cost_per_player THEN RAISE EXCEPTION 'Insufficient balance.'; END IF;

  v_balance := COALESCE(v_profile.balance, 0) - v_game.cost_per_player;
  UPDATE public.user_profiles
  SET balance = v_balance, updated_at = now()
  WHERE id = v_profile.id;

  v_players := COALESCE(v_game.players, '[]'::jsonb) || jsonb_build_array(
    p_player || jsonb_build_object(
      'slot_index', p_slot_index,
      'profile_type', 'user',
      'profile_id', p_profile_id,
      'joined_at', now()
    )
  );
  v_player_count := jsonb_array_length(v_players);

  UPDATE public.case_battle_games
  SET players = v_players,
      player_count = v_player_count,
      status = CASE WHEN v_player_count >= max_players THEN 'ready' ELSE 'waiting' END,
      updated_at = now()
  WHERE id = p_battle_id
  RETURNING * INTO v_game;

  RETURN jsonb_build_object('battle', to_jsonb(v_game), 'balance', v_balance);
END;
$$;

REVOKE ALL ON FUNCTION public.join_case_battle_game(uuid,text,smallint,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.join_case_battle_game(uuid,text,smallint,jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';
