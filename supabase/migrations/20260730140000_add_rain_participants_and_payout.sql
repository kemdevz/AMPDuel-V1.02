ALTER TABLE public.rain_state
  ADD COLUMN IF NOT EXISTS countdown_seconds integer NOT NULL DEFAULT 1800,
  ADD COLUMN IF NOT EXISTS pool_amount integer NOT NULL DEFAULT 10000,
  ADD COLUMN IF NOT EXISTS last_updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS users jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.rain_events
  ADD COLUMN IF NOT EXISTS profile_id text,
  ADD COLUMN IF NOT EXISTS roblox_id text;

-- Existing databases may have profile_id as uuid with a foreign key to
-- user_profiles. Rain participants deliberately use text IDs so this works
-- with both the uuid and text variants of user_profiles used by the app.
ALTER TABLE public.rain_events
  DROP CONSTRAINT IF EXISTS rain_events_profile_id_fkey;

ALTER TABLE public.rain_events
  ALTER COLUMN profile_id TYPE text USING profile_id::text,
  ALTER COLUMN roblox_id TYPE text USING roblox_id::text;

ALTER TABLE public.rain_state
  DROP CONSTRAINT IF EXISTS rain_state_users_is_array;

ALTER TABLE public.rain_state
  ADD CONSTRAINT rain_state_users_is_array
  CHECK (jsonb_typeof(users) = 'array');

DROP POLICY IF EXISTS "Allow public read/write rain_state" ON public.rain_state;
DROP POLICY IF EXISTS "Allow public read rain_state" ON public.rain_state;

CREATE POLICY "Allow public read rain_state"
  ON public.rain_state
  FOR SELECT
  USING (true);

REVOKE INSERT, UPDATE, DELETE ON public.rain_state FROM anon, authenticated;
GRANT SELECT ON public.rain_state TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.join_rain(
  p_state_id text,
  p_profile_id text,
  p_join_window_seconds integer DEFAULT 300
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state public.rain_state%ROWTYPE;
  v_profile public.user_profiles%ROWTYPE;
  v_participant jsonb;
BEGIN
  IF p_profile_id IS NULL OR btrim(p_profile_id) = '' THEN
    RAISE EXCEPTION 'You must be signed in to join the rain.';
  END IF;

  SELECT *
  INTO v_state
  FROM public.rain_state
  WHERE id = p_state_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rain state could not be found.';
  END IF;

  IF v_state.countdown_seconds <= 0 OR v_state.countdown_seconds > p_join_window_seconds THEN
    RAISE EXCEPTION 'The rain is not accepting entries right now.';
  END IF;

  SELECT *
  INTO v_profile
  FROM public.user_profiles
  WHERE id::text = p_profile_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Your user profile could not be found.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(v_state.users, '[]'::jsonb)) AS participant
    WHERE participant->>'id' = p_profile_id
  ) THEN
    RETURN jsonb_build_object('joined', false, 'already_joined', true);
  END IF;

  v_participant := jsonb_build_object(
    'id', v_profile.id::text,
    'roblox_id', v_profile.roblox_id,
    'username', COALESCE(NULLIF(v_profile.username, ''), 'user'),
    'joined_at', now()
  );

  UPDATE public.rain_state
  SET users = COALESCE(users, '[]'::jsonb) || jsonb_build_array(v_participant),
      last_updated_at = now()
  WHERE id = p_state_id;

  RETURN jsonb_build_object(
    'joined', true,
    'already_joined', false,
    'participant', v_participant
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.settle_rain(
  p_state_id text,
  p_next_pool integer DEFAULT 10000,
  p_next_countdown integer DEFAULT 1800
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state public.rain_state%ROWTYPE;
  v_participant_count integer;
  v_base_payout integer;
  v_remainder integer;
BEGIN
  SELECT *
  INTO v_state
  FROM public.rain_state
  WHERE id = p_state_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rain state could not be found.';
  END IF;

  SELECT count(*)::integer
  INTO v_participant_count
  FROM (
    SELECT DISTINCT participant->>'id' AS profile_id
    FROM jsonb_array_elements(COALESCE(v_state.users, '[]'::jsonb)) AS participant
    WHERE COALESCE(participant->>'id', '') <> ''
  ) AS unique_participants;

  IF v_participant_count > 0 AND v_state.pool_amount > 0 THEN
    v_base_payout := v_state.pool_amount / v_participant_count;
    v_remainder := v_state.pool_amount % v_participant_count;

    WITH participants AS (
      SELECT
        participant->>'id' AS profile_id,
        participant->>'roblox_id' AS roblox_id,
        participant->>'username' AS username,
        row_number() OVER (
          ORDER BY COALESCE(participant->>'joined_at', ''), participant->>'id'
        ) AS payout_order
      FROM (
        SELECT DISTINCT ON (participant->>'id') participant
        FROM jsonb_array_elements(COALESCE(v_state.users, '[]'::jsonb)) AS participant
        WHERE COALESCE(participant->>'id', '') <> ''
        ORDER BY participant->>'id', COALESCE(participant->>'joined_at', '')
      ) AS deduplicated
    ),
    payouts AS (
      SELECT
        profile_id,
        roblox_id,
        username,
        v_base_payout + CASE WHEN payout_order <= v_remainder THEN 1 ELSE 0 END AS amount
      FROM participants
    ),
    updated_profiles AS (
      UPDATE public.user_profiles AS profile
      SET balance = COALESCE(profile.balance, 0) + payouts.amount,
          updated_at = now()
      FROM payouts
      WHERE profile.id::text = payouts.profile_id
      RETURNING payouts.profile_id, payouts.roblox_id, payouts.username, payouts.amount
    )
    INSERT INTO public.rain_events (id, event_type, username, amount, profile_id, roblox_id)
    SELECT
      gen_random_uuid()::text,
      'rain_payout',
      COALESCE(NULLIF(username, ''), 'user'),
      amount,
      profile_id,
      NULLIF(roblox_id, '')
    FROM updated_profiles;
  ELSE
    v_base_payout := 0;
    v_remainder := 0;
  END IF;

  UPDATE public.rain_state
  SET users = '[]'::jsonb,
      pool_amount = p_next_pool,
      countdown_seconds = p_next_countdown,
      last_updated_at = now()
  WHERE id = p_state_id;

  RETURN jsonb_build_object(
    'paid_users', v_participant_count,
    'pool_amount', v_state.pool_amount,
    'base_payout', v_base_payout,
    'remainder_distributed', v_remainder
  );
END;
$$;

REVOKE ALL ON FUNCTION public.join_rain(text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.settle_rain(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.join_rain(text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_rain(text, integer, integer) TO service_role;
