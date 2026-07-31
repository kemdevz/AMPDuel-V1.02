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
  v_profile_json jsonb;
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

  -- Read optional profile fields through JSON so this works with both older
  -- user_profiles schemas and schemas that include the roblox_id column.
  v_profile_json := to_jsonb(v_profile);
  v_participant := jsonb_build_object(
    'id', v_profile.id::text,
    'roblox_id', NULLIF(v_profile_json->>'roblox_id', ''),
    'username', COALESCE(NULLIF(v_profile_json->>'username', ''), 'user'),
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

REVOKE ALL ON FUNCTION public.join_rain(text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.join_rain(text, text, integer) TO service_role;
