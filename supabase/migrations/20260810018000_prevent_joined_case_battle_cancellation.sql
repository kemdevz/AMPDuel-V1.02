CREATE OR REPLACE FUNCTION public.cancel_case_battle_game(
  p_battle_id uuid,
  p_profile_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_game public.case_battle_games%ROWTYPE;
  v_balance bigint;
BEGIN
  SELECT *
  INTO v_game
  FROM public.case_battle_games
  WHERE id = p_battle_id
  FOR UPDATE;

  IF NOT FOUND
    OR v_game.creator_profile_id <> p_profile_id
    OR v_game.status <> 'waiting'
    OR v_game.player_count <> 1
    OR jsonb_array_length(v_game.players) <> 1
  THEN
    RAISE EXCEPTION 'A Case Battle cannot be cancelled after another player or bot has joined.';
  END IF;

  UPDATE public.user_profiles
  SET balance = COALESCE(balance, 0) + v_game.cost_per_player,
      updated_at = now()
  WHERE id::text = p_profile_id;

  UPDATE public.case_battle_games
  SET status = 'cancelled',
      cancelled_at = now(),
      updated_at = now()
  WHERE id = p_battle_id
  RETURNING * INTO v_game;

  SELECT balance
  INTO v_balance
  FROM public.user_profiles
  WHERE id::text = p_profile_id;

  RETURN jsonb_build_object(
    'battle', to_jsonb(v_game),
    'balance', v_balance
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_case_battle_game(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_case_battle_game(uuid, text) TO service_role;

COMMENT ON FUNCTION public.cancel_case_battle_game(uuid, text) IS
  'Cancels and refunds a waiting Case Battle only while the creator is its sole participant.';
