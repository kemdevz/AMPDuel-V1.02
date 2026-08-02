-- Server-authoritative game XP. One wagered coin awards one XP, with no cap.
-- Every award is written to an immutable, uniquely-keyed ledger first so a
-- retried settlement can never award the same game's XP twice.

ALTER TABLE public.user_profiles
  ALTER COLUMN level SET DEFAULT 0,
  ALTER COLUMN xp TYPE bigint USING GREATEST(COALESCE(xp, 0), 0)::bigint,
  ALTER COLUMN xp SET DEFAULT 0,
  ALTER COLUMN xp SET NOT NULL,
  ADD COLUMN IF NOT EXISTS lifetime_xp bigint NOT NULL DEFAULT 0;

ALTER TABLE public.user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_level_within_range;
ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_level_within_range
  CHECK (level BETWEEN 0 AND max_level);

CREATE OR REPLACE FUNCTION public.enforce_user_profile_max_level()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.max_level := 200;
  NEW.level := LEAST(GREATEST(COALESCE(NEW.level, 0), 0), NEW.max_level);
  NEW.xp := GREATEST(COALESCE(NEW.xp, 0), 0);
  NEW.lifetime_xp := GREATEST(COALESCE(NEW.lifetime_xp, 0), 0);

  IF NEW.level >= NEW.max_level
     AND LOWER(COALESCE(NEW.role, 'user')) IN ('user', 'vip') THEN
    NEW.role := 'VIP';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.profile_xp_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id text NOT NULL,
  game_type text NOT NULL,
  game_id text NOT NULL,
  wager_amount bigint NOT NULL CHECK (wager_amount > 0),
  xp_awarded bigint NOT NULL CHECK (xp_awarded = wager_amount),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profile_xp_events_game_type_check
    CHECK (game_type IN ('case', 'coinflip', 'mines', 'roll')),
  CONSTRAINT profile_xp_events_unique_game_award
    UNIQUE (profile_id, game_type, game_id)
);

CREATE INDEX IF NOT EXISTS profile_xp_events_profile_created_idx
  ON public.profile_xp_events (profile_id, created_at DESC);

ALTER TABLE public.profile_xp_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.profile_xp_events FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.profile_xp_events TO service_role;

CREATE OR REPLACE FUNCTION public.profile_xp_required_for_level(p_level integer)
RETURNS bigint
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  -- Calibrated so all 200 thresholds total approximately 6.4 trillion XP.
  -- Each level requires 4% more XP than the preceding level.
  SELECT round(
    100402008.42216134::numeric
    * power(1.04::numeric, LEAST(GREATEST(p_level, 0), 199))
  )::bigint;
$$;

