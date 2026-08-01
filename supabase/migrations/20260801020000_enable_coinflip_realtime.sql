-- Ensure coinflip inserts and updates reach every subscribed client in realtime.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication
    WHERE pubname = 'supabase_realtime'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'coinflip_games'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.coinflip_games;
  END IF;
END;
$$;
