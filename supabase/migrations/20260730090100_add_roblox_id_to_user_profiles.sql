ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS roblox_id text;

UPDATE public.user_profiles
SET roblox_id = SUBSTRING(id::text FROM 8)
WHERE roblox_id IS NULL
  AND id::text LIKE 'roblox:%'
  AND SUBSTRING(id::text FROM 8) ~ '^[0-9]+$';

ALTER TABLE public.user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_roblox_id_is_numeric;

ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_roblox_id_is_numeric
  CHECK (roblox_id IS NULL OR roblox_id ~ '^[0-9]+$');

CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_roblox_id_unique
  ON public.user_profiles (roblox_id)
  WHERE roblox_id IS NOT NULL;
