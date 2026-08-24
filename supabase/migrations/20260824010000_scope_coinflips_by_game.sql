ALTER TABLE public.coinflip_games
  ADD COLUMN IF NOT EXISTS game_mode text;

ALTER TABLE public.coinflip_games
  DROP CONSTRAINT IF EXISTS coinflip_games_game_mode_check;

ALTER TABLE public.coinflip_games
  ADD CONSTRAINT coinflip_games_game_mode_check
  CHECK (game_mode IS NULL OR game_mode IN (
    'mm2',
    'adm',
    'ps99',
    'gems_only',
    'titanics_only'
  ));

UPDATE public.coinflip_games
SET game_mode = CASE
  WHEN lower(COALESCE(creator_items -> 0 ->> 'type', creator_items -> 0 ->> 'game', creator_items -> 0 ->> 'item_type', '')) LIKE '%mm2%'
    OR lower(COALESCE(creator_items -> 0 ->> 'type', creator_items -> 0 ->> 'game', creator_items -> 0 ->> 'item_type', '')) LIKE '%murder%'
    THEN 'mm2'
  WHEN lower(COALESCE(creator_items -> 0 ->> 'type', creator_items -> 0 ->> 'game', creator_items -> 0 ->> 'item_type', '')) = 'adm'
    OR lower(COALESCE(creator_items -> 0 ->> 'type', creator_items -> 0 ->> 'game', creator_items -> 0 ->> 'item_type', '')) LIKE '%adopt%'
    THEN 'adm'
  WHEN lower(COALESCE(creator_items -> 0 ->> 'type', creator_items -> 0 ->> 'game', creator_items -> 0 ->> 'item_type', '')) LIKE '%ps99%'
    OR lower(COALESCE(creator_items -> 0 ->> 'type', creator_items -> 0 ->> 'game', creator_items -> 0 ->> 'item_type', '')) LIKE '%pet sim%'
    THEN 'ps99'
  ELSE game_mode
END
WHERE game_mode IS NULL
  AND jsonb_typeof(creator_items) = 'array'
  AND jsonb_array_length(creator_items) > 0;

CREATE INDEX IF NOT EXISTS coinflip_games_game_mode_resolved_idx
  ON public.coinflip_games (game_mode, resolved_at DESC)
  WHERE canceled = false AND result IS NOT NULL;

NOTIFY pgrst, 'reload schema';