CREATE OR REPLACE FUNCTION public.award_profile_game_xp(
  p_profile_id text,
  p_game_type text,
  p_game_id text,
  p_wager_amount bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_profile public.user_profiles%ROWTYPE;
  inserted_event_id uuid;
  next_level integer;
  next_xp bigint;
  next_lifetime_xp bigint;
  required_xp bigint;
BEGIN
  IF NULLIF(trim(p_profile_id), '') IS NULL
     OR NULLIF(trim(p_game_id), '') IS NULL
     OR p_game_type NOT IN ('case', 'coinflip', 'mines', 'roll')
     OR p_wager_amount IS NULL
     OR p_wager_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid game XP award.';
  END IF;

  INSERT INTO public.profile_xp_events (
    profile_id, game_type, game_id, wager_amount, xp_awarded
  )
  VALUES (
    p_profile_id, p_game_type, p_game_id, p_wager_amount, p_wager_amount
  )
  ON CONFLICT (profile_id, game_type, game_id) DO NOTHING
  RETURNING id INTO inserted_event_id;

  SELECT * INTO selected_profile
  FROM public.user_profiles
  WHERE id::text = p_profile_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The XP profile could not be found.';
  END IF;

  IF inserted_event_id IS NULL THEN
    RETURN jsonb_build_object(
      'awarded', false,
      'level', selected_profile.level,
      'xp', selected_profile.xp,
      'lifetime_xp', selected_profile.lifetime_xp
    );
  END IF;

  next_level := LEAST(GREATEST(COALESCE(selected_profile.level, 0), 0), 200);
  next_xp := GREATEST(COALESCE(selected_profile.xp, 0), 0) + p_wager_amount;
  next_lifetime_xp := GREATEST(COALESCE(selected_profile.lifetime_xp, 0), 0) + p_wager_amount;

  WHILE next_level < 200 LOOP
    required_xp := public.profile_xp_required_for_level(next_level);
    EXIT WHEN next_xp < required_xp;
    next_xp := next_xp - required_xp;
    next_level := next_level + 1;
  END LOOP;

  IF next_level >= 200 THEN
    next_level := 200;
    next_xp := 0;
  END IF;

  UPDATE public.user_profiles
  SET level = next_level,
      xp = next_xp,
      lifetime_xp = next_lifetime_xp,
      updated_at = now()
  WHERE id::text = p_profile_id
  RETURNING * INTO selected_profile;

  RETURN jsonb_build_object(
    'awarded', true,
    'xp_awarded', p_wager_amount,
    'level', selected_profile.level,
    'xp', selected_profile.xp,
    'lifetime_xp', selected_profile.lifetime_xp
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.award_case_opening_xp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.case_price > 0 THEN
    PERFORM public.award_profile_game_xp(
      NEW.user_id::text,
      'case',
      NEW.id::text,
      floor(NEW.case_price)::bigint
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS award_case_opening_xp_trigger ON public.case_openings;
CREATE TRIGGER award_case_opening_xp_trigger
AFTER INSERT ON public.case_openings
FOR EACH ROW EXECUTE FUNCTION public.award_case_opening_xp();

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

  SELECT COALESCE(sum(
    CASE WHEN COALESCE(item->>'value', '') ~ '^[0-9]+$'
      THEN (item->>'value')::bigint ELSE 0 END
  ), 0)
  INTO creator_wager
  FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(NEW.creator_items) = 'array' THEN NEW.creator_items ELSE '[]'::jsonb END
  ) AS wager(item);

  SELECT COALESCE(sum(
    CASE WHEN COALESCE(item->>'value', '') ~ '^[0-9]+$'
      THEN (item->>'value')::bigint ELSE 0 END
  ), 0)
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

DROP TRIGGER IF EXISTS award_resolved_coinflip_xp_trigger ON public.coinflip_games;
CREATE TRIGGER award_resolved_coinflip_xp_trigger
AFTER UPDATE OF result ON public.coinflip_games
FOR EACH ROW
WHEN (NEW.result IS NOT NULL AND OLD.result IS NULL)
EXECUTE FUNCTION public.award_resolved_coinflip_xp();

CREATE OR REPLACE FUNCTION public.award_completed_mines_xp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.award_profile_game_xp(
    NEW.profile_id,
    'mines',
    NEW.id::text,
    GREATEST(floor(NEW.wager_value), 0)::bigint
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS award_completed_mines_xp_trigger ON public.mines_games;
CREATE TRIGGER award_completed_mines_xp_trigger
AFTER UPDATE OF game_state ON public.mines_games
FOR EACH ROW
WHEN (OLD.game_state = 'active' AND NEW.game_state IN ('cashed_out', 'exploded'))
EXECUTE FUNCTION public.award_completed_mines_xp();

-- Mines state is balance-bearing and must not be writable with the browser's
-- public key; otherwise a client could forge a settled game and its XP award.
DROP POLICY IF EXISTS "Users can insert mines_games" ON public.mines_games;
DROP POLICY IF EXISTS "Users can update mines_games" ON public.mines_games;
REVOKE INSERT, UPDATE, DELETE ON public.mines_games FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.mines_games TO service_role;

CREATE OR REPLACE FUNCTION public.award_settled_roll_xp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.award_profile_game_xp(
    NEW.profile_id::text,
    'roll',
    NEW.id::text,
    NEW.wager_amount
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS award_settled_roll_xp_trigger ON public.roll_bets;
CREATE TRIGGER award_settled_roll_xp_trigger
AFTER UPDATE OF outcome ON public.roll_bets
FOR EACH ROW
WHEN (OLD.outcome = 'pending' AND NEW.outcome IN ('won', 'lost'))
EXECUTE FUNCTION public.award_settled_roll_xp();

REVOKE ALL ON FUNCTION public.profile_xp_required_for_level(integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.award_profile_game_xp(text, text, text, bigint)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.award_case_opening_xp()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.award_resolved_coinflip_xp()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.award_completed_mines_xp()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.award_settled_roll_xp()
  FROM PUBLIC, anon, authenticated;
