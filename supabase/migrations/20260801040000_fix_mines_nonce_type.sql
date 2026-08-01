-- Fix nonce column type from integer to bigint
ALTER TABLE public.mines_games 
ALTER COLUMN nonce TYPE bigint;
