ALTER TABLE public.case_openings
  ADD COLUMN IF NOT EXISTS stats_recorded_at timestamptz;

-- Backfill openings created before case statistics were enabled. Marking each
-- row makes this safe if the migration is accidentally executed more than once.
WITH pending_totals AS (
  SELECT
    user_id,
    COALESCE(sum(case_price), 0)::bigint AS played_amount,
    COALESCE(sum(GREATEST(coin_payout - case_price, 0)), 0)::bigint AS won_amount,
    COALESCE(sum(GREATEST(case_price - coin_payout, 0)), 0)::bigint AS lost_amount
  FROM public.case_openings
  WHERE stats_recorded_at IS NULL
  GROUP BY user_id
)
UPDATE public.user_profiles AS profile
SET played = COALESCE(profile.played, 0) + pending_totals.played_amount,
    won = COALESCE(profile.won, 0) + pending_totals.won_amount,
    lost = COALESCE(profile.lost, 0) + pending_totals.lost_amount,
    updated_at = now()
FROM pending_totals
WHERE profile.id = pending_totals.user_id;

UPDATE public.case_openings
SET stats_recorded_at = now()
WHERE stats_recorded_at IS NULL;

CREATE OR REPLACE FUNCTION public.update_case_opening_profile_stats()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated_profiles integer;
BEGIN
  IF NEW.stats_recorded_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.user_profiles AS profile
  SET played = COALESCE(profile.played, 0) + NEW.case_price,
      won = COALESCE(profile.won, 0) + GREATEST(NEW.coin_payout - NEW.case_price, 0),
      lost = COALESCE(profile.lost, 0) + GREATEST(NEW.case_price - NEW.coin_payout, 0),
      updated_at = now()
  WHERE profile.id = NEW.user_id;

  GET DIAGNOSTICS v_updated_profiles = ROW_COUNT;
  IF v_updated_profiles <> 1 THEN
    RAISE EXCEPTION 'The case opening profile could not be updated.';
  END IF;

  UPDATE public.case_openings
  SET stats_recorded_at = now()
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_case_opening_profile_stats_trigger
  ON public.case_openings;

CREATE TRIGGER update_case_opening_profile_stats_trigger
AFTER INSERT ON public.case_openings
FOR EACH ROW
EXECUTE FUNCTION public.update_case_opening_profile_stats();

REVOKE ALL ON FUNCTION public.update_case_opening_profile_stats()
  FROM PUBLIC, anon, authenticated;
