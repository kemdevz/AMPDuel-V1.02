ALTER TABLE public.withdraws
  ADD COLUMN IF NOT EXISTS item_type text,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS external_trade_id text,
  ADD COLUMN IF NOT EXISTS bot_roblox_id text,
  ADD COLUMN IF NOT EXISTS claim_token text,
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS claimed_by_bot text;

-- Gem packages are catalogued PS99 items on the website and are delivered as
-- their corresponding diamond amount by the Lua bot.
INSERT INTO public.items (id, name, value, image_url, type)
SELECT gen_random_uuid(), gem_package.name, gem_package.value, NULL, 'PS99'
FROM (VALUES
  ('100K gems', 100000),
  ('500K gems', 500000),
  ('1M gems', 1000000),
  ('5M gems', 5000000),
  ('10M gems', 10000000),
  ('25M gems', 25000000),
  ('50M gems', 50000000),
  ('100M gems', 100000000)
) AS gem_package(name, value)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.items AS existing
  WHERE existing.name = gem_package.name
    AND existing.type = 'PS99'
);

UPDATE public.withdraws AS withdrawal
SET item_type = (
  SELECT item.type
  FROM public.items AS item
  WHERE lower(item.name) = lower(withdrawal.item_name)
  ORDER BY (item.type = 'PS99') DESC, item.id
  LIMIT 1
)
WHERE withdrawal.item_type IS NULL;

CREATE OR REPLACE FUNCTION public.assign_withdrawal_item_type()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.item_type IS NULL AND NEW.item_id IS NOT NULL THEN
    SELECT inventory.type INTO NEW.item_type
    FROM public.inventory_items AS inventory
    WHERE inventory.id = NEW.item_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS withdraws_assign_item_type ON public.withdraws;
CREATE TRIGGER withdraws_assign_item_type
BEFORE INSERT ON public.withdraws
FOR EACH ROW EXECUTE FUNCTION public.assign_withdrawal_item_type();

CREATE INDEX IF NOT EXISTS withdraws_pending_user_idx
  ON public.withdraws (user_id, withdrawed_at)
  WHERE canceled IS FALSE AND completed_at IS NULL;

