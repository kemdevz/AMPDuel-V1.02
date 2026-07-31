ALTER TABLE public.rain_state
  ADD COLUMN IF NOT EXISTS remaining_seconds integer DEFAULT 1800;

ALTER TABLE public.rain_state
  ADD COLUMN IF NOT EXISTS pool_amount integer DEFAULT 10000;

CREATE TABLE IF NOT EXISTS public.rain_events (
  id text PRIMARY KEY,
  event_type text NOT NULL DEFAULT 'rain_tip',
  username text NOT NULL DEFAULT 'Guest',
  amount integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rain_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read/write rain_events" ON public.rain_events;

CREATE POLICY "Allow public read/write rain_events"
  ON public.rain_events
  FOR ALL
  USING (true)
  WITH CHECK (true);
