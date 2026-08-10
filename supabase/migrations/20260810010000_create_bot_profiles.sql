CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Keep bot profiles structurally aligned with the deployed user_profiles table,
-- including its current defaults, constraints, identity settings and indexes.
CREATE TABLE IF NOT EXISTS public.bot_profiles (
  LIKE public.user_profiles INCLUDING ALL
);

ALTER TABLE public.bot_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Bot profiles are publicly readable" ON public.bot_profiles;
CREATE POLICY "Bot profiles are publicly readable"
  ON public.bot_profiles
  FOR SELECT
  TO anon, authenticated
  USING (true);

REVOKE INSERT, UPDATE, DELETE ON TABLE public.bot_profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.bot_profiles TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.bot_profiles TO service_role;

INSERT INTO public.bot_profiles (
  id,
  username,
  avatar_url,
  avatar_headshot_url,
  balance,
  level,
  xp,
  played,
  won,
  lost,
  created_at,
  updated_at
)
VALUES
  (
    '00000000-0000-4000-8000-00000000b001',
    'Speedy',
    'https://i.ibb.co/c0rYxhG/g-rsel-2026-01-25-172104368.png',
    'https://i.ibb.co/c0rYxhG/g-rsel-2026-01-25-172104368.png',
    9000000000000000, 25, 0, 0, 0, 0, now(), now()
  ),
  (
    '00000000-0000-4000-8000-00000000b002',
    'Ricky',
    'https://i.ibb.co/V0TZRNMN/no-Filter.png',
    'https://i.ibb.co/V0TZRNMN/no-Filter.png',
    9000000000000000, 50, 0, 0, 0, 0, now(), now()
  ),
  (
    '00000000-0000-4000-8000-00000000b003',
    'Kayne',
    'https://tr.rbxcdn.com/30DAY-AvatarHeadshot-C6866C5603AD54179A7C326D938EBDDD-Png/420/420/AvatarHeadshot/Png/noFilter',
    'https://tr.rbxcdn.com/30DAY-AvatarHeadshot-C6866C5603AD54179A7C326D938EBDDD-Png/420/420/AvatarHeadshot/Png/noFilter',
    9000000000000000, 75, 0, 0, 0, 0, now(), now()
  ),
  (
    '00000000-0000-4000-8000-00000000b004',
    'Nova',
    'https://api.dicebear.com/9.x/bottts-neutral/svg?seed=Nova',
    'https://api.dicebear.com/9.x/bottts-neutral/svg?seed=Nova',
    9000000000000000, 100, 0, 0, 0, 0, now(), now()
  )
ON CONFLICT (id) DO UPDATE SET
  username = EXCLUDED.username,
  avatar_url = EXCLUDED.avatar_url,
  avatar_headshot_url = EXCLUDED.avatar_headshot_url,
  balance = EXCLUDED.balance,
  updated_at = now();

COMMENT ON TABLE public.bot_profiles IS
  'Case Battle bot accounts. The table mirrors user_profiles so shared profile UI can render bots consistently.';
