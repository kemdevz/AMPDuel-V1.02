CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.rain_state
  ADD COLUMN IF NOT EXISTS rain_uuid uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS started_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS settled_at timestamptz,
  ADD COLUMN IF NOT EXISTS discord_message_id text;

UPDATE public.rain_state
SET rain_uuid = gen_random_uuid()
WHERE rain_uuid IS NULL;

WITH ranked_rains AS (
  SELECT
    id,
    row_number() OVER (
      ORDER BY COALESCE(last_updated_at, created_at) DESC, id DESC
    ) AS position
  FROM public.rain_state
)
UPDATE public.rain_state AS rain
SET status = CASE WHEN ranked.position = 1 THEN 'active' ELSE 'settled' END,
    settled_at = CASE
      WHEN ranked.position = 1 THEN NULL
      ELSE COALESCE(rain.settled_at, rain.last_updated_at, now())
    END
FROM ranked_rains AS ranked
WHERE rain.id = ranked.id;

UPDATE public.rain_state
SET created_at = COALESCE(created_at, last_updated_at, now()),
    started_at = COALESCE(started_at, created_at, last_updated_at, now()),
    ends_at = COALESCE(
      ends_at,
      COALESCE(last_updated_at, now()) + make_interval(secs => GREATEST(countdown_seconds, 0))
    );

ALTER TABLE public.rain_state
  ALTER COLUMN rain_uuid SET NOT NULL;

ALTER TABLE public.rain_state
  DROP CONSTRAINT IF EXISTS rain_state_status_check;

ALTER TABLE public.rain_state
  ADD CONSTRAINT rain_state_status_check
  CHECK (status IN ('active', 'settled'));

CREATE UNIQUE INDEX IF NOT EXISTS rain_state_rain_uuid_unique
  ON public.rain_state (rain_uuid);

CREATE UNIQUE INDEX IF NOT EXISTS rain_state_one_active_rain
  ON public.rain_state ((status))
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS rain_state_created_at_idx
  ON public.rain_state (created_at DESC);

ALTER TABLE public.rain_events
  ADD COLUMN IF NOT EXISTS rain_uuid uuid;

CREATE INDEX IF NOT EXISTS rain_events_rain_uuid_idx
  ON public.rain_events (rain_uuid, created_at DESC);

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
  WHERE (rain_uuid::text = p_state_id OR id = p_state_id)
    AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The active rain could not be found.';
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
    RETURN jsonb_build_object(
      'joined', false,
      'already_joined', true,
      'rain_uuid', v_state.rain_uuid
    );
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
  WHERE rain_uuid = v_state.rain_uuid;

  RETURN jsonb_build_object(
    'joined', true,
    'already_joined', false,
    'rain_uuid', v_state.rain_uuid,
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
  v_next_rain_uuid uuid := gen_random_uuid();
  v_next_started_at timestamptz := now();
  v_next_ends_at timestamptz;
BEGIN
  SELECT *
  INTO v_state
  FROM public.rain_state
  WHERE (rain_uuid::text = p_state_id OR id = p_state_id)
    AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The active rain could not be found.';
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
    INSERT INTO public.rain_events (
      id,
      event_type,
      username,
      amount,
      profile_id,
      roblox_id,
      rain_uuid
    )
    SELECT
      gen_random_uuid()::text,
      'rain_payout',
      COALESCE(NULLIF(username, ''), 'user'),
      amount,
      profile_id,
      NULLIF(roblox_id, ''),
      v_state.rain_uuid
    FROM updated_profiles;
  ELSE
    v_base_payout := 0;
    v_remainder := 0;
  END IF;

  UPDATE public.rain_state
  SET status = 'settled',
      countdown_seconds = 0,
      settled_at = now(),
      last_updated_at = now()
  WHERE rain_uuid = v_state.rain_uuid;

  v_next_ends_at := v_next_started_at + make_interval(secs => p_next_countdown);

  INSERT INTO public.rain_state (
    id,
    rain_uuid,
    status,
    countdown_seconds,
    pool_amount,
    users,
    created_at,
    started_at,
    ends_at,
    last_updated_at
  )
  VALUES (
    v_next_rain_uuid::text,
    v_next_rain_uuid,
    'active',
    p_next_countdown,
    p_next_pool,
    '[]'::jsonb,
    v_next_started_at,
    v_next_started_at,
    v_next_ends_at,
    v_next_started_at
  );

  RETURN jsonb_build_object(
    'settled_rain_uuid', v_state.rain_uuid,
    'next_rain_uuid', v_next_rain_uuid,
    'next_started_at', v_next_started_at,
    'next_ends_at', v_next_ends_at,
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
