-- Server-authoritative Blackjack with atomic wallet settlement and committed
-- provably-fair seeds. Only the service role can read cards or call the RPCs.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.blackjack_fairness_states (
  user_id text PRIMARY KEY,
  seed_id uuid NOT NULL UNIQUE,
  server_seed_hash text NOT NULL CHECK (server_seed_hash ~ '^[0-9a-f]{64}$'),
  server_seed_encrypted text NOT NULL CHECK (length(server_seed_encrypted) > 0),
  client_seed text NOT NULL CHECK (length(client_seed) BETWEEN 1 AND 128),
  nonce bigint NOT NULL DEFAULT 0 CHECK (nonce >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.blackjack_games (
  id uuid PRIMARY KEY,
  profile_id text NOT NULL,
  username text NOT NULL,
  wager_value bigint NOT NULL CHECK (wager_value BETWEEN 5000 AND 20000000),
  original_wager bigint NOT NULL CHECK (original_wager BETWEEN 5000 AND 10000000),
  player_cards jsonb NOT NULL CHECK (jsonb_typeof(player_cards) = 'array'),
  dealer_cards jsonb NOT NULL CHECK (jsonb_typeof(dealer_cards) = 'array'),
  remaining_deck jsonb NOT NULL CHECK (jsonb_typeof(remaining_deck) = 'array'),
  game_state text NOT NULL DEFAULT 'active' CHECK (game_state IN ('active', 'finished')),
  outcome text CHECK (outcome IN ('player', 'player_blackjack', 'dealer', 'push')),
  payout_value bigint NOT NULL DEFAULT 0 CHECK (payout_value >= 0),
  doubled boolean NOT NULL DEFAULT false,
  action_count integer NOT NULL DEFAULT 0 CHECK (action_count >= 0),
  last_request_id uuid,
  fairness_seed_id uuid NOT NULL,
  server_seed_hash text NOT NULL CHECK (server_seed_hash ~ '^[0-9a-f]{64}$'),
  server_seed_encrypted text NOT NULL CHECK (length(server_seed_encrypted) > 0),
  server_seed text,
  client_seed text NOT NULL CHECK (length(client_seed) BETWEEN 1 AND 128),
  nonce bigint NOT NULL CHECK (nonce >= 0),
  balance_before bigint NOT NULL,
  balance_after bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  CHECK ((game_state = 'active' AND outcome IS NULL AND resolved_at IS NULL)
    OR (game_state = 'finished' AND outcome IS NOT NULL AND resolved_at IS NOT NULL))
);

-- Upgrade an existing Blackjack table created by an earlier version of this
-- migration. CREATE TABLE IF NOT EXISTS does not add or rename columns.
ALTER TABLE public.blackjack_games
  ADD COLUMN IF NOT EXISTS username text;

UPDATE public.blackjack_games AS game
SET username = COALESCE(profile.username, 'user')
FROM public.user_profiles AS profile
WHERE profile.id::text = game.profile_id
  AND game.username IS NULL;

UPDATE public.blackjack_games
SET username = 'user'
WHERE username IS NULL;

ALTER TABLE public.blackjack_games
  ALTER COLUMN username SET DEFAULT 'user',
  ALTER COLUMN username SET NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'blackjack_games'
      AND column_name = 'settled_at'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'blackjack_games'
      AND column_name = 'resolved_at'
  ) THEN
    ALTER TABLE public.blackjack_games RENAME COLUMN settled_at TO resolved_at;
  END IF;
END;
$$;

ALTER TABLE public.blackjack_games
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS blackjack_one_active_game_per_profile
  ON public.blackjack_games(profile_id) WHERE game_state = 'active';
CREATE INDEX IF NOT EXISTS blackjack_games_profile_created_idx
  ON public.blackjack_games(profile_id, created_at DESC);

ALTER TABLE public.blackjack_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blackjack_fairness_states ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.blackjack_games, public.blackjack_fairness_states FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blackjack_games, public.blackjack_fairness_states TO service_role;

CREATE OR REPLACE FUNCTION public.ensure_blackjack_fairness_state(
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
  selected_state public.blackjack_fairness_states%ROWTYPE;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_profiles WHERE id::text = p_profile_id) THEN
    RAISE EXCEPTION 'Your user profile could not be found.';
  END IF;
  IF p_server_seed_hash !~ '^[0-9a-f]{64}$'
     OR length(p_server_seed_encrypted) = 0
     OR length(p_client_seed) NOT BETWEEN 1 AND 128 THEN
    RAISE EXCEPTION 'Invalid Blackjack fairness seed.';
  END IF;

  INSERT INTO public.blackjack_fairness_states
    (user_id, seed_id, server_seed_hash, server_seed_encrypted, client_seed)
  VALUES (p_profile_id, p_seed_id, p_server_seed_hash, p_server_seed_encrypted, p_client_seed)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO STRICT selected_state
  FROM public.blackjack_fairness_states WHERE user_id = p_profile_id;
  RETURN to_jsonb(selected_state);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_blackjack_game_secure(
  p_profile_id text,
  p_game_id uuid,
  p_wager_value bigint,
  p_player_cards jsonb,
  p_dealer_cards jsonb,
  p_remaining_deck jsonb,
  p_initial_outcome text,
  p_fairness_seed_id uuid,
  p_server_seed_hash text,
  p_server_seed_encrypted text,
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
  selected_state public.blackjack_fairness_states%ROWTYPE;
  created_game public.blackjack_games%ROWTYPE;
  payout bigint := 0;
  next_state text := 'active';
BEGIN
  IF p_wager_value NOT BETWEEN 5000 AND 10000000
     OR jsonb_array_length(p_player_cards) <> 2
     OR jsonb_array_length(p_dealer_cards) <> 2
     OR jsonb_array_length(p_remaining_deck) <> 48
     OR p_initial_outcome IS DISTINCT FROM NULL
        AND p_initial_outcome NOT IN ('player_blackjack', 'dealer', 'push') THEN
    RAISE EXCEPTION 'Invalid Blackjack game.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('blackjack:' || p_profile_id, 0));
  SELECT * INTO selected_profile FROM public.user_profiles
  WHERE id::text = p_profile_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found.'; END IF;
  IF EXISTS (SELECT 1 FROM public.blackjack_games
             WHERE profile_id = p_profile_id AND game_state = 'active') THEN
    RAISE EXCEPTION 'You already have an active Blackjack game.';
  END IF;

  SELECT * INTO selected_state FROM public.blackjack_fairness_states
  WHERE user_id = p_profile_id FOR UPDATE;
  IF NOT FOUND OR selected_state.seed_id <> p_fairness_seed_id
     OR selected_state.server_seed_hash <> p_server_seed_hash
     OR selected_state.client_seed <> p_client_seed
     OR selected_state.nonce <> p_nonce THEN
    RAISE EXCEPTION 'Blackjack fairness state changed. Please try again.';
  END IF;
  IF COALESCE(selected_profile.balance, 0) < p_wager_value THEN
    RAISE EXCEPTION 'Insufficient balance.';
  END IF;

  UPDATE public.user_profiles SET balance = balance - p_wager_value, updated_at = now()
  WHERE id = selected_profile.id RETURNING * INTO selected_profile;
  UPDATE public.blackjack_fairness_states SET nonce = nonce + 1, updated_at = now()
  WHERE user_id = p_profile_id;

  IF p_initial_outcome IS NOT NULL THEN
    next_state := 'finished';
    payout := CASE p_initial_outcome
      WHEN 'player_blackjack' THEN floor(p_wager_value * 2.375)::bigint
      WHEN 'push' THEN p_wager_value
      ELSE 0
    END;
    UPDATE public.user_profiles
    SET balance = balance + payout,
        played = COALESCE(played, 0) + 1,
        won = COALESCE(won, 0) + CASE WHEN p_initial_outcome = 'player_blackjack' THEN 1 ELSE 0 END,
        lost = COALESCE(lost, 0) + CASE WHEN p_initial_outcome = 'dealer' THEN 1 ELSE 0 END,
        updated_at = now()
    WHERE id = selected_profile.id RETURNING * INTO selected_profile;
  END IF;

  INSERT INTO public.blackjack_games (
    id, profile_id, username, wager_value, original_wager, player_cards, dealer_cards,
    remaining_deck, game_state, outcome, payout_value, fairness_seed_id,
    server_seed_hash, server_seed_encrypted, client_seed, nonce,
    balance_before, balance_after, resolved_at
  ) VALUES (
    p_game_id, p_profile_id, COALESCE(selected_profile.username, 'user'),
    p_wager_value, p_wager_value, p_player_cards,
    p_dealer_cards, p_remaining_deck, next_state, p_initial_outcome, payout,
    p_fairness_seed_id, p_server_seed_hash, p_server_seed_encrypted,
    p_client_seed, p_nonce, selected_profile.balance + p_wager_value - payout,
    selected_profile.balance, CASE WHEN next_state = 'finished' THEN now() END
  ) RETURNING * INTO created_game;

  RETURN jsonb_build_object('game', to_jsonb(created_game), 'balance', selected_profile.balance);
END;
$$;

CREATE OR REPLACE FUNCTION public.advance_blackjack_game_secure(
  p_profile_id text,
  p_game_id uuid,
  p_request_id uuid,
  p_expected_action_count integer,
  p_action text,
  p_player_cards jsonb,
  p_dealer_cards jsonb,
  p_remaining_deck jsonb,
  p_outcome text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_game public.blackjack_games%ROWTYPE;
  selected_profile public.user_profiles%ROWTYPE;
  extra_wager bigint := 0;
  payout bigint := 0;
  next_state text := CASE WHEN p_outcome IS NULL THEN 'active' ELSE 'finished' END;
BEGIN
  SELECT * INTO selected_game FROM public.blackjack_games
  WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Blackjack game not found.'; END IF;
  IF selected_game.profile_id <> p_profile_id THEN RAISE EXCEPTION 'You can only play your own game.'; END IF;
  IF selected_game.last_request_id = p_request_id THEN
    SELECT * INTO selected_profile FROM public.user_profiles WHERE id = p_profile_id;
    RETURN jsonb_build_object('game', to_jsonb(selected_game), 'balance', selected_profile.balance, 'replayed', true);
  END IF;
  IF selected_game.game_state <> 'active' THEN RAISE EXCEPTION 'Blackjack game is not active.'; END IF;
  IF selected_game.action_count <> p_expected_action_count THEN RAISE EXCEPTION 'Blackjack game state changed. Please refresh.'; END IF;
  IF p_action NOT IN ('hit', 'stand', 'double') OR p_outcome IS NOT NULL AND p_outcome NOT IN ('player', 'dealer', 'push') THEN
    RAISE EXCEPTION 'Invalid Blackjack action.';
  END IF;
  IF jsonb_typeof(p_player_cards) <> 'array' OR jsonb_typeof(p_dealer_cards) <> 'array'
     OR jsonb_typeof(p_remaining_deck) <> 'array' THEN RAISE EXCEPTION 'Invalid Blackjack cards.'; END IF;
  IF p_action = 'hit' AND jsonb_array_length(p_player_cards) <> jsonb_array_length(selected_game.player_cards) + 1 THEN
    RAISE EXCEPTION 'Invalid Blackjack hit.';
  END IF;
  IF p_action = 'double' THEN
    IF selected_game.action_count <> 0 OR jsonb_array_length(selected_game.player_cards) <> 2
       OR selected_game.doubled THEN RAISE EXCEPTION 'This hand cannot be doubled.'; END IF;
    extra_wager := selected_game.original_wager;
  END IF;

  SELECT * INTO selected_profile FROM public.user_profiles
  WHERE id::text = p_profile_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found.'; END IF;
  IF COALESCE(selected_profile.balance, 0) < extra_wager THEN RAISE EXCEPTION 'Insufficient balance to double.'; END IF;
  IF extra_wager > 0 THEN
    UPDATE public.user_profiles SET balance = balance - extra_wager, updated_at = now()
    WHERE id = selected_profile.id RETURNING * INTO selected_profile;
  END IF;

  selected_game.wager_value := selected_game.wager_value + extra_wager;
  IF p_outcome IS NOT NULL THEN
    payout := CASE p_outcome WHEN 'player' THEN floor(selected_game.wager_value * 1.9)::bigint
      WHEN 'push' THEN selected_game.wager_value ELSE 0 END;
    UPDATE public.user_profiles
    SET balance = balance + payout,
        played = COALESCE(played, 0) + 1,
        won = COALESCE(won, 0) + CASE WHEN p_outcome = 'player' THEN 1 ELSE 0 END,
        lost = COALESCE(lost, 0) + CASE WHEN p_outcome = 'dealer' THEN 1 ELSE 0 END,
        updated_at = now()
    WHERE id = selected_profile.id RETURNING * INTO selected_profile;
  END IF;

  UPDATE public.blackjack_games
  SET wager_value = selected_game.wager_value,
      player_cards = p_player_cards, dealer_cards = p_dealer_cards,
      remaining_deck = p_remaining_deck, game_state = next_state,
      outcome = p_outcome, payout_value = payout,
      doubled = doubled OR p_action = 'double', action_count = action_count + 1,
      last_request_id = p_request_id, balance_after = selected_profile.balance,
      updated_at = now(), resolved_at = CASE WHEN next_state = 'finished' THEN now() END
  WHERE id = selected_game.id RETURNING * INTO selected_game;

  RETURN jsonb_build_object('game', to_jsonb(selected_game), 'balance', selected_profile.balance, 'replayed', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.rotate_blackjack_fairness_state(
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
DECLARE selected_state public.blackjack_fairness_states%ROWTYPE;
BEGIN
  SELECT * INTO selected_state FROM public.blackjack_fairness_states
  WHERE user_id = p_profile_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Blackjack fairness state could not be found.'; END IF;
  IF EXISTS (SELECT 1 FROM public.blackjack_games WHERE profile_id = p_profile_id AND game_state = 'active') THEN
    RAISE EXCEPTION 'You cannot change the seed while a Blackjack game is active.';
  END IF;
  IF selected_state.seed_id <> p_expected_seed_id
     OR selected_state.server_seed_hash <> p_expected_server_seed_hash
     OR selected_state.nonce <> p_expected_nonce
     OR encode(extensions.digest(convert_to(p_previous_server_seed, 'UTF8'), 'sha256'::text), 'hex') <> selected_state.server_seed_hash THEN
    RAISE EXCEPTION 'Blackjack fairness state changed. Please try again.';
  END IF;

  UPDATE public.blackjack_games SET server_seed = p_previous_server_seed
  WHERE profile_id = p_profile_id AND fairness_seed_id = selected_state.seed_id
    AND game_state = 'finished' AND server_seed IS NULL;
  UPDATE public.blackjack_fairness_states
  SET seed_id = p_new_seed_id, server_seed_hash = p_new_server_seed_hash,
      server_seed_encrypted = p_new_server_seed_encrypted, client_seed = p_new_client_seed,
      nonce = 0, updated_at = now()
  WHERE user_id = p_profile_id;

  RETURN jsonb_build_object(
    'seed_id', p_new_seed_id, 'server_seed_hash', p_new_server_seed_hash,
    'client_seed', p_new_client_seed, 'nonce', 0,
    'previous_server_seed', p_previous_server_seed,
    'previous_server_seed_hash', selected_state.server_seed_hash,
    'previous_client_seed', selected_state.client_seed,
    'previous_nonce', selected_state.nonce
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_blackjack_fairness_state(text, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_blackjack_game_secure(text, uuid, bigint, jsonb, jsonb, jsonb, text, uuid, text, text, text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.advance_blackjack_game_secure(text, uuid, uuid, integer, text, jsonb, jsonb, jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rotate_blackjack_fairness_state(text, uuid, text, bigint, text, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_blackjack_fairness_state(text, uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_blackjack_game_secure(text, uuid, bigint, jsonb, jsonb, jsonb, text, uuid, text, text, text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.advance_blackjack_game_secure(text, uuid, uuid, integer, text, jsonb, jsonb, jsonb, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.rotate_blackjack_fairness_state(text, uuid, text, bigint, text, uuid, text, text, text) TO service_role;
