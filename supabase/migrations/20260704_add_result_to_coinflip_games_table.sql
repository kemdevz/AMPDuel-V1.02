-- Add result column to coinflip_games
ALTER TABLE public.coinflip_games
  ADD COLUMN IF NOT EXISTS result text;

-- Optionally: index if you will query by result frequently
-- CREATE INDEX IF NOT EXISTS coinflip_games_result_idx ON public.coinflip_games (result);
