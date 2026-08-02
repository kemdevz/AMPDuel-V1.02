ALTER TABLE public.mines_games
  ADD COLUMN IF NOT EXISTS fairness_seed_id uuid,
  ADD COLUMN IF NOT EXISTS server_seed_hash text,
  ADD COLUMN IF NOT EXISTS server_seed text;

CREATE TABLE IF NOT EXISTS public.mines_fairness_states (
  user_id uuid PRIMARY KEY REFERENCES public.user_profiles(id) ON UPDATE CASCADE ON DELETE CASCADE,
  seed_id uuid NOT NULL UNIQUE,
  server_seed_hash text NOT NULL CHECK (server_seed_hash ~ '^[0-9a-f]{64}$'),
  server_seed_encrypted text NOT NULL CHECK (length(server_seed_encrypted) > 0),
  client_seed text NOT NULL CHECK (length(client_seed) BETWEEN 1 AND 128),
  nonce bigint NOT NULL DEFAULT 0 CHECK (nonce >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mines_fairness_states ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mines_fairness_states FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.mines_fairness_states TO service_role;

CREATE OR REPLACE FUNCTION public.ensure_mines_fairness_state(
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
  selected_profile public.user_profiles%ROWTYPE;
  selected_state public.mines_fairness_states%ROWTYPE;
BEGIN
  SELECT * INTO selected_profile
  FROM public.user_profiles
  WHERE id::text = p_profile_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Your user profile could not be found.'; END IF;

  INSERT INTO public.mines_fairness_states (
    user_id, seed_id, server_seed_hash, server_seed_encrypted, client_seed, nonce
  ) VALUES (
    selected_profile.id, p_seed_id, p_server_seed_hash, p_server_seed_encrypted, p_client_seed, 0
  )
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO STRICT selected_state
  FROM public.mines_fairness_states
  WHERE user_id = selected_profile.id;

  RETURN jsonb_build_object(
    'user_id', selected_state.user_id,
    'seed_id', selected_state.seed_id,
    'server_seed_hash', selected_state.server_seed_hash,
    'server_seed_encrypted', selected_state.server_seed_encrypted,
    'client_seed', selected_state.client_seed,
    'nonce', selected_state.nonce
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_mines_fairness_nonce(
  p_profile_id text,
  p_expected_seed_id uuid,
  p_expected_server_seed_hash text,
  p_expected_nonce bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_state public.mines_fairness_states%ROWTYPE;
BEGIN
  SELECT * INTO selected_state
  FROM public.mines_fairness_states
  WHERE user_id::text = p_profile_id
  FOR UPDATE;

  IF NOT FOUND
    OR selected_state.seed_id <> p_expected_seed_id
    OR selected_state.server_seed_hash <> p_expected_server_seed_hash
    OR selected_state.nonce <> p_expected_nonce THEN
    RAISE EXCEPTION 'Mines fairness state changed. Please try again.';
  END IF;

  UPDATE public.mines_fairness_states
  SET nonce = nonce + 1, updated_at = now()
  WHERE user_id = selected_state.user_id;

  RETURN jsonb_build_object('nonce', selected_state.nonce, 'next_nonce', selected_state.nonce + 1);
END;
$$;

CREATE OR REPLACE FUNCTION public.rotate_mines_fairness_state(
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
  selected_state public.mines_fairness_states%ROWTYPE;
BEGIN
  SELECT * INTO selected_state
  FROM public.mines_fairness_states
  WHERE user_id::text = p_profile_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Mines fairness state could not be found.'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.mines_games
    WHERE profile_id = p_profile_id AND game_state = 'active'
  ) THEN
    RAISE EXCEPTION 'You cannot change the seed while a Mines game is active.';
  END IF;
  IF selected_state.seed_id <> p_expected_seed_id
    OR selected_state.server_seed_hash <> p_expected_server_seed_hash
    OR selected_state.nonce <> p_expected_nonce THEN
    RAISE EXCEPTION 'Mines fairness state changed. Please try again.';
  END IF;

  UPDATE public.mines_games
  SET server_seed = p_previous_server_seed
  WHERE profile_id = p_profile_id
    AND fairness_seed_id = selected_state.seed_id
    AND game_state <> 'active'
    AND server_seed IS NULL;

  UPDATE public.mines_fairness_states
  SET seed_id = p_new_seed_id,
      server_seed_hash = p_new_server_seed_hash,
      server_seed_encrypted = p_new_server_seed_encrypted,
      client_seed = p_new_client_seed,
      nonce = 0,
      updated_at = now()
  WHERE user_id = selected_state.user_id;

  RETURN jsonb_build_object(
    'seed_id', p_new_seed_id,
    'server_seed_hash', p_new_server_seed_hash,
    'client_seed', p_new_client_seed,
    'nonce', 0,
    'previous_server_seed', p_previous_server_seed,
    'previous_client_seed', selected_state.client_seed,
    'previous_nonce', selected_state.nonce
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_mines_fairness_state(text, uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_mines_fairness_nonce(text, uuid, text, bigint)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rotate_mines_fairness_state(text, uuid, text, bigint, text, uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_mines_fairness_state(text, uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_mines_fairness_nonce(text, uuid, text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.rotate_mines_fairness_state(text, uuid, text, bigint, text, uuid, text, text, text) TO service_role;
