ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS roblox_id text;

DROP FUNCTION IF EXISTS public.join_rain(text, text, integer);

CREATE OR REPLACE FUNCTION public.join_rain(
  p_state_id text,
  p_profile_id text,
  p_join_window_seconds integer DEFAULT 300,
  p_roblox_id text DEFAULT NULL
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
  v_roblox_id text;
BEGIN
  IF p_profile_id IS NULL OR btrim(p_profile_id) = '' THEN
    RAISE EXCEPTION 'You must be signed in to join the rain.';
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

  IF v_state.countdown_seconds <= 0 OR v_state.countdown_seconds > p_join_window_seconds THEN
    RAISE EXCEPTION 'The rain is not accepting entries right now.';
  END IF;

  SELECT *
  INTO v_profile
  FROM public.user_profiles
  WHERE id::text = p_profile_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Your user profile could not be found.';
  END IF;

  v_profile_json := to_jsonb(v_profile);
  v_roblox_id := COALESCE(
    NULLIF(v_profile_json->>'roblox_id', ''),
    CASE
      WHEN COALESCE(p_roblox_id, '') ~ '^[0-9]+$' THEN p_roblox_id
      ELSE NULL
    END,
    CASE
      WHEN p_profile_id ~ '^roblox:[0-9]+$' THEN substring(p_profile_id FROM 8)
      ELSE NULL
    END
  );

  IF NULLIF(v_profile_json->>'roblox_id', '') IS NULL AND v_roblox_id IS NOT NULL THEN
    UPDATE public.user_profiles
    SET roblox_id = v_roblox_id,
        updated_at = now()
    WHERE id::text = p_profile_id;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(v_state.users, '[]'::jsonb)) AS participant
    WHERE participant->>'id' = p_profile_id
  ) THEN
    IF v_roblox_id IS NOT NULL THEN
      UPDATE public.rain_state
      SET users = (
            SELECT COALESCE(
              jsonb_agg(
                CASE
                  WHEN participant->>'id' = p_profile_id
                    THEN jsonb_set(participant, '{roblox_id}', to_jsonb(v_roblox_id), true)
                  ELSE participant
                END
                ORDER BY ordinal
              ),
              '[]'::jsonb
            )
            FROM jsonb_array_elements(COALESCE(v_state.users, '[]'::jsonb))
              WITH ORDINALITY AS listed(participant, ordinal)
          ),
          last_updated_at = now()
      WHERE rain_uuid = v_state.rain_uuid;
    END IF;

    RETURN jsonb_build_object(
      'joined', false,
      'already_joined', true,
      'rain_uuid', v_state.rain_uuid,
      'roblox_id', v_roblox_id
    );
  END IF;

  v_participant := jsonb_build_object(
    'id', v_profile.id::text,
    'roblox_id', v_roblox_id,
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

-- Repair participants already stored without a Roblox ID whenever their
-- corresponding profile row now contains one.
UPDATE public.rain_state AS rain
SET users = (
      SELECT COALESCE(
        jsonb_agg(
          CASE
            WHEN NULLIF(participant->>'roblox_id', '') IS NULL
              AND NULLIF(profile.roblox_id, '') IS NOT NULL
              THEN jsonb_set(participant, '{roblox_id}', to_jsonb(profile.roblox_id), true)
            ELSE participant
          END
          ORDER BY ordinal
        ),
        '[]'::jsonb
      )
      FROM jsonb_array_elements(COALESCE(rain.users, '[]'::jsonb))
        WITH ORDINALITY AS listed(participant, ordinal)
      LEFT JOIN public.user_profiles AS profile
        ON profile.id::text = participant->>'id'
    ),
    last_updated_at = now()
WHERE jsonb_typeof(rain.users) = 'array'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(rain.users, '[]'::jsonb)) AS participant
    JOIN public.user_profiles AS profile
      ON profile.id::text = participant->>'id'
    WHERE NULLIF(participant->>'roblox_id', '') IS NULL
      AND NULLIF(profile.roblox_id, '') IS NOT NULL
  );

REVOKE ALL ON FUNCTION public.join_rain(text, text, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.join_rain(text, text, integer, text) TO service_role;
