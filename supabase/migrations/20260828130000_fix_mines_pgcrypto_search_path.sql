-- pgcrypto is installed in Supabase's `extensions` schema. The Mines turn RPC
-- originally restricted its search path to `public`, so every manual and
-- automatic move failed while resolving digest(text, text).
ALTER FUNCTION public.play_mines_turn(uuid, text, integer, boolean, text)
  SET search_path = public, extensions;

NOTIFY pgrst, 'reload schema';
