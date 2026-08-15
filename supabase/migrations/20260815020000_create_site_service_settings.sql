CREATE TABLE IF NOT EXISTS public.site_service_settings (
  service_key text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT true,
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT site_service_settings_key_check
    CHECK (service_key IN (
      'case_battles', 'cases', 'coinflip', 'upgrader', 'mines',
      'roll', 'blackjack', 'jackpot', 'chat', 'rain'
    ))
);

INSERT INTO public.site_service_settings (service_key, enabled)
VALUES
  ('case_battles', true),
  ('cases', true),
  ('coinflip', true),
  ('upgrader', true),
  ('mines', true),
  ('roll', true),
  ('blackjack', true),
  ('jackpot', true),
  ('chat', true),
  ('rain', true)
ON CONFLICT (service_key) DO NOTHING;

ALTER TABLE public.site_service_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.site_service_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.site_service_settings TO service_role;

COMMENT ON TABLE public.site_service_settings IS
  'Persistent admin switches used by the server to pause new gameplay and community actions.';
