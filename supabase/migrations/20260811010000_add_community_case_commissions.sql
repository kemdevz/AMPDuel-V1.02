-- Community case commission accounting. Commission rates use basis points
-- (300 = 3%) so every balance calculation remains integer and deterministic.

-- These policies reference owner_user_id, so remove them before normalizing
-- the column to the UUID type used by the live user_profiles table.
DROP POLICY IF EXISTS "Anyone can view active cases" ON public.cases;
DROP POLICY IF EXISTS "Users can create community cases" ON public.cases;
DROP POLICY IF EXISTS "Owners can update community cases" ON public.cases;
DROP POLICY IF EXISTS "Owners can delete community cases" ON public.cases;

DO $$
BEGIN
  ALTER TABLE public.cases DROP CONSTRAINT IF EXISTS cases_owner_user_id_fkey;
  ALTER TABLE public.cases
    ALTER COLUMN owner_user_id TYPE uuid USING NULLIF(owner_user_id::text, '')::uuid;
END;
$$;

ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS owner_username text,
  ADD COLUMN IF NOT EXISTS commission_bps smallint NOT NULL DEFAULT 0;

ALTER TABLE public.cases
  DROP CONSTRAINT IF EXISTS cases_commission_bps_check;
ALTER TABLE public.cases
  ADD CONSTRAINT cases_commission_bps_check
  CHECK (commission_bps BETWEEN 0 AND 300);

ALTER TABLE public.cases
  ADD CONSTRAINT cases_owner_user_id_fkey
  FOREIGN KEY (owner_user_id)
  REFERENCES public.user_profiles(id)
  ON UPDATE CASCADE
  ON DELETE RESTRICT;

ALTER TABLE public.case_openings
  ADD COLUMN IF NOT EXISTS commission_owner_user_id uuid,
  ADD COLUMN IF NOT EXISTS commission_bps smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_amount bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS commission_claim_id uuid;

ALTER TABLE public.case_openings
  DROP CONSTRAINT IF EXISTS case_openings_commission_bps_check;
ALTER TABLE public.case_openings
  ADD CONSTRAINT case_openings_commission_bps_check
  CHECK (commission_bps BETWEEN 0 AND 300);

ALTER TABLE public.case_openings
  DROP CONSTRAINT IF EXISTS case_openings_commission_amount_check;
ALTER TABLE public.case_openings
  ADD CONSTRAINT case_openings_commission_amount_check
  CHECK (commission_amount >= 0);

ALTER TABLE public.case_openings
  DROP CONSTRAINT IF EXISTS case_openings_commission_owner_fkey;
ALTER TABLE public.case_openings
  ADD CONSTRAINT case_openings_commission_owner_fkey
  FOREIGN KEY (commission_owner_user_id)
  REFERENCES public.user_profiles(id)
  ON UPDATE CASCADE
  ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS case_openings_unclaimed_commission_idx
  ON public.case_openings (commission_owner_user_id, commission_claimed_at)
  WHERE commission_amount > 0;

CREATE TABLE IF NOT EXISTS public.case_commission_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  amount bigint NOT NULL CHECK (amount > 0),
  opening_count integer NOT NULL CHECK (opening_count > 0),
  balance_after bigint NOT NULL CHECK (balance_after >= 0),
  claimed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS case_commission_claims_owner_idx
  ON public.case_commission_claims (owner_user_id, claimed_at DESC);

ALTER TABLE public.case_openings
  DROP CONSTRAINT IF EXISTS case_openings_commission_claim_fkey;
ALTER TABLE public.case_openings
  ADD CONSTRAINT case_openings_commission_claim_fkey
  FOREIGN KEY (commission_claim_id)
  REFERENCES public.case_commission_claims(id)
  ON DELETE RESTRICT;

ALTER TABLE public.case_commission_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.case_commission_claims FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.snapshot_case_opening_commission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_case public.cases%ROWTYPE;
BEGIN
  SELECT * INTO STRICT v_case
  FROM public.cases
  WHERE uuid = NEW.case_id;

  IF v_case.community AND v_case.owner_user_id IS NOT NULL THEN
    NEW.commission_owner_user_id := v_case.owner_user_id;
    NEW.commission_bps := v_case.commission_bps;
    NEW.commission_amount := floor((NEW.case_price::numeric * v_case.commission_bps) / 10000)::bigint;
  ELSE
    NEW.commission_owner_user_id := NULL;
    NEW.commission_bps := 0;
    NEW.commission_amount := 0;
  END IF;

  NEW.commission_claimed_at := NULL;
  NEW.commission_claim_id := NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS snapshot_case_opening_commission_trigger
  ON public.case_openings;