CREATE INDEX IF NOT EXISTS withdraws_external_trade_id_idx
  ON public.withdraws (external_trade_id)
  WHERE external_trade_id IS NOT NULL;

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
        pending.claimed_at IS NULL
        OR pending.claimed_at < now() - interval '5 minutes'
        OR pending.claimed_by_bot = p_bot_roblox_id
      )
    ORDER BY pending.withdrawed_at, pending.id
    LIMIT 100
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.withdraws AS claimed
  SET claim_token = p_claim_token,
      claimed_at = now(),
      claimed_by_bot = p_bot_roblox_id
  FROM claimable
  WHERE claimed.id = claimable.id
  RETURNING claimed.id, claimed.item_name;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_ps99_withdrawals(
  p_profile_id text,
  p_withdrawal_uuids uuid[],
  p_claim_token text,
  p_external_trade_id text,
  p_bot_roblox_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requested_count integer;
  v_matching_count integer;
  v_completed_count integer;
BEGIN
  v_requested_count := COALESCE(cardinality(p_withdrawal_uuids), 0);
  IF v_requested_count < 1 OR v_requested_count > 100 THEN
    RAISE EXCEPTION 'Between 1 and 100 withdrawal IDs are required.';
  END IF;
  IF v_requested_count <> (
    SELECT count(DISTINCT requested.withdrawal_uuid)
    FROM unnest(p_withdrawal_uuids) AS requested(withdrawal_uuid)
  ) THEN
    RAISE EXCEPTION 'Duplicate withdrawal IDs are not allowed.';
  END IF;
  IF NULLIF(btrim(p_claim_token), '') IS NULL
    OR NULLIF(btrim(p_external_trade_id), '') IS NULL
    OR length(p_claim_token) > 128
    OR length(p_external_trade_id) > 128
    OR NULLIF(btrim(p_bot_roblox_id), '') IS NULL THEN
    RAISE EXCEPTION 'Valid claim, trade, and bot identifiers are required.';
  END IF;

  PERFORM 1
  FROM public.withdraws
  WHERE id = ANY(p_withdrawal_uuids)
  ORDER BY id
  FOR UPDATE;

  SELECT count(*)::integer,
         count(*) FILTER (
           WHERE completed_at IS NOT NULL
             AND external_trade_id = p_external_trade_id
             AND bot_roblox_id = p_bot_roblox_id
         )::integer
  INTO v_matching_count, v_completed_count
  FROM public.withdraws
  WHERE id = ANY(p_withdrawal_uuids)
    AND user_id = p_profile_id;

  IF v_matching_count <> v_requested_count THEN
    RAISE EXCEPTION 'One or more withdrawals do not belong to this user.';
  END IF;
  IF v_completed_count = v_requested_count THEN
    RETURN jsonb_build_object('completed_count', v_completed_count, 'duplicate', true);
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.withdraws
    WHERE id = ANY(p_withdrawal_uuids)
      AND (
        canceled IS TRUE
        OR completed_at IS NOT NULL
        OR claim_token IS DISTINCT FROM p_claim_token
        OR claimed_by_bot IS DISTINCT FROM p_bot_roblox_id
      )
  ) THEN
    RAISE EXCEPTION 'One or more withdrawals are no longer available to this bot.';
  END IF;

  UPDATE public.withdraws
  SET completed_at = now(),
      external_trade_id = p_external_trade_id,
      bot_roblox_id = p_bot_roblox_id,
      claim_token = NULL,
      claimed_at = NULL,
      claimed_by_bot = NULL
  WHERE id = ANY(p_withdrawal_uuids)
    AND user_id = p_profile_id
    AND canceled IS FALSE
    AND completed_at IS NULL;

  -- Release unfulfilled rows from a partial trade so another bot can claim them.
  UPDATE public.withdraws
  SET claim_token = NULL,
      claimed_at = NULL,
      claimed_by_bot = NULL
  WHERE user_id = p_profile_id
    AND claim_token = p_claim_token
    AND claimed_by_bot = p_bot_roblox_id
    AND completed_at IS NULL
    AND canceled IS FALSE;

  RETURN jsonb_build_object('completed_count', v_requested_count, 'duplicate', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.release_ps99_withdrawal_claim(
  p_profile_id text,
  p_claim_token text,
  p_bot_roblox_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_released_count integer;
BEGIN
  UPDATE public.withdraws
  SET claim_token = NULL,
      claimed_at = NULL,
      claimed_by_bot = NULL
  WHERE user_id = p_profile_id
    AND claim_token = p_claim_token
    AND claimed_by_bot = p_bot_roblox_id
    AND completed_at IS NULL
    AND canceled IS FALSE;

  GET DIAGNOSTICS v_released_count = ROW_COUNT;
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
  IF v_requested_count = 0 THEN
    RAISE EXCEPTION 'Select at least one withdrawal to cancel.';
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
    AND (claimed_at IS NULL OR claimed_at < now() - interval '5 minutes');

  IF v_available_count <> v_requested_count THEN
    RAISE EXCEPTION 'One or more withdrawals are completed, claimed by a bot, or unavailable.';
  END IF;

  INSERT INTO public.inventory_items (id, user_id, name, value, image_url, type, created_at, updated_at)
  SELECT COALESCE(item_id, gen_random_uuid()), p_profile_id,
         COALESCE(NULLIF(item_name, ''), 'Unknown item'), COALESCE(value, 0), image_url, item_type, now(), now()
  FROM public.withdraws
  WHERE id = ANY(p_withdrawal_uuids)
    AND user_id = p_profile_id
    AND canceled IS FALSE
    AND completed_at IS NULL;

  UPDATE public.withdraws
  SET canceled = TRUE,
      claim_token = NULL,
      claimed_at = NULL,
      claimed_by_bot = NULL
  WHERE id = ANY(p_withdrawal_uuids)
    AND user_id = p_profile_id
    AND canceled IS FALSE
    AND completed_at IS NULL;

  RETURN jsonb_build_object('canceled_count', v_available_count);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_ps99_withdrawals(text, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_ps99_withdrawals(text, uuid[], text, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_ps99_withdrawal_claim(text, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_item_withdrawals(text, uuid[])
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_ps99_withdrawals(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_ps99_withdrawals(text, uuid[], text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_ps99_withdrawal_claim(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_item_withdrawals(text, uuid[]) TO service_role;
