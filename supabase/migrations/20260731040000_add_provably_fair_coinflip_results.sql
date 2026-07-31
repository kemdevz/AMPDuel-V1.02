CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Commit to a secret seed when a game is created, then reveal it when the
-- opponent joins. The HMAC roll and participant winner are stored for audit.
ALTER TABLE public.coinflip_games
  ADD COLUMN IF NOT EXISTS server_seed_hash text,
  ADD COLUMN IF NOT EXISTS server_seed_encrypted text,
  ADD COLUMN IF NOT EXISTS server_seed text,
  ADD COLUMN IF NOT EXISTS client_seed text,
  ADD COLUMN IF NOT EXISTS nonce integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS result_roll double precision,
  ADD COLUMN IF NOT EXISTS winner_uuid text,
  ADD COLUMN IF NOT EXISTS winner_username text,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

ALTER TABLE public.coinflip_games
  DROP CONSTRAINT IF EXISTS coinflip_games_result_check,
  DROP CONSTRAINT IF EXISTS coinflip_games_result_roll_check;

ALTER TABLE public.coinflip_games
  ADD CONSTRAINT coinflip_games_result_check
    CHECK (result IS NULL OR result IN ('heads', 'tails')),
  ADD CONSTRAINT coinflip_games_result_roll_check
    CHECK (result_roll IS NULL OR (result_roll >= 0 AND result_roll < 1));

CREATE INDEX IF NOT EXISTS coinflip_games_winner_uuid_idx
  ON public.coinflip_games (winner_uuid);

-- Keep pre-migration open games joinable. Their generated seed and commitment
-- are written together; all games created after this migration keep the seed
-- encrypted until resolution.
WITH legacy_seeds AS (
  SELECT id, encode(gen_random_bytes(32), 'hex') AS seed
  FROM public.coinflip_games
  WHERE result IS NULL
    AND canceled = false
    AND server_seed_hash IS NULL
)
UPDATE public.coinflip_games AS game
SET server_seed = legacy.seed,
    server_seed_hash = encode(digest(legacy.seed, 'sha256'), 'hex'),
    client_seed = encode(gen_random_bytes(16), 'hex')
FROM legacy_seeds AS legacy
WHERE game.id = legacy.id;
