CREATE TABLE IF NOT EXISTS public.user_profiles (
  id text PRIMARY KEY,
  username text,
  avatar_url text,
  avatar_headshot_url text,
  balance integer DEFAULT 0,
  level integer DEFAULT 1,
  xp integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  ip_address text
);

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own user_profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can insert own user_profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can update own user_profile" ON public.user_profiles;

CREATE POLICY "Allow public read/write user_profiles"
  ON public.user_profiles
  FOR ALL
  USING (true)
  WITH CHECK (true);