CREATE TRIGGER snapshot_case_opening_commission_trigger
BEFORE INSERT ON public.case_openings
FOR EACH ROW
EXECUTE FUNCTION public.snapshot_case_opening_commission();

CREATE OR REPLACE FUNCTION public.get_case_creator_summary(p_profile_id text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH owned_openings AS (
    SELECT opening.*
    FROM public.case_openings AS opening
    WHERE opening.commission_owner_user_id::text = p_profile_id
  ), case_totals AS (
    SELECT
      case_id,
      count(*)::bigint AS opens,
      COALESCE(sum(commission_amount), 0)::bigint AS earned,
      COALESCE(sum(commission_amount) FILTER (WHERE commission_claimed_at IS NULL), 0)::bigint AS claimable
    FROM owned_openings
    GROUP BY case_id
  )
  SELECT jsonb_build_object(
    'opens', COALESCE((SELECT count(*) FROM owned_openings), 0),
    'earned', COALESCE((SELECT sum(commission_amount) FROM owned_openings), 0),
    'claimable', COALESCE((SELECT sum(commission_amount) FROM owned_openings WHERE commission_claimed_at IS NULL), 0),
    'case_stats', COALESCE((
      SELECT jsonb_object_agg(
        case_id::text,
        jsonb_build_object('opens', opens, 'earned', earned, 'claimable', claimable)
      )
      FROM case_totals
    ), '{}'::jsonb)
  );
$$;

CREATE OR REPLACE FUNCTION public.claim_case_commissions(p_profile_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claim_id uuid := gen_random_uuid();
  v_amount bigint := 0;
  v_opening_count integer := 0;
  v_balance bigint;
  v_owner_user_id uuid;
BEGIN
  IF p_profile_id IS NULL OR btrim(p_profile_id) = '' THEN
    RAISE EXCEPTION 'Your user profile could not be found.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('case-commission:' || p_profile_id, 0));
  v_owner_user_id := p_profile_id::uuid;

  WITH claimable AS (
    SELECT id, commission_amount
    FROM public.case_openings
    WHERE commission_owner_user_id::text = p_profile_id
      AND commission_amount > 0
      AND commission_claimed_at IS NULL
    FOR UPDATE
  ), claimed AS (
    UPDATE public.case_openings AS opening
    SET commission_claimed_at = now(),
        commission_claim_id = v_claim_id
    FROM claimable
    WHERE opening.id = claimable.id
    RETURNING claimable.commission_amount
  )
  SELECT COALESCE(sum(commission_amount), 0)::bigint, count(*)::integer
  INTO v_amount, v_opening_count
  FROM claimed;

  IF v_amount <= 0 OR v_opening_count <= 0 THEN
    SELECT COALESCE(balance, 0) INTO v_balance
    FROM public.user_profiles
    WHERE id::text = p_profile_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Your user profile could not be found.';
    END IF;
    RETURN jsonb_build_object('amount', 0, 'opening_count', 0, 'balance', v_balance);
  END IF;

  UPDATE public.user_profiles
  SET balance = COALESCE(balance, 0) + v_amount,
      updated_at = now()
  WHERE id::text = p_profile_id
  RETURNING balance INTO v_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Your user profile could not be found.';
  END IF;

  INSERT INTO public.case_commission_claims (
    id, owner_user_id, amount, opening_count, balance_after
  ) VALUES (
    v_claim_id, v_owner_user_id, v_amount, v_opening_count, v_balance
  );

  RETURN jsonb_build_object(
    'claim_id', v_claim_id,
    'amount', v_amount,
    'opening_count', v_opening_count,
    'balance', v_balance
  );
END;
$$;

REVOKE ALL ON FUNCTION public.snapshot_case_opening_commission() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_case_creator_summary(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_case_commissions(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_case_creator_summary(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_case_commissions(text) TO service_role;

-- Everyone may browse active cases. Owners may also see their inactive cases.
CREATE POLICY "Anyone can view active cases"
  ON public.cases FOR SELECT
  USING (active = true OR owner_user_id = auth.uid());

-- Community cases are created and mutated only by the authenticated app
-- server, which independently validates item IDs, odds, prices, and ownership.
REVOKE INSERT, UPDATE, DELETE ON public.cases FROM anon, authenticated;

COMMENT ON COLUMN public.cases.commission_bps IS
  'Creator commission in basis points. 300 equals 3 percent.';
COMMENT ON COLUMN public.case_openings.commission_amount IS
  'Immutable creator commission reserved by this opening and claimable exactly once.';
COMMENT ON COLUMN public.case_openings.commission_claimed_at IS
  'Set atomically when the commission is credited to the community case owner.';
