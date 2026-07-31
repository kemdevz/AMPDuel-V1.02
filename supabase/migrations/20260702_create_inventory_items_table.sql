CREATE TABLE IF NOT EXISTS public.items (
  id uuid DEFAULT gen_random_uuid(),
  name text NOT NULL,
  value integer NOT NULL DEFAULT 0,
  image_url text,
  type text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'items'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'items' AND column_name = 'id'
  ) THEN
    ALTER TABLE public.items ADD COLUMN id uuid;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.items'::regclass AND contype = 'p'
  ) THEN
    ALTER TABLE public.items ADD CONSTRAINT items_pkey PRIMARY KEY (id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid,
  user_id text NOT NULL,
  name text NOT NULL,
  value integer NOT NULL DEFAULT 0,
  image_url text,
  type text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS item_id uuid;

ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS user_id text;

ALTER TABLE public.inventory_items
  DROP COLUMN IF EXISTS quantity;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'inventory_items'
      AND constraint_name = 'inventory_items_user_id_fkey'
  ) THEN
    ALTER TABLE public.inventory_items
      DROP CONSTRAINT inventory_items_user_id_fkey;
  END IF;
END $$;

ALTER TABLE public.inventory_items
  ALTER COLUMN user_id TYPE text USING user_id::text;

ALTER TABLE public.inventory_items
  ALTER COLUMN user_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'inventory_items'
      AND constraint_name = 'inventory_items_item_id_fkey'
  ) THEN
    ALTER TABLE public.inventory_items
      ADD CONSTRAINT inventory_items_item_id_fkey
      FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS inventory_items_user_id_idx ON public.inventory_items (user_id);
CREATE INDEX IF NOT EXISTS inventory_items_item_id_idx ON public.inventory_items (item_id);

ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own inventory_items" ON public.inventory_items;
DROP POLICY IF EXISTS "Users can insert own inventory_items" ON public.inventory_items;
DROP POLICY IF EXISTS "Users can update own inventory_items" ON public.inventory_items;
DROP POLICY IF EXISTS "Users can delete own inventory_items" ON public.inventory_items;

CREATE POLICY "Users can view own inventory_items"
  ON public.inventory_items
  FOR SELECT
  USING (true);

CREATE POLICY "Users can insert own inventory_items"
  ON public.inventory_items
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update own inventory_items"
  ON public.inventory_items
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can delete own inventory_items"
  ON public.inventory_items
  FOR DELETE
  USING (true);
