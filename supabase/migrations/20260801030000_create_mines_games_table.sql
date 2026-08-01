-- Create mines_games table
CREATE TABLE IF NOT EXISTS public.mines_games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id text NOT NULL,
  username text,
  avatar_url text,
  wager_value numeric NOT NULL,
  mines_count integer NOT NULL DEFAULT 3,
  revealed_positions jsonb DEFAULT '[]'::jsonb,
  mine_positions jsonb NOT NULL,
  game_state text NOT NULL DEFAULT 'active', -- 'active', 'cashed_out', 'exploded'
  multiplier numeric NOT NULL DEFAULT 1.0,
  current_value numeric NOT NULL,
  cashed_out_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  server_seed_encrypted text,
  client_seed text,
  nonce bigint
);

CREATE INDEX IF NOT EXISTS mines_games_profile_id_idx ON public.mines_games (profile_id);
CREATE INDEX IF NOT EXISTS mines_games_created_at_idx ON public.mines_games (created_at DESC);

ALTER TABLE public.mines_games ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view mines_games" ON public.mines_games;
DROP POLICY IF EXISTS "Users can insert mines_games" ON public.mines_games;
DROP POLICY IF EXISTS "Users can update mines_games" ON public.mines_games;

CREATE POLICY "Users can view mines_games"
  ON public.mines_games
  FOR SELECT
  USING (true);

CREATE POLICY "Users can insert mines_games"
  ON public.mines_games
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update mines_games"
  ON public.mines_games
  FOR UPDATE
  USING (true)
  WITH CHECK (true);
