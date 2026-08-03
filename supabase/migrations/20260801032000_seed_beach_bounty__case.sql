DO $$
DECLARE
  v_titanic_pineapple_cat public.items%ROWTYPE;
  v_titanic_pineapple_dog public.items%ROWTYPE;
  v_huge_sandcastle_cat public.items%ROWTYPE;
  v_huge_chill_parrot public.items%ROWTYPE;
  v_huge_sand_turtle public.items%ROWTYPE;
BEGIN
  SELECT * INTO STRICT v_titanic_pineapple_cat
  FROM public.items
  WHERE name = 'Titanic Pineapple Cat' AND type = 'PS99';

  SELECT * INTO STRICT v_titanic_pineapple_dog
  FROM public.items
  WHERE name = 'Titanic Pineapple Dog' AND type = 'PS99';

  SELECT * INTO STRICT v_huge_sandcastle_cat
  FROM public.items
  WHERE name = 'Huge Sandcastle Cat' AND type = 'PS99';

  SELECT * INTO STRICT v_huge_chill_parrot
  FROM public.items
  WHERE name = 'Huge Chill Parrot' AND type = 'PS99';

  SELECT * INTO STRICT v_huge_sand_turtle
  FROM public.items
  WHERE name = 'Huge Sand Turtle' AND type = 'PS99';

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
    '00000000-0000-4000-8000-000000000003'::uuid,
    'Beach Bounty',
    40532,
    'https://cdn.discordapp.com/attachments/1533320472719130694/1533374579504844840/download_14.png?ex=6a7041dc&is=6a6ef05c&hm=688ca8ee1d1a3292c83bf065981d01ef84e14e3126e9547fac1ab8acf2ff55b7',
    jsonb_build_array(
      jsonb_build_object(
        'item_id', v_titanic_pineapple_cat.id::text,
        'name', v_titanic_pineapple_cat.name,
        'image_url', v_titanic_pineapple_cat.image_url,
        'value', v_titanic_pineapple_cat.value,
        'chance', 0.1,
        'roll_range', jsonb_build_object('start', 0, 'end', 99)
      ),
      jsonb_build_object(
        'item_id', v_titanic_pineapple_dog.id::text,
        'name', v_titanic_pineapple_dog.name,
        'image_url', v_titanic_pineapple_dog.image_url,
        'value', v_titanic_pineapple_dog.value,
        'chance', 1.0,
        'roll_range', jsonb_build_object('start', 100, 'end', 1099)
      ),
      jsonb_build_object(
        'item_id', v_huge_sandcastle_cat.id::text,
        'name', v_huge_sandcastle_cat.name,
        'image_url', v_huge_sandcastle_cat.image_url,
        'value', v_huge_sandcastle_cat.value,
        'chance', 8.0,
        'roll_range', jsonb_build_object('start', 1100, 'end', 9099)
      ),
      jsonb_build_object(
        'item_id', v_huge_chill_parrot.id::text,
        'name', v_huge_chill_parrot.name,
        'image_url', v_huge_chill_parrot.image_url,
        'value', v_huge_chill_parrot.value,
        'chance', 15.0,
        'roll_range', jsonb_build_object('start', 9100, 'end', 23999)
      ),
      jsonb_build_object(
        'item_id', v_huge_sand_turtle.id::text,
        'name', v_huge_sand_turtle.name,
        'image_url', v_huge_sand_turtle.image_url,
        'value', v_huge_sand_turtle.value,
        'chance', 76.0,
        'roll_range', jsonb_build_object('start', 24000, 'end', 99999)
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
