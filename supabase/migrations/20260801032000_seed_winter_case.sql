DO $$
DECLARE
  v_titanic_ice_snake public.items%ROWTYPE;
  v_huge_husky public.items%ROWTYPE;
  v_huge_cheerful_yeti public.items%ROWTYPE;
  v_huge_snowflake_dominus public.items%ROWTYPE;
  v_huge_icy_phoenix public.items%ROWTYPE;
  v_huge_snow_elf public.items%ROWTYPE;
BEGIN
  SELECT * INTO STRICT v_titanic_ice_snake
  FROM public.items
  WHERE name = 'Titanic Ice Snake' AND type = 'PS99';

  SELECT * INTO STRICT v_huge_husky
  FROM public.items
  WHERE name = 'Huge Husky' AND type = 'PS99';

  SELECT * INTO STRICT v_huge_cheerful_yeti
  FROM public.items
  WHERE name = 'Huge Cheerful Yeti' AND type = 'PS99';

  SELECT * INTO STRICT v_huge_snowflake_dominus
  FROM public.items
  WHERE name = 'Huge Snowflake Dominus' AND type = 'PS99';

  SELECT * INTO STRICT v_huge_icy_phoenix
  FROM public.items
  WHERE name = 'Huge Icy Phoenix' AND type = 'PS99';

  SELECT * INTO STRICT v_huge_snow_elf
  FROM public.items
  WHERE name = 'Huge Snow Elf' AND type = 'PS99';

  INSERT INTO public.cases (
    uuid,
    name,
    price,
    image_url,
    items,
    active,
    community,
    owner_user_id
  )
  VALUES (
    '00000000-0000-4000-8000-000000000002'::uuid,
    'Winter Case',
    40532,
    v_titanic_ice_snake.image_url,
    jsonb_build_array(
      jsonb_build_object(
        'item_id', v_titanic_ice_snake.id::text,
        'name', v_titanic_ice_snake.name,
        'image_url', v_titanic_ice_snake.image_url,
        'value', v_titanic_ice_snake.value,
        'chance', 0.1,
        'roll_range', jsonb_build_object('start', 0, 'end', 99)
      ),
      jsonb_build_object(
        'item_id', v_huge_husky.id::text,
        'name', v_huge_husky.name,
        'image_url', v_huge_husky.image_url,
        'value', v_huge_husky.value,
        'chance', 1.3,
        'roll_range', jsonb_build_object('start', 100, 'end', 1399)
      ),
      jsonb_build_object(
        'item_id', v_huge_cheerful_yeti.id::text,
        'name', v_huge_cheerful_yeti.name,
        'image_url', v_huge_cheerful_yeti.image_url,
        'value', v_huge_cheerful_yeti.value,
        'chance', 2.5,
        'roll_range', jsonb_build_object('start', 1400, 'end', 3899)
      ),
      jsonb_build_object(
        'item_id', v_huge_snowflake_dominus.id::text,
        'name', v_huge_snowflake_dominus.name,
        'image_url', v_huge_snowflake_dominus.image_url,
        'value', v_huge_snowflake_dominus.value,
        'chance', 8.0,
        'roll_range', jsonb_build_object('start', 3900, 'end', 11899)
      ),
      jsonb_build_object(
        'item_id', v_huge_icy_phoenix.id::text,
        'name', v_huge_icy_phoenix.name,
        'image_url', v_huge_icy_phoenix.image_url,
        'value', v_huge_icy_phoenix.value,
        'chance', 23.0,
        'roll_range', jsonb_build_object('start', 11900, 'end', 34899)
      ),
      jsonb_build_object(
        'item_id', v_huge_snow_elf.id::text,
        'name', v_huge_snow_elf.name,
        'image_url', v_huge_snow_elf.image_url,
        'value', v_huge_snow_elf.value,
        'chance', 65.1,
        'roll_range', jsonb_build_object('start', 34900, 'end', 99999)
      )
    ),
    true,
    false,
    NULL
  )
  ON CONFLICT (uuid) DO UPDATE
  SET
    name = EXCLUDED.name,
    price = EXCLUDED.price,
    image_url = EXCLUDED.image_url,
    items = EXCLUDED.items,
    active = EXCLUDED.active,
    community = EXCLUDED.community,
    owner_user_id = EXCLUDED.owner_user_id;
END;
$$;
