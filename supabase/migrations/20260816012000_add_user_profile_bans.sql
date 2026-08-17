ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS is_banned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS banned_at timestamptz,
  ADD COLUMN IF NOT EXISTS banned_by text;

COMMENT ON COLUMN public.user_profiles.is_banned IS
  'Prevents the profile from creating or continuing an authenticated site session.';
