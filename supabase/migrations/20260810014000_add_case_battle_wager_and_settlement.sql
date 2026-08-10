ALTER TABLE public.case_battle_games
  ADD COLUMN IF NOT EXISTS settle_at timestamptz,
  ADD COLUMN IF NOT EXISTS winner_profile_ids text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS payouts jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS payout_value bigint NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.create_case_battle_game(
  p_idempotency_key uuid,
  p_profile_id text,
  p_player_option text,
  p_max_players smallint,
  p_modes text[],
  p_cases jsonb,
  p_cost_per_player bigint,
  p_creator jsonb,
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
  v_game public.case_battle_games%ROWTYPE;
  v_balance bigint;
BEGIN
  SELECT * INTO v_game FROM public.case_battle_games
  WHERE idempotency_key = p_idempotency_key AND creator_profile_id = p_profile_id;
  IF FOUND THEN
    SELECT balance INTO v_balance FROM public.user_profiles WHERE id::text = p_profile_id;
    RETURN jsonb_build_object('battle', to_jsonb(v_game), 'balance', v_balance, 'replayed', true);
  END IF;

  SELECT * INTO v_profile FROM public.user_profiles
  WHERE id::text = p_profile_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found.'; END IF;
  IF p_cost_per_player <= 0 THEN RAISE EXCEPTION 'Battle cost must be positive.'; END IF;
  IF COALESCE(v_profile.balance, 0) < p_cost_per_player THEN RAISE EXCEPTION 'Insufficient balance.'; END IF;

  v_balance := COALESCE(v_profile.balance, 0) - p_cost_per_player;
  UPDATE public.user_profiles SET balance = v_balance, updated_at = now() WHERE id = v_profile.id;

  INSERT INTO public.case_battle_games (
    idempotency_key, creator_profile_id, creator_username, creator_avatar_url,
    player_option, max_players, modes, gold_spin, cases, case_count,
    cost_per_player, players, player_count, results, status, current_round,
    server_seed_hash, server_seed, client_seed, nonce, created_at, updated_at
  ) VALUES (
    p_idempotency_key, p_profile_id, COALESCE(p_creator->>'username', 'Player'),
    NULLIF(p_creator->>'avatar_headshot_url', ''), p_player_option, p_max_players,
    p_modes, false, p_cases, jsonb_array_length(p_cases), p_cost_per_player,
    jsonb_build_array(p_creator), 1,
    (SELECT jsonb_agg('[]'::jsonb) FROM generate_series(1, p_max_players)),
    'waiting', 0, p_server_seed_hash, NULL, p_client_seed, 0, now(), now()
  ) RETURNING * INTO v_game;

  INSERT INTO public.case_battle_fairness_secrets (battle_id, server_seed_encrypted)
  VALUES (v_game.id, p_server_seed_encrypted);

  RETURN jsonb_build_object('battle', to_jsonb(v_game), 'balance', v_balance, 'replayed', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.settle_case_battle_game(
  p_battle_id uuid,
  p_server_seed text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_game public.case_battle_games%ROWTYPE;
  v_player jsonb;
  v_profile_id text;
  v_payout bigint;
  v_balance bigint;
  v_settlements jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO v_game FROM public.case_battle_games WHERE id = p_battle_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Case Battle not found.'; END IF;
  IF v_game.status = 'resolved' THEN
    RETURN jsonb_build_object('battle', to_jsonb(v_game), 'settlements', '[]'::jsonb, 'already_settled', true);
  END IF;
  IF v_game.status <> 'active' OR v_game.settle_at IS NULL OR now() < v_game.settle_at THEN
    RAISE EXCEPTION 'Case Battle is not ready to settle.';
  END IF;
  FOR v_player IN SELECT value FROM jsonb_array_elements(v_game.players)
  LOOP
    IF COALESCE(v_player->>'profile_type', 'user') <> 'user' THEN CONTINUE; END IF;
    v_profile_id := v_player->>'profile_id';
    SELECT COALESCE((entry->>'amount')::bigint, 0) INTO v_payout
    FROM jsonb_array_elements(v_game.payouts) entry
    WHERE entry->>'profile_id' = v_profile_id LIMIT 1;
    v_payout := COALESCE(v_payout, 0);

    UPDATE public.user_profiles
    SET balance = COALESCE(balance, 0) + v_payout,
        played = COALESCE(played, 0) + v_game.cost_per_player,
        won = COALESCE(won, 0) + GREATEST(v_payout - v_game.cost_per_player, 0),
        lost = COALESCE(lost, 0) + CASE WHEN v_payout = 0 THEN v_game.cost_per_player ELSE 0 END,
        updated_at = now()
    WHERE id::text = v_profile_id
    RETURNING balance INTO v_balance;

    PERFORM public.award_profile_game_xp(
      v_profile_id,
      'case',
      p_battle_id::text || ':' || v_profile_id,
      v_game.cost_per_player
    );

    v_settlements := v_settlements || jsonb_build_array(jsonb_build_object(
      'profile_id', v_profile_id, 'payout', v_payout, 'balance', v_balance
    ));
  END LOOP;

  UPDATE public.case_battle_games
  SET status = 'resolved', server_seed = p_server_seed, resolved_at = now(), updated_at = now()
  WHERE id = p_battle_id RETURNING * INTO v_game;

  RETURN jsonb_build_object('battle', to_jsonb(v_game), 'settlements', v_settlements, 'already_settled', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_case_battle_game(p_battle_id uuid, p_profile_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_game public.case_battle_games%ROWTYPE;
  v_player jsonb;
  v_balance bigint;
BEGIN
  SELECT * INTO v_game FROM public.case_battle_games WHERE id = p_battle_id FOR UPDATE;
  IF NOT FOUND OR v_game.creator_profile_id <> p_profile_id OR v_game.status NOT IN ('waiting', 'ready') THEN
    RAISE EXCEPTION 'This Case Battle cannot be cancelled.';
  END IF;

  FOR v_player IN SELECT value FROM jsonb_array_elements(v_game.players)
  LOOP
    IF COALESCE(v_player->>'profile_type', 'user') = 'user' THEN
      UPDATE public.user_profiles SET balance = COALESCE(balance, 0) + v_game.cost_per_player, updated_at = now()
      WHERE id::text = v_player->>'profile_id';
    END IF;
  END LOOP;

  UPDATE public.case_battle_games
  SET status = 'cancelled', cancelled_at = now(), updated_at = now()
  WHERE id = p_battle_id RETURNING * INTO v_game;
  SELECT balance INTO v_balance FROM public.user_profiles WHERE id::text = p_profile_id;
  RETURN jsonb_build_object('battle', to_jsonb(v_game), 'balance', v_balance);
END;
$$;

REVOKE ALL ON FUNCTION public.create_case_battle_game(uuid,text,text,smallint,text[],jsonb,bigint,jsonb,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.settle_case_battle_game(uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_case_battle_game(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_case_battle_game(uuid,text,text,smallint,text[],jsonb,bigint,jsonb,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_case_battle_game(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_case_battle_game(uuid,text) TO service_role;
