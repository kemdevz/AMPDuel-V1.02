-- A fifth distinct bot lets a 3v3 battle be filled by one creator and five
-- bots. Bot profiles are reusable across separate battles; uniqueness is only
-- enforced among the slots of an individual battle by the application.

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
VALUES (
  '00000000-0000-4000-8000-00000000b005',
  'DrizzyBot',
  'https://api.dicebear.com/9.x/bottts-neutral/svg?seed=DrizzyBot',
  'https://api.dicebear.com/9.x/bottts-neutral/svg?seed=DrizzyBot',
  9000000000000000,
  1,
  0,
  0,
  0,
  0,
  now(),
  now()
)
ON CONFLICT (id) DO UPDATE SET
  username = EXCLUDED.username,
  avatar_url = EXCLUDED.avatar_url,
  avatar_headshot_url = EXCLUDED.avatar_headshot_url,
  balance = EXCLUDED.balance,
  updated_at = now();
