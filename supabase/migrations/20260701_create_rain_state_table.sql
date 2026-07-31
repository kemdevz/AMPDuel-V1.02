CREATE TABLE IF NOT EXISTS public.rain_state (
  id text PRIMARY KEY,
  remaining_seconds integer NOT NULL DEFAULT 1800,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rain_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read/write rain_state" ON public.rain_state;

CREATE POLICY "Allow public read/write rain_state"
  ON public.rain_state
  FOR ALL
  USING (true)
  WITH CHECK (true);
