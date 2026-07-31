CREATE OR REPLACE FUNCTION public.tip_rain(
  p_state_id text,
  p_profile_id text,
  p_amount integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state public.rain_state%ROWTYPE;
  v_profile public.user_profiles%ROWTYPE;
  v_profile_json jsonb;
  v_new_balance integer;
  v_new_pool integer;
  v_username text;
BEGIN
  IF p_profile_id IS NULL OR btrim(p_profile_id) = '' THEN
    RAISE EXCEPTION 'Sign in before tipping the rain.';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Enter a valid whole-number tip amount.';
  END IF;

  SELECT *
  INTO v_state
  FROM public.rain_state
  WHERE (rain_uuid::text = p_state_id OR id::text = p_state_id)
    AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The active rain could not be found.';
  END IF;

  SELECT *
  INTO v_profile
  FROM public.user_profiles
  WHERE id::text = p_profile_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Your user profile could not be found.';
  END IF;

  IF COALESCE(v_profile.balance, 0) < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance.';
  END IF;

  v_profile_json := to_jsonb(v_profile);
  v_username := COALESCE(NULLIF(v_profile_json->>'username', ''), 'user');

  UPDATE public.user_profiles
  SET balance = COALESCE(balance, 0) - p_amount,
      updated_at = now()
  WHERE id::text = p_profile_id
  RETURNING balance INTO v_new_balance;

  UPDATE public.rain_state
  SET pool_amount = COALESCE(pool_amount, 0) + p_amount,
      last_updated_at = now()
  WHERE rain_uuid = v_state.rain_uuid
  RETURNING pool_amount INTO v_new_pool;

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
  FROM jsonb_populate_record(
    NULL::public.rain_events,
    jsonb_build_object(
      'id', gen_random_uuid()::text,
      'event_type', 'rain_tip',
      'username', v_username,
      'amount', p_amount,
      'profile_id', p_profile_id,
      'roblox_id', NULLIF(v_profile_json->>'roblox_id', ''),
      'rain_uuid', v_state.rain_uuid::text
    )
  ) AS event_row;

  RETURN jsonb_build_object(
    'rain_uuid', v_state.rain_uuid,
    'profile_id', p_profile_id,
    'username', v_username,
    'amount', p_amount,
    'balance', v_new_balance,
    'pool_amount', v_new_pool
  );
END;
$$;

REVOKE ALL ON FUNCTION public.tip_rain(text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tip_rain(text, text, integer) TO service_role;
