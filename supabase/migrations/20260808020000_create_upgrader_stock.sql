CREATE TABLE IF NOT EXISTS public.upgrader_stock (
  uuid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.items(id) ON DELETE RESTRICT,
  item_uuid uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  value integer NOT NULL DEFAULT 0 CHECK (value >= 0),
  image_url text,
  type text,
  stocked_at timestamptz NOT NULL DEFAULT now(),
  from_user text
);

CREATE UNIQUE INDEX IF NOT EXISTS upgrader_stock_item_uuid_key
  ON public.upgrader_stock (item_uuid);

CREATE INDEX IF NOT EXISTS upgrader_stock_item_id_idx
  ON public.upgrader_stock (item_id);

CREATE INDEX IF NOT EXISTS upgrader_stock_value_idx
  ON public.upgrader_stock (value DESC);

ALTER TABLE public.upgrader_stock ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read upgrader stock" ON public.upgrader_stock;
CREATE POLICY "Anyone can read upgrader stock"
  ON public.upgrader_stock
  FOR SELECT
  TO anon, authenticated
  USING (true);

COMMENT ON TABLE public.upgrader_stock IS
  'Individual item copies available as Upgrader targets when wagering inventory items.';

COMMENT ON COLUMN public.upgrader_stock.item_id IS
  'Catalog item UUID referencing public.items.id.';

COMMENT ON COLUMN public.upgrader_stock.item_uuid IS
  'Unique UUID for this individual stock copy.';
