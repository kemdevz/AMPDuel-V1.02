CREATE TABLE IF NOT EXISTS public.user_sessions (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  ip_address text,
  ip_addresses text[] NOT NULL DEFAULT ARRAY[]::text[],
  user_agent text,
  location text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  first_login_at timestamptz NOT NULL DEFAULT now(),
  last_active_at timestamptz NOT NULL DEFAULT now(),
  is_current boolean NOT NULL DEFAULT true,
  "current" boolean NOT NULL DEFAULT true
);

ALTER TABLE public.user_sessions
  ADD COLUMN IF NOT EXISTS ip_address text,
  ADD COLUMN IF NOT EXISTS ip_addresses text[] DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS user_agent text,
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS first_login_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_active_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS is_current boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS "current" boolean DEFAULT true;

UPDATE public.user_sessions
SET
  ip_addresses = COALESCE(ip_addresses, ARRAY[]::text[]),
  created_at = COALESCE(created_at, now()),
  updated_at = COALESCE(updated_at, created_at, now()),
  last_seen_at = COALESCE(last_seen_at, updated_at, created_at, now()),
  first_login_at = COALESCE(first_login_at, created_at, now()),
  last_active_at = COALESCE(last_active_at, last_seen_at, updated_at, now()),
  is_current = COALESCE(is_current, true),
  "current" = COALESCE("current", is_current, true);

ALTER TABLE public.user_sessions
  ALTER COLUMN ip_addresses SET DEFAULT ARRAY[]::text[],
  ALTER COLUMN ip_addresses SET NOT NULL,
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL,
  ALTER COLUMN last_seen_at SET DEFAULT now(),
  ALTER COLUMN last_seen_at SET NOT NULL,
  ALTER COLUMN first_login_at SET DEFAULT now(),
  ALTER COLUMN first_login_at SET NOT NULL,
  ALTER COLUMN last_active_at SET DEFAULT now(),
  ALTER COLUMN last_active_at SET NOT NULL,
  ALTER COLUMN is_current SET DEFAULT true,
  ALTER COLUMN is_current SET NOT NULL,
  ALTER COLUMN "current" SET DEFAULT true,
  ALTER COLUMN "current" SET NOT NULL;

CREATE INDEX IF NOT EXISTS user_sessions_user_id_idx
  ON public.user_sessions (user_id);

CREATE INDEX IF NOT EXISTS user_sessions_last_active_at_idx
  ON public.user_sessions (last_active_at DESC);

CREATE OR REPLACE FUNCTION public.preserve_user_session_first_login()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.created_at := OLD.created_at;
  NEW.first_login_at := OLD.first_login_at;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS preserve_user_session_first_login_trigger
  ON public.user_sessions;

CREATE TRIGGER preserve_user_session_first_login_trigger
BEFORE UPDATE
ON public.user_sessions
FOR EACH ROW
EXECUTE FUNCTION public.preserve_user_session_first_login();

ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read/write user_sessions"
  ON public.user_sessions;

CREATE POLICY "Allow public read/write user_sessions"
  ON public.user_sessions
  FOR ALL
  USING (true)
  WITH CHECK (true);
