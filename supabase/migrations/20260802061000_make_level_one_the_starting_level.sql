-- Level 1 is the starting level. The 199 thresholds from level 1 through
-- level 199 compound by 4% and total approximately 6.4 trillion XP.

ALTER TABLE public.user_profiles
  ALTER COLUMN level SET DEFAULT 1;

UPDATE public.user_profiles
SET level = 1,
    updated_at = now()
WHERE level < 1;

ALTER TABLE public.user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_level_within_range;
ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_level_within_range
  CHECK (level BETWEEN 1 AND max_level);

CREATE OR REPLACE FUNCTION public.enforce_user_profile_max_level()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.max_level := 200;
  NEW.level := LEAST(GREATEST(COALESCE(NEW.level, 1), 1), NEW.max_level);
  NEW.xp := GREATEST(COALESCE(NEW.xp, 0), 0);
  NEW.lifetime_xp := GREATEST(COALESCE(NEW.lifetime_xp, 0), 0);

  IF NEW.level >= NEW.max_level
     AND LOWER(COALESCE(NEW.role, 'user')) IN ('user', 'vip') THEN
    NEW.role := 'VIP';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.profile_xp_required_for_level(p_level integer)
RETURNS bigint
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT round(
    104419726.87628177::numeric
    * power(
        1.04::numeric,
        LEAST(GREATEST(p_level, 1), 199) - 1
      )
  )::bigint;
$$;

