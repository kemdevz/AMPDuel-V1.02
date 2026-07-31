CREATE OR REPLACE FUNCTION public.redeem_promocode(
  p_code text,
  p_profile_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_promo public.promo_codes%ROWTYPE;
  v_profile public.user_profiles%ROWTYPE;
  v_item public.items%ROWTYPE;
  v_redeemed text[];
BEGIN
  IF p_code IS NULL OR btrim(p_code) = '' THEN
    RAISE EXCEPTION 'Enter a promocode first.';
  END IF;

  IF p_profile_id IS NULL OR btrim(p_profile_id) = '' THEN
    RAISE EXCEPTION 'Please sign in to redeem a code.';
  END IF;

  SELECT *
  INTO v_profile
  FROM public.user_profiles
  WHERE id::text = p_profile_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Your user profile could not be found.';
  END IF;

  SELECT *
  INTO v_promo
  FROM public.promo_codes
  WHERE upper(promocode_name) = upper(btrim(p_code))
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Promocode not found.';
  END IF;

  v_redeemed := COALESCE(v_promo.redeemed, ARRAY[]::text[]);

  IF p_profile_id = ANY(v_redeemed) THEN
    RAISE EXCEPTION 'You already redeemed this code.';
  END IF;

  IF v_promo.uses <= 0 THEN
    RAISE EXCEPTION 'This promocode has no remaining uses.';
  END IF;

  IF COALESCE(v_profile.level, 1) < COALESCE(v_promo.level_requirement, 1) THEN
    RAISE EXCEPTION 'Level % required to redeem this code.', v_promo.level_requirement;
  END IF;

  SELECT *
  INTO v_item
  FROM public.items
  WHERE id = v_promo.item_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The reward item could not be found.';
  END IF;

  INSERT INTO public.inventory_items (
    item_id,
    user_id,
    name,
    value,
    image_url,
    type
  )
  VALUES (
    v_item.id,
    p_profile_id,
    v_item.name,
    COALESCE(v_item.value, 0),
    v_item.image_url,
    v_item.type
  );

  UPDATE public.promo_codes
  SET uses = uses - 1,
      redeemed = array_append(v_redeemed, p_profile_id),
      updated_at = now()
  WHERE promocode_uuid = v_promo.promocode_uuid;

  RETURN jsonb_build_object(
    'item', jsonb_build_object(
      'id', v_item.id,
      'name', v_item.name,
      'value', COALESCE(v_item.value, 0),
      'image_url', v_item.image_url,
      'type', v_item.type
    ),
    'remaining_uses', v_promo.uses - 1
  );
END;
$$;

REVOKE UPDATE ON public.promo_codes FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.redeem_promocode(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_promocode(text, text) TO service_role;
