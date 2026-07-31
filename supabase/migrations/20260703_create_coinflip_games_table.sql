-- Create coinflip_games table
CREATE TABLE IF NOT EXISTS public.coinflip_games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_uuid text NOT NULL,
  creator_username text,
  creator_side text,
  creator_items jsonb,
  opponent_uuid text,
  opponent_username text,
  opponent_side text,
  opponent_items jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  canceled boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS coinflip_games_creator_uuid_idx ON public.coinflip_games (creator_uuid);
CREATE INDEX IF NOT EXISTS coinflip_games_opponent_uuid_idx ON public.coinflip_games (opponent_uuid);

ALTER TABLE public.coinflip_games ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view coinflip_games" ON public.coinflip_games;
DROP POLICY IF EXISTS "Users can insert coinflip_games" ON public.coinflip_games;
DROP POLICY IF EXISTS "Users can update coinflip_games" ON public.coinflip_games;
DROP POLICY IF EXISTS "Users can delete coinflip_games" ON public.coinflip_games;

CREATE POLICY "Users can view coinflip_games"
  ON public.coinflip_games
  FOR SELECT
  USING (true);

CREATE POLICY "Users can insert coinflip_games"
  ON public.coinflip_games
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update coinflip_games"
  ON public.coinflip_games
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can delete coinflip_games"
  ON public.coinflip_games
  FOR DELETE
  USING (true);
