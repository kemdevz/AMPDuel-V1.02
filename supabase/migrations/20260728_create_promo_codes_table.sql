CREATE TABLE IF NOT EXISTS public.promo_codes (
  promocode_uuid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promocode_name text NOT NULL UNIQUE,
  item_id uuid NOT NULL REFERENCES public.items(id) ON DELETE RESTRICT,
  uses integer NOT NULL DEFAULT 1,
  level_requirement integer NOT NULL DEFAULT 1,
  redeemed text[] NOT NULL DEFAULT ARRAY[]::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.promo_codes
  ALTER COLUMN redeemed SET DEFAULT ARRAY[]::text[];

CREATE INDEX IF NOT EXISTS promo_codes_item_id_idx ON public.promo_codes (item_id);
CREATE INDEX IF NOT EXISTS promo_codes_promocode_name_idx ON public.promo_codes (promocode_name);

ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view promo codes" ON public.promo_codes;
DROP POLICY IF EXISTS "Users can redeem promo codes" ON public.promo_codes;

CREATE POLICY "Users can view promo codes"
  ON public.promo_codes
  FOR SELECT
  USING (true);

CREATE POLICY "Users can redeem promo codes"
  ON public.promo_codes
  FOR UPDATE
  USING (true)
  WITH CHECK (true);
