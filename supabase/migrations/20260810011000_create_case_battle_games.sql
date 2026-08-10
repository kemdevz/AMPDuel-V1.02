CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.case_battle_games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key uuid NOT NULL UNIQUE,

  -- Stored as text intentionally so this migration works with both historical
  -- text IDs and current UUID IDs in user_profiles.
  creator_profile_id text NOT NULL,
  creator_username text NOT NULL,
  creator_avatar_url text,

  player_option text NOT NULL
    CHECK (player_option IN ('ffa-2', 'ffa-3', 'ffa-4', 'team-4', 'group-2', 'group-3', 'group-4')),
  max_players smallint NOT NULL CHECK (max_players BETWEEN 2 AND 4),
  modes text[] NOT NULL DEFAULT ARRAY['normal']::text[]
    CHECK (cardinality(modes) BETWEEN 1 AND 3),
  gold_spin boolean NOT NULL DEFAULT true,

  cases jsonb NOT NULL
    CHECK (jsonb_typeof(cases) = 'array' AND jsonb_array_length(cases) BETWEEN 1 AND 25),
  case_count smallint NOT NULL CHECK (case_count BETWEEN 1 AND 25),
  cost_per_player bigint NOT NULL CHECK (cost_per_player >= 0),

  players jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(players) = 'array'),
  player_count smallint NOT NULL DEFAULT 1 CHECK (player_count BETWEEN 1 AND 4),
  results jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(results) = 'array'),

  server_seed_hash text NOT NULL,
  server_seed text,
  client_seed text NOT NULL,
  nonce bigint NOT NULL DEFAULT 0 CHECK (nonce >= 0),

  status text NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'ready', 'active', 'resolved', 'cancelled')),
  current_round smallint NOT NULL DEFAULT 0 CHECK (current_round >= 0),
  winner_profile_id text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  resolved_at timestamptz,
  cancelled_at timestamptz,

  CONSTRAINT case_battle_games_case_count_matches CHECK (case_count = jsonb_array_length(cases)),
  CONSTRAINT case_battle_games_player_count_matches CHECK (player_count = jsonb_array_length(players)),
  CONSTRAINT case_battle_games_player_capacity CHECK (player_count <= max_players)
);

CREATE INDEX IF NOT EXISTS case_battle_games_status_created_idx
  ON public.case_battle_games (status, created_at DESC);
CREATE INDEX IF NOT EXISTS case_battle_games_creator_created_idx
  ON public.case_battle_games (creator_profile_id, created_at DESC);

ALTER TABLE public.case_battle_games ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Case Battle games are publicly readable" ON public.case_battle_games;
CREATE POLICY "Case Battle games are publicly readable"
  ON public.case_battle_games
  FOR SELECT
  TO anon, authenticated
  USING (true);

REVOKE INSERT, UPDATE, DELETE ON TABLE public.case_battle_games FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.case_battle_games TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.case_battle_games TO service_role;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'case_battle_games'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.case_battle_games;
  END IF;
END;
$$;

COMMENT ON TABLE public.case_battle_games IS
  'Persistent Case Battle lobby and game records. Resolution and settlement fields are reserved for the server-authoritative game-flow phase.';
COMMENT ON COLUMN public.case_battle_games.cases IS
  'Immutable case snapshots, including item/drop data, captured when the battle is created.';
COMMENT ON COLUMN public.case_battle_games.players IS
  'Ordered user and bot participant snapshots with stable slot indexes.';
