ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS pearls integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS summer_tickets integer DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.summer_event (
  id text PRIMARY KEY,
  ends_at timestamptz NOT NULL DEFAULT now() + interval '10 days',
  total_tickets integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.summer_event ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read/write summer_event" ON public.summer_event;

CREATE POLICY "Allow public read/write summer_event"
  ON public.summer_event
  FOR ALL
  USING (true)
  WITH CHECK (true);

ALTER TABLE public.summer_event
  ADD COLUMN IF NOT EXISTS ends_at timestamptz NOT NULL DEFAULT now() + interval '10 days';

ALTER TABLE public.summer_event
  DROP COLUMN IF EXISTS ends_in;

INSERT INTO public.summer_event (id, total_tickets, ends_at)
VALUES ('summer_event_main', 0, now() + interval '10 days')
ON CONFLICT (id) DO NOTHING;
