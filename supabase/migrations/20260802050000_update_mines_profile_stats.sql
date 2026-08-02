-- Record every completed Mines wager exactly once using the same monetary
-- definitions as Cases, Coinflip, and Roll:
--   played = wager
--   won    = net profit
--   lost   = net loss

ALTER TABLE public.mines_games
  ADD COLUMN IF NOT EXISTS stats_recorded_at timestamptz;

-- Mines did not previously update profile totals, so completed rows without a
-- marker are safe to backfill. The marker makes this migration idempotent.
WITH pending_totals AS (
  SELECT
    profile_id,
    COALESCE(sum(floor(wager_value)), 0)::bigint AS played_amount,
    COALESCE(sum(
      CASE WHEN game_state = 'cashed_out'
        THEN GREATEST(floor(current_value) - floor(wager_value), 0)
        ELSE 0
      END
    ), 0)::bigint AS won_amount,
    COALESCE(sum(
      CASE WHEN game_state = 'exploded'
        THEN floor(wager_value)
        ELSE GREATEST(floor(wager_value) - floor(current_value), 0)
      END
    ), 0)::bigint AS lost_amount
  FROM public.mines_games
  WHERE game_state IN ('cashed_out', 'exploded')
    AND stats_recorded_at IS NULL
  GROUP BY profile_id
)
UPDATE public.user_profiles AS profile
SET played = COALESCE(profile.played, 0) + pending.played_amount,
    won = COALESCE(profile.won, 0) + pending.won_amount,
    lost = COALESCE(profile.lost, 0) + pending.lost_amount,
    updated_at = now()
FROM pending_totals AS pending
WHERE profile.id::text = pending.profile_id;

UPDATE public.mines_games
SET stats_recorded_at = now()
WHERE game_state IN ('cashed_out', 'exploded')
  AND stats_recorded_at IS NULL;

CREATE OR REPLACE FUNCTION public.update_mines_profile_stats()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  wager_amount bigint;
  payout_amount bigint;
  updated_profiles integer;
BEGIN
  IF OLD.game_state <> 'active'
     OR NEW.game_state NOT IN ('cashed_out', 'exploded')
     OR OLD.stats_recorded_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  wager_amount := GREATEST(floor(NEW.wager_value), 0)::bigint;
  payout_amount := CASE
    WHEN NEW.game_state = 'cashed_out' THEN GREATEST(floor(NEW.current_value), 0)::bigint
    ELSE 0
  END;

  UPDATE public.user_profiles AS profile
  SET played = COALESCE(profile.played, 0) + wager_amount,
      won = COALESCE(profile.won, 0) + GREATEST(payout_amount - wager_amount, 0),
      lost = COALESCE(profile.lost, 0) + GREATEST(wager_amount - payout_amount, 0),
      updated_at = now()
  WHERE profile.id::text = NEW.profile_id;

  GET DIAGNOSTICS updated_profiles = ROW_COUNT;
  IF updated_profiles <> 1 THEN
    RAISE EXCEPTION 'The Mines profile could not be updated.';
  END IF;

  NEW.stats_recorded_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_mines_profile_stats_trigger
  ON public.mines_games;

CREATE TRIGGER update_mines_profile_stats_trigger
BEFORE UPDATE OF game_state ON public.mines_games
FOR EACH ROW
WHEN (OLD.game_state = 'active' AND NEW.game_state IN ('cashed_out', 'exploded'))
EXECUTE FUNCTION public.update_mines_profile_stats();

REVOKE ALL ON FUNCTION public.update_mines_profile_stats()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.cashout_mines_game(
  p_profile_id text,
  p_game_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_game public.mines_games%ROWTYPE;
  selected_profile public.user_profiles%ROWTYPE;
  payout_amount bigint;
BEGIN
  SELECT * INTO selected_game
  FROM public.mines_games
  WHERE id = p_game_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mines game not found.';
  END IF;
  IF selected_game.profile_id <> p_profile_id THEN
    RAISE EXCEPTION 'You can only cash out your own games.';
  END IF;
  IF selected_game.game_state <> 'active' THEN
    RAISE EXCEPTION 'Game is not active.';
  END IF;
  IF jsonb_array_length(COALESCE(selected_game.revealed_positions, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'Reveal at least one position before cashing out.';
  END IF;

  SELECT * INTO selected_profile
  FROM public.user_profiles
  WHERE id::text = p_profile_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found.';
  END IF;

  payout_amount := GREATEST(floor(selected_game.current_value), 0)::bigint;

  -- The BEFORE trigger above records played/won/lost during this update.
  UPDATE public.mines_games
  SET game_state = 'cashed_out',
      cashed_out_at = now()
  WHERE id = selected_game.id
  RETURNING * INTO selected_game;

  UPDATE public.user_profiles
  SET balance = COALESCE(balance, 0) + payout_amount,
      updated_at = now()
  WHERE id::text = p_profile_id
  RETURNING * INTO selected_profile;

  RETURN jsonb_build_object(
    'game', to_jsonb(selected_game),
    'winnings', payout_amount,
    'balance', selected_profile.balance,
    'stats', jsonb_build_object(
      'played', selected_profile.played,
      'won', selected_profile.won,
      'lost', selected_profile.lost
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cashout_mines_game(text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cashout_mines_game(text, uuid) TO service_role;
