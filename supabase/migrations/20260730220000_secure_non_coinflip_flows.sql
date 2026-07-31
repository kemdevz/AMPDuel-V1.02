CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Browser clients may read catalog/game display data, but all private or
-- value-changing operations are performed by the authenticated application
-- server with its service role.
REVOKE ALL ON public.user_profiles FROM anon, authenticated;
REVOKE ALL ON public.user_sessions FROM anon, authenticated;
REVOKE ALL ON public.withdraws FROM anon, authenticated;
REVOKE ALL ON public.tips FROM anon, authenticated;
REVOKE ALL ON public.promo_codes FROM anon, authenticated;
REVOKE ALL ON public.items_to_coins_exchanges FROM anon, authenticated;
REVOKE ALL ON public.coins_to_items_exchanges FROM anon, authenticated;

DROP POLICY IF EXISTS "Allow public read/write user_profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "Allow public read/write user_sessions" ON public.user_sessions;
DROP POLICY IF EXISTS "Users can view withdraws" ON public.withdraws;
DROP POLICY IF EXISTS "Users can insert withdraws" ON public.withdraws;
DROP POLICY IF EXISTS "Users can update withdraws" ON public.withdraws;
DROP POLICY IF EXISTS "Users can delete withdraws" ON public.withdraws;
DROP POLICY IF EXISTS "Allow public read tips" ON public.tips;
DROP POLICY IF EXISTS "Users can view promo codes" ON public.promo_codes;
DROP POLICY IF EXISTS "Users can redeem promo codes" ON public.promo_codes;
DROP POLICY IF EXISTS "Allow public read/write items_to_coins_exchanges" ON public.items_to_coins_exchanges;
DROP POLICY IF EXISTS "Allow public read/write coins_to_items_exchanges" ON public.coins_to_items_exchanges;

REVOKE INSERT, UPDATE, DELETE ON public.inventory_items FROM anon, authenticated;
GRANT SELECT ON public.inventory_items TO anon, authenticated;
DROP POLICY IF EXISTS "Users can insert own inventory_items" ON public.inventory_items;
DROP POLICY IF EXISTS "Users can update own inventory_items" ON public.inventory_items;
DROP POLICY IF EXISTS "Users can delete own inventory_items" ON public.inventory_items;

REVOKE INSERT, UPDATE, DELETE ON public.exchange_stock FROM anon, authenticated;
GRANT SELECT ON public.exchange_stock TO anon, authenticated;
DROP POLICY IF EXISTS "Allow public read/write exchange_stock" ON public.exchange_stock;
DROP POLICY IF EXISTS "Public can read exchange stock" ON public.exchange_stock;
CREATE POLICY "Public can read exchange stock"
  ON public.exchange_stock FOR SELECT USING (true);

REVOKE INSERT, UPDATE, DELETE ON public.giveaways FROM anon, authenticated;
GRANT SELECT ON public.giveaways TO anon, authenticated;
DROP POLICY IF EXISTS "Users can insert giveaways" ON public.giveaways;
DROP POLICY IF EXISTS "Users can update giveaways" ON public.giveaways;
DROP POLICY IF EXISTS "Users can delete giveaways" ON public.giveaways;

REVOKE INSERT, UPDATE, DELETE ON public.summer_event FROM anon, authenticated;
GRANT SELECT ON public.summer_event TO anon, authenticated;
DROP POLICY IF EXISTS "Allow public read/write summer_event" ON public.summer_event;
DROP POLICY IF EXISTS "Public can read summer event" ON public.summer_event;
CREATE POLICY "Public can read summer event"
  ON public.summer_event FOR SELECT USING (true);

REVOKE INSERT, UPDATE, DELETE ON public.rain_events FROM anon, authenticated;
GRANT SELECT ON public.rain_events TO anon, authenticated;
DROP POLICY IF EXISTS "Allow public read/write rain_events" ON public.rain_events;
DROP POLICY IF EXISTS "Public can read rain events" ON public.rain_events;
CREATE POLICY "Public can read rain events"
  ON public.rain_events FOR SELECT USING (true);

ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can read items" ON public.items;
CREATE POLICY "Public can read items"
  ON public.items
  FOR SELECT
  USING (true);
REVOKE INSERT, UPDATE, DELETE ON public.items FROM anon, authenticated;
GRANT SELECT ON public.items TO anon, authenticated;

