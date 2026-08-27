-- Coinflip item values use numeric(20, 4), but the original XP trigger only
-- parsed integer JSON text. A decimal wager therefore became zero and caused
-- the entire resolved Coinflip update to roll back with "Invalid game XP
-- award." Sum valid decimal values first, then round the final XP award up to
-- the bigint unit used by profile progression. This preserves exact integer
-- wagers and guarantees any positive fractional wager awards at least one XP.
CREATE OR REPLACE FUNCTION public.award_resolved_coinflip_xp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  creator_wager bigint;
  opponent_wager bigint;
BEGIN
  IF NEW.result IS NULL OR OLD.result IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT CEIL(COALESCE(sum(
    CASE WHEN COALESCE(item->>'value', '') ~ '^[0-9]+(\.[0-9]{1,4})?$'
      THEN (item->>'value')::numeric ELSE 0 END
  ), 0))::bigint
  INTO creator_wager
  FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(NEW.creator_items) = 'array' THEN NEW.creator_items ELSE '[]'::jsonb END
  ) AS wager(item);

  SELECT CEIL(COALESCE(sum(
    CASE WHEN COALESCE(item->>'value', '') ~ '^[0-9]+(\.[0-9]{1,4})?$'
      THEN (item->>'value')::numeric ELSE 0 END
  ), 0))::bigint
  INTO opponent_wager
  FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(NEW.opponent_items) = 'array' THEN NEW.opponent_items ELSE '[]'::jsonb END
  ) AS wager(item);

  PERFORM public.award_profile_game_xp(
    NEW.creator_uuid,
    'coinflip',
    NEW.id::text,
    creator_wager
  );
  PERFORM public.award_profile_game_xp(
    NEW.opponent_uuid,
    'coinflip',
    NEW.id::text,
    opponent_wager
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.award_resolved_coinflip_xp()
  FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
