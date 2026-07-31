CREATE TABLE IF NOT EXISTS public.withdraws (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  user_name text,
  item_id uuid,
  item_name text,
  image_url text,
  value integer NOT NULL DEFAULT 0,
  withdrawed_at timestamptz NOT NULL DEFAULT now(),
  canceled boolean NOT NULL DEFAULT false
);

ALTER TABLE public.withdraws
  ADD COLUMN IF NOT EXISTS user_id text;

ALTER TABLE public.withdraws
  ADD COLUMN IF NOT EXISTS user_name text;

ALTER TABLE public.withdraws
  ADD COLUMN IF NOT EXISTS item_id uuid;

ALTER TABLE public.withdraws
  ADD COLUMN IF NOT EXISTS item_name text;

ALTER TABLE public.withdraws
  ADD COLUMN IF NOT EXISTS withdrawed_at timestamptz;

ALTER TABLE public.withdraws
  ADD COLUMN IF NOT EXISTS canceled boolean;

ALTER TABLE public.withdraws
  ADD COLUMN IF NOT EXISTS image_url text;

ALTER TABLE public.withdraws
  ADD COLUMN IF NOT EXISTS value integer;

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

CREATE INDEX IF NOT EXISTS withdraws_user_id_idx ON public.withdraws (user_id);
CREATE INDEX IF NOT EXISTS withdraws_item_id_idx ON public.withdraws (item_id);

ALTER TABLE public.withdraws ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view withdraws" ON public.withdraws;
DROP POLICY IF EXISTS "Users can insert withdraws" ON public.withdraws;
DROP POLICY IF EXISTS "Users can update withdraws" ON public.withdraws;
DROP POLICY IF EXISTS "Users can delete withdraws" ON public.withdraws;

CREATE POLICY "Users can view withdraws"
  ON public.withdraws
  FOR SELECT
  USING (true);

CREATE POLICY "Users can insert withdraws"
  ON public.withdraws
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update withdraws"
  ON public.withdraws
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can delete withdraws"
  ON public.withdraws
  FOR DELETE
  USING (true);
