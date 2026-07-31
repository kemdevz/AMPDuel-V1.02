ALTER TABLE public.withdraws
  ADD COLUMN IF NOT EXISTS image_url text;

ALTER TABLE public.withdraws
  ADD COLUMN IF NOT EXISTS value integer;

ALTER TABLE public.withdraws
  ALTER COLUMN item_id DROP NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'withdraws'
      AND constraint_name = 'withdraws_item_id_fkey'
  ) THEN
    ALTER TABLE public.withdraws
      DROP CONSTRAINT withdraws_item_id_fkey;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'withdraws'
      AND constraint_name = 'withdraws_item_id_fkey'
  ) THEN
    ALTER TABLE public.withdraws
      ADD CONSTRAINT withdraws_item_id_fkey
      FOREIGN KEY (item_id) REFERENCES public.inventory_items(id) ON DELETE SET NULL;
  END IF;
END $$;
