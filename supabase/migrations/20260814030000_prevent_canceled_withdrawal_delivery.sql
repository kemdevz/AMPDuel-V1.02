-- A withdrawal claim is a delivery lock, not a short-lived cache entry.
-- Never expire it based only on elapsed time: an old Roblox trade can still be
-- open and capable of transferring assets. Claims are released explicitly by
-- the authenticated bot only after Roblox confirms cancellation or disconnect.

CREATE OR REPLACE FUNCTION public.claim_ps99_withdrawals(
  p_profile_id text,
  p_bot_roblox_id text,
  p_claim_token text
)
RETURNS TABLE (withdrawal_id uuid, item_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NULLIF(btrim(p_profile_id), '') IS NULL
    OR NULLIF(btrim(p_bot_roblox_id), '') IS NULL
    OR NULLIF(btrim(p_claim_token), '') IS NULL
    OR length(p_claim_token) > 128 THEN
    RAISE EXCEPTION 'Valid profile, bot, and claim identifiers are required.';
  END IF;

  RETURN QUERY
  WITH claimable AS (
    SELECT pending.id
    FROM public.withdraws AS pending
    WHERE pending.user_id = p_profile_id
      AND pending.canceled IS FALSE
      AND pending.completed_at IS NULL
      AND pending.item_type = 'PS99'
      AND (
        (
          pending.claim_token IS NULL
          AND pending.claimed_at IS NULL
          AND pending.claimed_by_bot IS NULL
        )
        OR (
          pending.claim_token = p_claim_token
          AND pending.claimed_by_bot = p_bot_roblox_id
        )
      )
    ORDER BY pending.withdrawed_at, pending.id
    LIMIT 100
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.withdraws AS claimed
  SET claim_token = p_claim_token,
      claimed_at = COALESCE(claimed.claimed_at, now()),
      claimed_by_bot = p_bot_roblox_id
  FROM claimable
  WHERE claimed.id = claimable.id
  RETURNING claimed.id, claimed.item_name;
END;
$$;

-- Manual recovery only. An operator must first verify that the Roblox trade is
-- closed. Requiring the exact row IDs, claim token, and bot ID prevents a broad
-- or accidental unlock, and this function is never exposed to site users.
CREATE OR REPLACE FUNCTION public.recover_ps99_withdrawal_claims(
  p_withdrawal_uuids uuid[],
  p_claim_token text,
  p_bot_roblox_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requested_count integer;
  v_released_count integer;
BEGIN
  v_requested_count := COALESCE(cardinality(p_withdrawal_uuids), 0);
  IF v_requested_count = 0 OR v_requested_count > 100 THEN
    RAISE EXCEPTION 'Select between 1 and 100 withdrawal claims to recover.';
  END IF;
  IF NULLIF(btrim(p_claim_token), '') IS NULL
    OR NULLIF(btrim(p_bot_roblox_id), '') IS NULL THEN
    RAISE EXCEPTION 'The exact claim token and bot ID are required.';
  END IF;

  UPDATE public.withdraws
  SET claim_token = NULL,
      claimed_at = NULL,
      claimed_by_bot = NULL
  WHERE id = ANY(p_withdrawal_uuids)
    AND claim_token = p_claim_token
    AND claimed_by_bot = p_bot_roblox_id
    AND canceled IS FALSE
    AND completed_at IS NULL;

  GET DIAGNOSTICS v_released_count = ROW_COUNT;
  IF v_released_count <> v_requested_count THEN
    RAISE EXCEPTION 'The requested claims did not exactly match the supplied token and bot.';
  END IF;

  RETURN jsonb_build_object('released_count', v_released_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_item_withdrawals(
  p_profile_id text,
  p_withdrawal_uuids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requested_count integer;
  v_available_count integer;
BEGIN
  v_requested_count := COALESCE(cardinality(p_withdrawal_uuids), 0);
  IF v_requested_count = 0 OR v_requested_count > 100 THEN
    RAISE EXCEPTION 'Select between 1 and 100 withdrawals to cancel.';
  END IF;
  IF v_requested_count <> (
    SELECT count(DISTINCT requested.withdrawal_uuid)
    FROM unnest(p_withdrawal_uuids) AS requested(withdrawal_uuid)
  ) THEN
    RAISE EXCEPTION 'Duplicate withdrawal IDs are not allowed.';
  END IF;

  PERFORM 1
  FROM public.withdraws
  WHERE id = ANY(p_withdrawal_uuids)
    AND user_id = p_profile_id
  ORDER BY id
  FOR UPDATE;

  SELECT count(*)::integer INTO v_available_count
  FROM public.withdraws
  WHERE id = ANY(p_withdrawal_uuids)
    AND user_id = p_profile_id
    AND canceled IS FALSE
    AND completed_at IS NULL
    AND claim_token IS NULL
    AND claimed_at IS NULL
    AND claimed_by_bot IS NULL;

  IF v_available_count <> v_requested_count THEN
    RAISE EXCEPTION 'One or more withdrawals are completed, actively claimed by a bot, or unavailable.';
  END IF;

  INSERT INTO public.inventory_items (id, user_id, name, value, image_url, type, created_at, updated_at)
  SELECT COALESCE(item_id, gen_random_uuid()), p_profile_id,
         COALESCE(NULLIF(item_name, ''), 'Unknown item'), COALESCE(value, 0), image_url, item_type, now(), now()
  FROM public.withdraws
  WHERE id = ANY(p_withdrawal_uuids)
    AND user_id = p_profile_id
    AND canceled IS FALSE
    AND completed_at IS NULL
    AND claim_token IS NULL
    AND claimed_at IS NULL
    AND claimed_by_bot IS NULL;

  UPDATE public.withdraws
  SET canceled = TRUE,
      claim_token = NULL,
      claimed_at = NULL,
      claimed_by_bot = NULL
  WHERE id = ANY(p_withdrawal_uuids)
    AND user_id = p_profile_id
    AND canceled IS FALSE
    AND completed_at IS NULL
    AND claim_token IS NULL
    AND claimed_at IS NULL
    AND claimed_by_bot IS NULL;

  RETURN jsonb_build_object('canceled_count', v_available_count);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_ps99_withdrawals(text, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_item_withdrawals(text, uuid[])
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recover_ps99_withdrawal_claims(uuid[], text, text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_ps99_withdrawals(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_item_withdrawals(text, uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.recover_ps99_withdrawal_claims(uuid[], text, text) TO service_role;

COMMENT ON FUNCTION public.claim_ps99_withdrawals(text, text, text) IS
  'Claims pending PS99 withdrawals without time-based expiry; only the same bot claim may retry idempotently.';
COMMENT ON FUNCTION public.cancel_item_withdrawals(text, uuid[]) IS
  'Returns unclaimed withdrawals to inventory; actively claimed withdrawals cannot be canceled.';
COMMENT ON FUNCTION public.recover_ps99_withdrawal_claims(uuid[], text, text) IS
  'Service-role-only manual recovery after an operator verifies the corresponding Roblox trade is closed.';
