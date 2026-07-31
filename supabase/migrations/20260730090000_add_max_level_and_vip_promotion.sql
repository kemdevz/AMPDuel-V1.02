ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS role text DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS max_level integer DEFAULT 200;

UPDATE public.user_profiles
SET
  level = LEAST(GREATEST(COALESCE(level, 1), 1), 200),
  max_level = 200,
  role = CASE
    WHEN level >= 200 AND LOWER(COALESCE(role, 'user')) IN ('user', 'vip') THEN 'VIP'
    ELSE COALESCE(role, 'user')
  END;

ALTER TABLE public.user_profiles
  ALTER COLUMN role SET DEFAULT 'user',
  ALTER COLUMN role SET NOT NULL,
  ALTER COLUMN max_level SET DEFAULT 200,
  ALTER COLUMN max_level SET NOT NULL;

ALTER TABLE public.user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_max_level_is_200,
  DROP CONSTRAINT IF EXISTS user_profiles_level_within_range;

ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_max_level_is_200 CHECK (max_level = 200),
  ADD CONSTRAINT user_profiles_level_within_range CHECK (level BETWEEN 1 AND max_level);

CREATE OR REPLACE FUNCTION public.enforce_user_profile_max_level()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.max_level := 200;
  NEW.level := LEAST(GREATEST(COALESCE(NEW.level, 1), 1), NEW.max_level);

  IF NEW.level >= NEW.max_level
    AND LOWER(COALESCE(NEW.role, 'user')) IN ('user', 'vip')
  THEN
    NEW.role := 'VIP';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_user_profile_max_level_trigger
  ON public.user_profiles;

CREATE TRIGGER enforce_user_profile_max_level_trigger
BEFORE INSERT OR UPDATE OF level, max_level, role
ON public.user_profiles
FOR EACH ROW
EXECUTE FUNCTION public.enforce_user_profile_max_level();
