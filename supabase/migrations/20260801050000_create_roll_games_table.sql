CREATE TABLE IF NOT EXISTS public.roll_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id text NOT NULL,
  username text,
  avatar_url text,
  server_seed_encrypted text,
  client_seed text,
  nonce integer NOT NULL,
  result_multiplier numeric NOT NULL,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  game_state text NOT NULL DEFAULT 'countdown',
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  ended_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.roll_bets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES public.roll_rounds(id) ON DELETE CASCADE,
  profile_id text NOT NULL,
  username text,
  avatar_url text,
  bet_amount integer NOT NULL,
  chosen_multiplier numeric NOT NULL,
  potential_win integer NOT NULL,
  won boolean DEFAULT false,
  actual_win integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS roll_rounds_profile_id_idx ON public.roll_rounds (profile_id);
CREATE INDEX IF NOT EXISTS roll_rounds_game_state_idx ON public.roll_rounds (game_state);
CREATE INDEX IF NOT EXISTS roll_rounds_created_at_idx ON public.roll_rounds (created_at DESC);
CREATE INDEX IF NOT EXISTS roll_bets_round_id_idx ON public.roll_bets (round_id);
CREATE INDEX IF NOT EXISTS roll_bets_profile_id_idx ON public.roll_bets (profile_id);

ALTER TABLE public.roll_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roll_bets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view roll_rounds" ON public.roll_rounds;
DROP POLICY IF EXISTS "Users can insert roll_rounds" ON public.roll_rounds;
DROP POLICY IF EXISTS "Users can update roll_rounds" ON public.roll_rounds;

CREATE POLICY "Users can view roll_rounds"
  ON public.roll_rounds
  FOR SELECT
  USING (true);

CREATE POLICY "Users can insert roll_rounds"
  ON public.roll_rounds
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update roll_rounds"
  ON public.roll_rounds
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Users can view roll_bets" ON public.roll_bets;
DROP POLICY IF EXISTS "Users can insert roll_bets" ON public.roll_bets;
DROP POLICY IF EXISTS "Users can update roll_bets" ON public.roll_bets;

CREATE POLICY "Users can view roll_bets"
  ON public.roll_bets
  FOR SELECT
  USING (true);

CREATE POLICY "Users can insert roll_bets"
  ON public.roll_bets
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update roll_bets"
  ON public.roll_bets
  FOR UPDATE
  USING (true)
  WITH CHECK (true);
