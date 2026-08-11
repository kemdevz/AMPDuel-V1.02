-- Create the commission audit row before assigning its ID to case openings.
-- The previous order violated the immediate commission_claim_id foreign key.
CREATE OR REPLACE FUNCTION public.claim_case_commissions(p_profile_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claim_id uuid := gen_random_uuid();
  v_claimed_at timestamptz := now();
  v_opening_ids uuid[] := '{}'::uuid[];
  v_amount bigint := 0;
  v_opening_count integer := 0;
  v_updated_count integer := 0;
  v_balance bigint;
  v_owner_user_id uuid;
BEGIN
  IF p_profile_id IS NULL OR btrim(p_profile_id) = '' THEN
    RAISE EXCEPTION 'Your user profile could not be found.';
  END IF;

  v_owner_user_id := p_profile_id::uuid;
  PERFORM pg_advisory_xact_lock(hashtextextended('case-commission:' || p_profile_id, 0));

  WITH claimable AS MATERIALIZED (
    SELECT id, commission_amount
    FROM public.case_openings
    WHERE commission_owner_user_id = v_owner_user_id
      AND commission_amount > 0
      AND commission_claimed_at IS NULL
    ORDER BY id
    FOR UPDATE
  )
  SELECT
    COALESCE(array_agg(id), '{}'::uuid[]),
    COALESCE(sum(commission_amount), 0)::bigint,
    count(*)::integer
  INTO v_opening_ids, v_amount, v_opening_count
  FROM claimable;

  IF v_amount <= 0 OR v_opening_count <= 0 THEN
    SELECT COALESCE(balance, 0) INTO v_balance
    FROM public.user_profiles
    WHERE id = v_owner_user_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Your user profile could not be found.';
    END IF;
    RETURN jsonb_build_object('amount', 0, 'opening_count', 0, 'balance', v_balance);
  END IF;

  UPDATE public.user_profiles
  SET balance = COALESCE(balance, 0) + v_amount,
      updated_at = v_claimed_at
  WHERE id = v_owner_user_id
  RETURNING balance INTO v_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Your user profile could not be found.';
  END IF;

  INSERT INTO public.case_commission_claims (
    id, owner_user_id, amount, opening_count, balance_after, claimed_at
  ) VALUES (
    v_claim_id, v_owner_user_id, v_amount, v_opening_count, v_balance, v_claimed_at
  );

  UPDATE public.case_openings
  SET commission_claimed_at = v_claimed_at,
      commission_claim_id = v_claim_id
  WHERE id = ANY(v_opening_ids)
    AND commission_claimed_at IS NULL;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count <> v_opening_count THEN
    RAISE EXCEPTION 'Case commission claim changed while it was being processed.';
  END IF;

  RETURN jsonb_build_object(
    'claim_id', v_claim_id,
    'amount', v_amount,
    'opening_count', v_opening_count,
    'balance', v_balance
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_case_commissions(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_case_commissions(text) TO service_role;
