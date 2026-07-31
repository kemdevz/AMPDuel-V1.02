CREATE TABLE IF NOT EXISTS public.exchange_stock (
  uuid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  value integer NOT NULL DEFAULT 0,
  image_url text,
  type text,
  stocked_at timestamptz NOT NULL DEFAULT now(),
  from_user text
);

CREATE TABLE IF NOT EXISTS public.items_to_coins_exchanges (
  uuid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text,
  user_name text,
  item_name text NOT NULL,
  value integer NOT NULL DEFAULT 0,
  image_url text,
  type text,
  coin_amount integer NOT NULL DEFAULT 0,
  exchanged_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.exchange_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items_to_coins_exchanges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read/write exchange_stock" ON public.exchange_stock;
DROP POLICY IF EXISTS "Allow public read/write items_to_coins_exchanges" ON public.items_to_coins_exchanges;

CREATE POLICY "Allow public read/write exchange_stock"
  ON public.exchange_stock
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow public read/write items_to_coins_exchanges"
  ON public.items_to_coins_exchanges
  FOR ALL
  USING (true)
  WITH CHECK (true);
