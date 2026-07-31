ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS ignored_users text[] DEFAULT ARRAY[]::text[];

UPDATE public.user_profiles
SET ignored_users = ARRAY[]::text[]
WHERE ignored_users IS NULL;

ALTER TABLE public.user_profiles
  ALTER COLUMN ignored_users SET DEFAULT ARRAY[]::text[],
  ALTER COLUMN ignored_users SET NOT NULL;
