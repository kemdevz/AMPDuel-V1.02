ALTER TABLE public.mines_games
ADD COLUMN IF NOT EXISTS grid_size integer NOT NULL DEFAULT 5;

ALTER TABLE public.mines_games
DROP CONSTRAINT IF EXISTS mines_games_grid_size_check;

ALTER TABLE public.mines_games
ADD CONSTRAINT mines_games_grid_size_check
CHECK (grid_size BETWEEN 5 AND 8);
