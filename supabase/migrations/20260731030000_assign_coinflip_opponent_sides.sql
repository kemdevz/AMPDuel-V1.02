-- The opponent must always receive the opposite coin side from the creator.

UPDATE public.coinflip_games
SET creator_side = CASE
      WHEN lower(btrim(COALESCE(creator_side, ''))) = 'tails' THEN 'tails'
      ELSE 'heads'
    END,
    opponent_side = CASE
      WHEN lower(btrim(COALESCE(creator_side, ''))) = 'tails' THEN 'heads'
      ELSE 'tails'
    END;

CREATE OR REPLACE FUNCTION public.assign_coinflip_sides()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.creator_side := CASE
    WHEN lower(btrim(COALESCE(NEW.creator_side, ''))) = 'tails' THEN 'tails'
    ELSE 'heads'
  END;

  NEW.opponent_side := CASE
    WHEN NEW.creator_side = 'heads' THEN 'tails'
    ELSE 'heads'
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS coinflip_games_assign_sides
  ON public.coinflip_games;

CREATE TRIGGER coinflip_games_assign_sides
BEFORE INSERT OR UPDATE OF creator_side, opponent_side
ON public.coinflip_games
FOR EACH ROW
EXECUTE FUNCTION public.assign_coinflip_sides();

ALTER TABLE public.coinflip_games
  ALTER COLUMN creator_side SET DEFAULT 'heads',
  ALTER COLUMN creator_side SET NOT NULL,
  ALTER COLUMN opponent_side SET NOT NULL;

ALTER TABLE public.coinflip_games
  DROP CONSTRAINT IF EXISTS coinflip_games_creator_side_check,
  DROP CONSTRAINT IF EXISTS coinflip_games_opponent_side_check,
  DROP CONSTRAINT IF EXISTS coinflip_games_sides_differ_check;

ALTER TABLE public.coinflip_games
  ADD CONSTRAINT coinflip_games_creator_side_check
    CHECK (creator_side IN ('heads', 'tails')),
  ADD CONSTRAINT coinflip_games_opponent_side_check
    CHECK (opponent_side IN ('heads', 'tails')),
  ADD CONSTRAINT coinflip_games_sides_differ_check
    CHECK (creator_side <> opponent_side);

REVOKE ALL ON FUNCTION public.assign_coinflip_sides()
  FROM PUBLIC, anon, authenticated;

