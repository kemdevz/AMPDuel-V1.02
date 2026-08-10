-- Add six-player 3v3 Case Battles. Historical Group layouts remain valid so
-- existing battle records can still be read, but the application no longer
-- offers or accepts them for new battles.

ALTER TABLE public.case_battle_games
  DROP CONSTRAINT IF EXISTS case_battle_games_player_option_check,
  DROP CONSTRAINT IF EXISTS case_battle_games_max_players_check,
  DROP CONSTRAINT IF EXISTS case_battle_games_player_count_check;

ALTER TABLE public.case_battle_games
  ADD CONSTRAINT case_battle_games_player_option_check
    CHECK (player_option IN (
      'ffa-2', 'ffa-3', 'ffa-4', 'team-4', 'team-6',
      'group-2', 'group-3', 'group-4'
    )),
  ADD CONSTRAINT case_battle_games_max_players_check
    CHECK (max_players BETWEEN 2 AND 6),
  ADD CONSTRAINT case_battle_games_player_count_check
    CHECK (player_count BETWEEN 1 AND 6);

NOTIFY pgrst, 'reload schema';
