-- Coinflip profile totals are monetary values, so use bigint to prevent
-- long-running accounts from overflowing the original integer columns.
ALTER TABLE public.user_profiles
  ALTER COLUMN played TYPE bigint USING COALESCE(played, 0)::bigint,
  ALTER COLUMN won TYPE bigint USING COALESCE(won, 0)::bigint,
  ALTER COLUMN lost TYPE bigint USING COALESCE(lost, 0)::bigint;

UPDATE public.user_profiles
SET played = COALESCE(played, 0),
    won = COALESCE(won, 0),
    lost = COALESCE(lost, 0)
WHERE played IS NULL OR won IS NULL OR lost IS NULL;

ALTER TABLE public.user_profiles
  ALTER COLUMN played SET DEFAULT 0,
  ALTER COLUMN played SET NOT NULL,
  ALTER COLUMN won SET DEFAULT 0,
  ALTER COLUMN won SET NOT NULL,
  ALTER COLUMN lost SET DEFAULT 0,
  ALTER COLUMN lost SET NOT NULL;

CREATE OR REPLACE FUNCTION public.update_resolved_coinflip_profile_stats()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  creator_wager bigint;
  opponent_wager bigint;
  updated_profiles integer;
BEGIN
  IF NEW.result IS NULL OR OLD.result IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NULLIF(NEW.creator_uuid, '') IS NULL
     OR NULLIF(NEW.opponent_uuid, '') IS NULL
     OR NEW.creator_uuid = NEW.opponent_uuid
     OR NULLIF(NEW.winner_uuid, '') IS NULL
     OR NEW.winner_uuid NOT IN (NEW.creator_uuid, NEW.opponent_uuid) THEN
    RAISE EXCEPTION 'Invalid resolved coinflip participants or winner';
  END IF;

  SELECT COALESCE(sum(
    CASE
      WHEN COALESCE(item->>'value', '') ~ '^[0-9]+$' THEN (item->>'value')::bigint
      ELSE 0
    END
  ), 0)
  INTO creator_wager
  FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(NEW.creator_items) = 'array' THEN NEW.creator_items ELSE '[]'::jsonb END
  ) AS wager(item);

  SELECT COALESCE(sum(
    CASE
      WHEN COALESCE(item->>'value', '') ~ '^[0-9]+$' THEN (item->>'value')::bigint
      ELSE 0
    END
  ), 0)
  INTO opponent_wager
  FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(NEW.opponent_items) = 'array' THEN NEW.opponent_items ELSE '[]'::jsonb END
  ) AS wager(item);

  IF creator_wager <= 0 OR opponent_wager <= 0 THEN
    RAISE EXCEPTION 'Resolved coinflip wagers must have a positive value';
  END IF;

  UPDATE public.user_profiles AS profile
  SET played = profile.played + CASE
        WHEN profile.id::text = NEW.creator_uuid THEN creator_wager
        ELSE opponent_wager
      END,
      won = profile.won + CASE
        WHEN profile.id::text <> NEW.winner_uuid THEN 0
        WHEN NEW.winner_uuid = NEW.creator_uuid THEN opponent_wager
        ELSE creator_wager
      END,
      lost = profile.lost + CASE
        WHEN profile.id::text = NEW.winner_uuid THEN 0
        WHEN profile.id::text = NEW.creator_uuid THEN creator_wager
        ELSE opponent_wager
      END,
      updated_at = now()
  WHERE profile.id::text IN (NEW.creator_uuid, NEW.opponent_uuid);

  GET DIAGNOSTICS updated_profiles = ROW_COUNT;
  IF updated_profiles <> 2 THEN
    RAISE EXCEPTION 'Both coinflip participant profiles must exist';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_resolved_coinflip_profile_stats_trigger
  ON public.coinflip_games;

CREATE TRIGGER update_resolved_coinflip_profile_stats_trigger
AFTER UPDATE OF result ON public.coinflip_games
FOR EACH ROW
WHEN (NEW.result IS NOT NULL AND OLD.result IS NULL)
EXECUTE FUNCTION public.update_resolved_coinflip_profile_stats();

REVOKE ALL ON FUNCTION public.update_resolved_coinflip_profile_stats()
  FROM PUBLIC, anon, authenticated;
