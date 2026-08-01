ALTER TABLE public.case_openings
  ADD COLUMN IF NOT EXISTS batch_id uuid,
  ADD COLUMN IF NOT EXISTS batch_position smallint,
  ADD COLUMN IF NOT EXISTS batch_quantity smallint,
  ADD COLUMN IF NOT EXISTS fairness_seed_id uuid;

-- Preserve any legacy history rows while assigning them independent one-case
-- batches and fairness epochs. New rows always receive server-provided values.
UPDATE public.case_openings
SET batch_id = COALESCE(batch_id, gen_random_uuid()),
    batch_position = COALESCE(batch_position, 0),
    batch_quantity = COALESCE(batch_quantity, 1),
    fairness_seed_id = COALESCE(fairness_seed_id, gen_random_uuid())
WHERE batch_id IS NULL
   OR batch_position IS NULL
   OR batch_quantity IS NULL
   OR fairness_seed_id IS NULL;

ALTER TABLE public.case_openings
  ALTER COLUMN batch_id SET NOT NULL,
  ALTER COLUMN batch_position SET NOT NULL,
  ALTER COLUMN batch_quantity SET NOT NULL,
  ALTER COLUMN fairness_seed_id SET NOT NULL,
  ALTER COLUMN server_seed DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.case_openings'::regclass
      AND conname = 'case_openings_batch_position_range_check'
  ) THEN
    ALTER TABLE public.case_openings
      ADD CONSTRAINT case_openings_batch_position_range_check
      CHECK (batch_position BETWEEN 0 AND 3);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.case_openings'::regclass
      AND conname = 'case_openings_batch_quantity_range_check'
  ) THEN
    ALTER TABLE public.case_openings
      ADD CONSTRAINT case_openings_batch_quantity_range_check
      CHECK (batch_quantity BETWEEN 1 AND 4);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.case_openings'::regclass
      AND conname = 'case_openings_batch_position_check'
  ) THEN
    ALTER TABLE public.case_openings
      ADD CONSTRAINT case_openings_batch_position_check
      CHECK (batch_position < batch_quantity);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.case_openings'::regclass
      AND conname = 'case_openings_user_batch_position_key'
  ) THEN
    ALTER TABLE public.case_openings
      ADD CONSTRAINT case_openings_user_batch_position_key
      UNIQUE (user_id, batch_id, batch_position);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.case_openings'::regclass
      AND conname = 'case_openings_user_seed_nonce_key'
  ) THEN
    ALTER TABLE public.case_openings
      ADD CONSTRAINT case_openings_user_seed_nonce_key
      UNIQUE (user_id, fairness_seed_id, nonce);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS case_openings_batch_id_idx
  ON public.case_openings (batch_id);

COMMENT ON COLUMN public.case_openings.server_seed IS
  'NULL while this fairness seed is active; revealed only after the user rotates to a new server seed.';
