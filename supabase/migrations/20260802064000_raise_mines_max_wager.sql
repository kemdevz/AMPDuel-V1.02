-- Keep direct Mines rows within the same server-authoritative wager limits as
-- the application. Roll already uses the same 10M maximum.

ALTER TABLE public.mines_games
  DROP CONSTRAINT IF EXISTS mines_games_wager_value_range_check;

ALTER TABLE public.mines_games
  ADD CONSTRAINT mines_games_wager_value_range_check
  CHECK (
    wager_value >= 5000
    AND wager_value <= 10000000
    AND wager_value = trunc(wager_value)
  );

