ALTER TABLE public.case_battle_games
  ADD COLUMN IF NOT EXISTS server_seed_hash text,
  ADD COLUMN IF NOT EXISTS server_seed text,
  ADD COLUMN IF NOT EXISTS client_seed text,
  ADD COLUMN IF NOT EXISTS nonce bigint NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.case_battle_fairness_secrets (
  battle_id uuid PRIMARY KEY REFERENCES public.case_battle_games(id) ON DELETE CASCADE,
  server_seed_encrypted text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.case_battle_fairness_secrets ENABLE ROW LEVEL SECURITY;

-- Active seeds must never be exposed through the public Supabase client.
REVOKE ALL ON TABLE public.case_battle_fairness_secrets FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.case_battle_fairness_secrets TO service_role;

COMMENT ON COLUMN public.case_battle_games.server_seed_hash IS
  'SHA-256 commitment published when the battle is created.';
COMMENT ON COLUMN public.case_battle_games.server_seed IS
  'Plain server seed revealed only after the battle is resolved.';
COMMENT ON TABLE public.case_battle_fairness_secrets IS
  'Private encrypted active Case Battle seeds. This table is service-role only.';
