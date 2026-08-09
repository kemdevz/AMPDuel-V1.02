-- XP is awarded one-for-one with wager value. Level 1 requires exactly
-- 100,000 XP, and each following level requires 4% more than the prior level.

CREATE OR REPLACE FUNCTION public.profile_xp_required_for_level(p_level integer)
RETURNS bigint
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT round(
    100000::numeric
    * power(
        1.04::numeric,
        LEAST(GREATEST(p_level, 1), 199) - 1
      )
  )::bigint;
$$;

-- Carry any existing XP above the new, lower threshold through the appropriate
-- levels immediately instead of waiting for the player's next wager.
DO $$
DECLARE
  selected_profile record;
  next_level integer;
  next_xp bigint;
  required_xp bigint;
BEGIN
  FOR selected_profile IN
    SELECT id, level, xp, max_level
    FROM public.user_profiles
    FOR UPDATE
  LOOP
    next_level := LEAST(
      GREATEST(COALESCE(selected_profile.level, 1), 1),
      LEAST(GREATEST(COALESCE(selected_profile.max_level, 200), 1), 200)
    );
    next_xp := GREATEST(COALESCE(selected_profile.xp, 0), 0);

    WHILE next_level < LEAST(COALESCE(selected_profile.max_level, 200), 200) LOOP
      required_xp := public.profile_xp_required_for_level(next_level);
      EXIT WHEN next_xp < required_xp;
      next_xp := next_xp - required_xp;
      next_level := next_level + 1;
    END LOOP;

    IF next_level >= LEAST(COALESCE(selected_profile.max_level, 200), 200) THEN
      next_xp := 0;
    END IF;

    UPDATE public.user_profiles
    SET level = next_level,
        xp = next_xp,
        updated_at = now()
    WHERE id = selected_profile.id;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.profile_xp_required_for_level(integer)
  FROM PUBLIC, anon, authenticated;
