-- Ensure the optional Coinflip wager lock exists even on environments where
-- the original migration was skipped, then explicitly refresh PostgREST's
-- schema cache so inserts can use the column immediately.
ALTER TABLE public.coinflip_games
  ADD COLUMN IF NOT EXISTS game_mode text;

ALTER TABLE public.coinflip_games
  DROP CONSTRAINT IF EXISTS coinflip_games_game_mode_check;

ALTER TABLE public.coinflip_games
  ADD CONSTRAINT coinflip_games_game_mode_check
  CHECK (game_mode IS NULL OR game_mode IN ('gems_only', 'titanics_only'));

NOTIFY pgrst, 'reload schema';
