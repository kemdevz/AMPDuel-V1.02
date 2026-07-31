CREATE TABLE IF NOT EXISTS public.coins_to_items_exchanges (
  uuid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text,
  user_name text,
  item_name text NOT NULL,
  value integer NOT NULL DEFAULT 0,
  image_url text,
  type text,
  coin_amount integer NOT NULL DEFAULT 0,
  purchased_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.coins_to_items_exchanges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read/write coins_to_items_exchanges" ON public.coins_to_items_exchanges;

CREATE POLICY "Allow public read/write coins_to_items_exchanges"
  ON public.coins_to_items_exchanges
  FOR ALL
  USING (true)
  WITH CHECK (true);
