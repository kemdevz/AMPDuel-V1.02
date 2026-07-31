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
  WHERE (rain_uuid::text = p_state_id OR id::text = p_state_id)
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
      event_row.id,
      event_row.event_type,
      event_row.username,
      event_row.amount,
      event_row.profile_id,
      event_row.roblox_id,
      event_row.rain_uuid
    FROM updated_profiles
    CROSS JOIN LATERAL jsonb_populate_record(
      NULL::public.rain_events,
      jsonb_build_object(
        'id', gen_random_uuid()::text,
        'event_type', 'rain_payout',
        'username', COALESCE(NULLIF(updated_profiles.username, ''), 'user'),
        'amount', updated_profiles.amount,
        'profile_id', updated_profiles.profile_id,
        'roblox_id', NULLIF(updated_profiles.roblox_id, ''),
        'rain_uuid', v_state.rain_uuid::text
      )
    ) AS event_row;
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
  SELECT
    next_rain.id,
    next_rain.rain_uuid,
    next_rain.status,
    next_rain.countdown_seconds,
    next_rain.pool_amount,
    next_rain.users,
    next_rain.created_at,
    next_rain.started_at,
    next_rain.ends_at,
    next_rain.last_updated_at
  FROM jsonb_populate_record(
    NULL::public.rain_state,
    jsonb_build_object(
      'id', v_next_rain_uuid::text,
      'rain_uuid', v_next_rain_uuid::text,
      'status', 'active',
      'countdown_seconds', p_next_countdown,
      'pool_amount', p_next_pool,
      'users', '[]'::jsonb,
      'created_at', v_next_started_at,
      'started_at', v_next_started_at,
      'ends_at', v_next_ends_at,
      'last_updated_at', v_next_started_at
    )
  ) AS next_rain;

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

REVOKE ALL ON FUNCTION public.settle_rain(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_rain(text, integer, integer) TO service_role;
