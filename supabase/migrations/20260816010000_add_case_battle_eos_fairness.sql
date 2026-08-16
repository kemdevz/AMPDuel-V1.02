ALTER TABLE public.case_battle_games
  ADD COLUMN IF NOT EXISTS eos_block_number bigint,
  ADD COLUMN IF NOT EXISTS eos_block_id text;

ALTER TABLE public.case_battle_games
  DROP CONSTRAINT IF EXISTS case_battle_games_eos_block_number_check,
  DROP CONSTRAINT IF EXISTS case_battle_games_eos_block_id_check;

ALTER TABLE public.case_battle_games
  ADD CONSTRAINT case_battle_games_eos_block_number_check
    CHECK (eos_block_number IS NULL OR eos_block_number > 0),
  ADD CONSTRAINT case_battle_games_eos_block_id_check
    CHECK (eos_block_id IS NULL OR eos_block_id ~ '^[0-9a-f]{64}$');

COMMENT ON COLUMN public.case_battle_games.eos_block_number IS
  'Future EOS mainnet block selected before the Case Battle outcome is generated.';

COMMENT ON COLUMN public.case_battle_games.eos_block_id IS
  'Validated EOS block ID mixed with the committed server seed for every Case Battle roll.';
