-- Add the three-team, six-player 2v2v2 Case Battle layout. Historical Group
-- layouts remain accepted so existing battle records continue to load.

ALTER TABLE public.case_battle_games
  DROP CONSTRAINT IF EXISTS case_battle_games_player_option_check;

ALTER TABLE public.case_battle_games
  ADD CONSTRAINT case_battle_games_player_option_check
    CHECK (player_option IN (
      'ffa-2', 'ffa-3', 'ffa-4',
      'team-4', 'team-6', 'team-6-2v2v2',
      'group-2', 'group-3', 'group-4'
    ));

NOTIFY pgrst, 'reload schema';