REVOKE ALL ON FUNCTION public.send_coin_tip(text, text, text, text, text, text, bigint, boolean)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.send_item_tip(text, text[], text, text, text, text, text, uuid[], boolean)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_item_withdrawals(text[], text, uuid[])
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.send_coin_tip(text, text, text, text, text, text, bigint, boolean)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.send_item_tip(text, text[], text, text, text, text, text, uuid[], boolean)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.create_item_withdrawals(text[], text, uuid[])
  TO service_role;

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
    AND user_id::text = p_profile_id
    AND canceled IS FALSE
  ORDER BY id
  FOR UPDATE;

  SELECT count(*)::integer
  INTO v_available_count
  FROM public.withdraws
  WHERE id = ANY(p_withdrawal_uuids)
    AND user_id::text = p_profile_id
    AND canceled IS FALSE;

  IF v_available_count <> v_requested_count THEN
    RAISE EXCEPTION 'One or more withdrawals are unavailable.';
  END IF;

  INSERT INTO public.inventory_items (
    id,
    user_id,
    name,
    value,
    image_url,
    created_at,
    updated_at
  )
  SELECT
    COALESCE(item_id, gen_random_uuid()),
    p_profile_id,
    COALESCE(NULLIF(item_name, ''), 'Unknown item'),
    COALESCE(value, 0),
    image_url,
    now(),
    now()
  FROM public.withdraws
  WHERE id = ANY(p_withdrawal_uuids)
    AND user_id::text = p_profile_id
    AND canceled IS FALSE;

  UPDATE public.withdraws
  SET canceled = TRUE
  WHERE id = ANY(p_withdrawal_uuids)
    AND user_id::text = p_profile_id
    AND canceled IS FALSE;

  RETURN jsonb_build_object('canceled_count', v_available_count);
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_item_withdrawals(text, uuid[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_item_withdrawals(text, uuid[])
  TO service_role;

CREATE OR REPLACE FUNCTION public.exchange_items_atomic(
  p_profile_id text,
  p_mode text,
  p_item_uuids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requested_count integer;
  v_available_count integer;
  v_total_value bigint;
  v_profile public.user_profiles%ROWTYPE;
  v_new_balance bigint;
BEGIN
  v_requested_count := COALESCE(cardinality(p_item_uuids), 0);
  IF v_requested_count = 0 THEN
    RAISE EXCEPTION 'Select at least one item to exchange.';
  END IF;
  IF p_mode NOT IN ('coins_to_items', 'items_to_coins') THEN
    RAISE EXCEPTION 'Invalid exchange mode.';
  END IF;

  SELECT *
  INTO v_profile
  FROM public.user_profiles
  WHERE id::text = p_profile_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Your user profile could not be found.';
  END IF;

  IF p_mode = 'items_to_coins' THEN
    PERFORM 1
    FROM public.inventory_items
    WHERE id = ANY(p_item_uuids)
      AND user_id::text = p_profile_id
    ORDER BY id
    FOR UPDATE;

    SELECT count(*)::integer, COALESCE(sum(COALESCE(value, 0)), 0)::bigint
    INTO v_available_count, v_total_value
    FROM public.inventory_items
    WHERE id = ANY(p_item_uuids)
      AND user_id::text = p_profile_id;

    IF v_available_count <> v_requested_count THEN
      RAISE EXCEPTION 'One or more selected items are no longer available.';
    END IF;

    INSERT INTO public.items_to_coins_exchanges (
      user_id, user_name, item_name, value, image_url, type, coin_amount
    )
    SELECT
      p_profile_id, v_profile.username, name, COALESCE(value, 0), image_url, type, COALESCE(value, 0)
    FROM public.inventory_items
    WHERE id = ANY(p_item_uuids)
      AND user_id::text = p_profile_id;

    INSERT INTO public.exchange_stock (name, value, image_url, type, from_user)
    SELECT name, COALESCE(value, 0), image_url, type, v_profile.username
    FROM public.inventory_items
    WHERE id = ANY(p_item_uuids)
      AND user_id::text = p_profile_id;

    DELETE FROM public.inventory_items
    WHERE id = ANY(p_item_uuids)
      AND user_id::text = p_profile_id;

    UPDATE public.user_profiles
    SET balance = COALESCE(balance, 0) + v_total_value,
        updated_at = now()
    WHERE id::text = p_profile_id
    RETURNING balance INTO v_new_balance;
  ELSE
    PERFORM 1
    FROM public.exchange_stock
    WHERE uuid = ANY(p_item_uuids)
    ORDER BY uuid
    FOR UPDATE;

    SELECT count(*)::integer, COALESCE(sum(COALESCE(value, 0)), 0)::bigint
    INTO v_available_count, v_total_value
    FROM public.exchange_stock
    WHERE uuid = ANY(p_item_uuids);

    IF v_available_count <> v_requested_count THEN
      RAISE EXCEPTION 'One or more stock items are no longer available.';
    END IF;
    IF COALESCE(v_profile.balance, 0) < v_total_value THEN
      RAISE EXCEPTION 'You do not have enough coins for this purchase.';
    END IF;

    INSERT INTO public.coins_to_items_exchanges (
      user_id, user_name, item_name, value, image_url, type, coin_amount
    )
    SELECT
      p_profile_id, v_profile.username, name, COALESCE(value, 0), image_url, type, COALESCE(value, 0)
    FROM public.exchange_stock
    WHERE uuid = ANY(p_item_uuids);

    INSERT INTO public.inventory_items (user_id, name, value, image_url, type)
    SELECT p_profile_id, name, COALESCE(value, 0), image_url, type
    FROM public.exchange_stock
    WHERE uuid = ANY(p_item_uuids);

    DELETE FROM public.exchange_stock
    WHERE uuid = ANY(p_item_uuids);

    UPDATE public.user_profiles
    SET balance = COALESCE(balance, 0) - v_total_value,
        updated_at = now()
    WHERE id::text = p_profile_id
    RETURNING balance INTO v_new_balance;
  END IF;

  RETURN jsonb_build_object(
    'mode', p_mode,
    'item_count', v_available_count,
    'value', v_total_value,
    'balance', v_new_balance
  );
END;
$$;

REVOKE ALL ON FUNCTION public.exchange_items_atomic(text, text, uuid[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.exchange_items_atomic(text, text, uuid[])
  TO service_role;

CREATE OR REPLACE FUNCTION public.create_giveaway_atomic(
  p_profile_id text,
  p_item_uuids uuid[],
  p_duration_minutes integer,
  p_level_requirement integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requested_count integer;
  v_available_count integer;
  v_profile public.user_profiles%ROWTYPE;
  v_items jsonb;
  v_giveaway public.giveaways%ROWTYPE;
BEGIN
  v_requested_count := COALESCE(cardinality(p_item_uuids), 0);
  IF v_requested_count = 0 THEN
    RAISE EXCEPTION 'Select at least one giveaway item.';
  END IF;

  SELECT *
  INTO v_profile
  FROM public.user_profiles
  WHERE id::text = p_profile_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Your user profile could not be found.';
  END IF;

  PERFORM 1
  FROM public.inventory_items
  WHERE id = ANY(p_item_uuids)
    AND user_id::text = p_profile_id
  ORDER BY id
  FOR UPDATE;

  SELECT
    count(*)::integer,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', id,
          'item_id', item_id,
          'name', name,
          'image_url', image_url,
          'value', COALESCE(value, 0),
          'type', type,
          'quantity', 1
        )
        ORDER BY created_at, id
      ),
      '[]'::jsonb
    )
  INTO v_available_count, v_items
  FROM public.inventory_items
  WHERE id = ANY(p_item_uuids)
    AND user_id::text = p_profile_id;

  IF v_available_count <> v_requested_count THEN
    RAISE EXCEPTION 'One or more selected items are no longer available.';
  END IF;

  INSERT INTO public.giveaways (
    user_id,
    user_name,
    status,
    level_requirement,
    duration_minutes,
    items,
    ends_at
  )
  VALUES (
    p_profile_id,
    v_profile.username,
    'active',
    GREATEST(0, LEAST(COALESCE(p_level_requirement, 0), 200)),
    GREATEST(1, LEAST(COALESCE(p_duration_minutes, 15), 30)),
    v_items,
    now() + make_interval(mins => GREATEST(1, LEAST(COALESCE(p_duration_minutes, 15), 30)))
  )
  RETURNING * INTO v_giveaway;

  DELETE FROM public.inventory_items
  WHERE id = ANY(p_item_uuids)
    AND user_id::text = p_profile_id;

  RETURN to_jsonb(v_giveaway);
END;
$$;

REVOKE ALL ON FUNCTION public.create_giveaway_atomic(text, uuid[], integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_giveaway_atomic(text, uuid[], integer, integer)
  TO service_role;
