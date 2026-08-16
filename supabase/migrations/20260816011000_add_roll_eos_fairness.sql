ALTER TABLE public.roll_rounds
  ADD COLUMN IF NOT EXISTS eos_block_number bigint,
  ADD COLUMN IF NOT EXISTS eos_block_id text;

ALTER TABLE public.roll_rounds
  DROP CONSTRAINT IF EXISTS roll_rounds_eos_block_number_check,
  DROP CONSTRAINT IF EXISTS roll_rounds_eos_block_id_check;

ALTER TABLE public.roll_rounds
  ADD CONSTRAINT roll_rounds_eos_block_number_check
    CHECK (eos_block_number IS NULL OR eos_block_number > 0),
  ADD CONSTRAINT roll_rounds_eos_block_id_check
    CHECK (eos_block_id IS NULL OR eos_block_id ~ '^[0-9a-f]{64}$');

COMMENT ON COLUMN public.roll_rounds.eos_block_number IS
  'Future EOS mainnet block selected after the Roll server-seed commitment is created.';

COMMENT ON COLUMN public.roll_rounds.eos_block_id IS
  'Validated EOS block ID mixed with the committed server seed to select the Roll winning index.';
