ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS discord_linked boolean DEFAULT false;
