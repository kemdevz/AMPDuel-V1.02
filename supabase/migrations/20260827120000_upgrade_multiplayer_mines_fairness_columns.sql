-- The multiplayer Mines migration originally used CREATE TABLE IF NOT EXISTS.
-- Existing installations could therefore keep the older mines_games shape while
-- receiving the newer RPC, causing every create to fail when the RPC inserted
-- the fairness fields. Upgrade those installations in place.

ALTER TABLE public.mines_games
  ADD COLUMN IF NOT EXISTS server_seed_hash text,
  ADD COLUMN IF NOT EXISTS server_seed_encrypted text,
  ADD COLUMN IF NOT EXISTS server_seed text,
  ADD COLUMN IF NOT EXISTS client_seed text;

-- Preserve any legacy rows without pretending their old games have a verifiable
-- seed. New games always receive real values from the application server.
UPDATE public.mines_games
SET
  server_seed_hash = coalesce(server_seed_hash, 'legacy-' || id::text),
  server_seed_encrypted = coalesce(server_seed_encrypted, 'legacy'),
  client_seed = coalesce(client_seed, 'legacy-' || id::text)
WHERE server_seed_hash IS NULL
   OR server_seed_encrypted IS NULL
   OR client_seed IS NULL;

ALTER TABLE public.mines_games
  ALTER COLUMN server_seed_hash SET NOT NULL,
  ALTER COLUMN server_seed_encrypted SET NOT NULL,
  ALTER COLUMN client_seed SET NOT NULL;

NOTIFY pgrst, 'reload schema';
