-- Add avatar URL columns to coinflip games so creator/opponent headshots can be stored and rendered
ALTER TABLE public.coinflip_games
  ADD COLUMN IF NOT EXISTS creator_avatar_url text,
  ADD COLUMN IF NOT EXISTS opponent_avatar_url text;
