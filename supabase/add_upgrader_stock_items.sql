-- Run 20260808020000_create_upgrader_stock.sql first.
-- Replace the UUID and copy count below, then run this in the Supabase SQL editor.
-- The name, value, image and type are copied from public.items so they stay accurate.

INSERT INTO public.upgrader_stock (
  item_id,
  name,
  value,
  image_url,
  type,
  from_user
)
SELECT
  item.id,
  item.name,
  item.value,
  item.image_url,
  item.type,
  'manual'
FROM public.items AS item
CROSS JOIN generate_series(1, 1) AS copy_number -- Change the final 1 to the number of copies.
WHERE item.id = '00000000-0000-0000-0000-000000000000'::uuid; -- Replace with the item UUID.

-- Add several different catalog items at once by replacing these UUIDs:
-- INSERT INTO public.upgrader_stock (item_id, name, value, image_url, type, from_user)
-- SELECT item.id, item.name, item.value, item.image_url, item.type, 'manual'
-- FROM public.items AS item
-- WHERE item.id IN (
--   '00000000-0000-0000-0000-000000000000'::uuid,
--   '11111111-1111-1111-1111-111111111111'::uuid
-- );
