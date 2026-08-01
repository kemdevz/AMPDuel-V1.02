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
  '00000000-0000-4000-8000-000000000001'::uuid,
  'Test Case',
  100000000,
  '/cases/test/test-case.png',
  '[
    {
      "item_id": "533f1360-2ca0-443f-a847-69ea7912c246",
      "name": "Titanic Fire Dragon",
      "image_url": "https://biggamesapi.io/image/15163496528",
      "value": 23750000,
      "chance": 0.03,
      "roll_range": {
        "start": 0,
        "end": 29
      }
    },
    {
      "item_id": "ac2b6eb8-ce2d-42e6-b2ab-3e75186e256d",
      "name": "Titanic Wild Fire Agony",
      "image_url": "https://biggamesapi.io/image/80761300754593",
      "value": 14000000,
      "chance": 0.08,
      "roll_range": {
        "start": 30,
        "end": 109
      }
    },
    {
      "item_id": "585f4be4-c436-4899-a8b1-75642896164d",
      "name": "Titanic Inferno Cat",
      "image_url": "https://biggamesapi.io/image/128197933261486",
      "value": 4400000,
      "chance": 0.15,
      "roll_range": {
        "start": 110,
        "end": 259
      }
    },
    {
      "item_id": "3420ee0f-8743-43b6-a237-8e62ef9cdc59",
      "name": "Huge Inferno Cat",
      "image_url": "https://biggamesapi.io/image/14976463498",
      "value": 4000000,
      "chance": 1.0,
      "roll_range": {
        "start": 260,
        "end": 1259
      }
    },
    {
      "item_id": "b5bcd995-949b-4b41-9bd7-5fa23f80952e",
      "name": "Huge Redstone Cat",
      "image_url": "https://biggamesapi.io/image/14976533671",
      "value": 230000,
      "chance": 4.5,
      "roll_range": {
        "start": 1260,
        "end": 5759
      }
    },
    {
      "item_id": "20c7c722-6ca2-4568-b92c-e9ce4ae6571b",
      "name": "Huge Pirate Parrot",
      "image_url": "https://biggamesapi.io/image/14976518880",
      "value": 190000,
      "chance": 12.0,
      "roll_range": {
        "start": 5760,
        "end": 17759
      }
    },
    {
      "item_id": "6de9327b-5f4b-4c60-ad17-030ca420395f",
      "name": "Huge Fire Horse",
      "image_url": "https://biggamesapi.io/image/15480654527",
      "value": 97000,
      "chance": 28.0,
      "roll_range": {
        "start": 17760,
        "end": 45759
      }
    },
    {
      "item_id": "614a21f0-ac22-4856-abd2-f2d932a9bdb1",
      "name": "Huge Red Wolf",
      "image_url": "https://biggamesapi.io/image/138120594404992",
      "value": 16500,
      "chance": 54.24,
      "roll_range": {
        "start": 45760,
        "end": 99999
      }
    }
  ]'::jsonb,
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
