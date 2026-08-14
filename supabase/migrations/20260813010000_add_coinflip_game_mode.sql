ALTER TABLE public.coinflip_games
  ADD COLUMN IF NOT EXISTS game_mode text;

ALTER TABLE public.coinflip_games
  DROP CONSTRAINT IF EXISTS coinflip_games_game_mode_check;

ALTER TABLE public.coinflip_games
  ADD CONSTRAINT coinflip_games_game_mode_check
  CHECK (game_mode IS NULL OR game_mode IN ('gems_only', 'titanics_only'));
