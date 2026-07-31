CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.giveaways (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  user_name text,
  status text NOT NULL DEFAULT 'active',
  level_requirement integer NOT NULL DEFAULT 0,
  duration_minutes integer NOT NULL DEFAULT 15,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz
);

ALTER TABLE public.giveaways
  ADD COLUMN IF NOT EXISTS user_id text;

ALTER TABLE public.giveaways
  ADD COLUMN IF NOT EXISTS user_name text;

ALTER TABLE public.giveaways
  ADD COLUMN IF NOT EXISTS status text;

ALTER TABLE public.giveaways
  ADD COLUMN IF NOT EXISTS level_requirement integer;

ALTER TABLE public.giveaways
  ADD COLUMN IF NOT EXISTS duration_minutes integer;

ALTER TABLE public.giveaways
  ADD COLUMN IF NOT EXISTS items jsonb;

ALTER TABLE public.giveaways
  ADD COLUMN IF NOT EXISTS created_at timestamptz;

ALTER TABLE public.giveaways
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

ALTER TABLE public.giveaways
  ADD COLUMN IF NOT EXISTS ends_at timestamptz;

ALTER TABLE public.giveaways
  ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE public.giveaways
  ALTER COLUMN status SET DEFAULT 'active';

ALTER TABLE public.giveaways
  ALTER COLUMN level_requirement SET DEFAULT 0;

ALTER TABLE public.giveaways
  ALTER COLUMN duration_minutes SET DEFAULT 15;

ALTER TABLE public.giveaways
  ALTER COLUMN items SET DEFAULT '[]'::jsonb;

ALTER TABLE public.giveaways
  ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE public.giveaways
  ALTER COLUMN updated_at SET DEFAULT now();

CREATE INDEX IF NOT EXISTS giveaways_user_id_idx ON public.giveaways (user_id);
CREATE INDEX IF NOT EXISTS giveaways_status_idx ON public.giveaways (status);
CREATE INDEX IF NOT EXISTS giveaways_ends_at_idx ON public.giveaways (ends_at);

ALTER TABLE public.giveaways ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view giveaways" ON public.giveaways;
DROP POLICY IF EXISTS "Users can insert giveaways" ON public.giveaways;
DROP POLICY IF EXISTS "Users can update giveaways" ON public.giveaways;
DROP POLICY IF EXISTS "Users can delete giveaways" ON public.giveaways;

CREATE POLICY "Users can view giveaways"
  ON public.giveaways
  FOR SELECT
  USING (true);

CREATE POLICY "Users can insert giveaways"
  ON public.giveaways
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update giveaways"
  ON public.giveaways
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can delete giveaways"
  ON public.giveaways
  FOR DELETE
  USING (true);
