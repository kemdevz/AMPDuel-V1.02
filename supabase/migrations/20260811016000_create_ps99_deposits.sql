CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.deposits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.user_profiles(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  roblox_id text NOT NULL CHECK (roblox_id ~ '^[0-9]+$'),
  username text NOT NULL,
  game text NOT NULL DEFAULT 'PS99' CHECK (game = 'PS99'),
  external_trade_id text NOT NULL CHECK (length(external_trade_id) BETWEEN 1 AND 128),
  bot_roblox_id text NOT NULL CHECK (bot_roblox_id ~ '^[0-9]+$'),
  items jsonb NOT NULL CHECK (jsonb_typeof(items) = 'array' AND jsonb_array_length(items) > 0),
  inventory_item_ids uuid[] NOT NULL,
  item_count integer NOT NULL CHECK (item_count > 0 AND item_count <= 50),
  total_value bigint NOT NULL CHECK (total_value > 0),
  deposited_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT deposits_trade_unique UNIQUE (game, bot_roblox_id, external_trade_id)
);

CREATE INDEX IF NOT EXISTS deposits_profile_time_idx
  ON public.deposits (profile_id, deposited_at DESC);
CREATE INDEX IF NOT EXISTS deposits_roblox_time_idx
  ON public.deposits (roblox_id, deposited_at DESC);

ALTER TABLE public.deposits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.deposits FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.deposits TO service_role;

DROP POLICY IF EXISTS "Users can view own deposits" ON public.deposits;
CREATE POLICY "Users can view own deposits"
ON public.deposits FOR SELECT TO authenticated
USING (profile_id = auth.uid());
GRANT SELECT ON public.deposits TO authenticated;

CREATE OR REPLACE FUNCTION public.record_ps99_deposit(
  p_profile_id uuid,
  p_roblox_id text,
  p_external_trade_id text,
  p_bot_roblox_id text,
  p_item_names jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_profile public.user_profiles%ROWTYPE;
  existing_deposit public.deposits%ROWTYPE;
  created_deposit public.deposits%ROWTYPE;
  resolved_items jsonb;
  requested_count integer;
  resolved_count integer;
  deposit_value bigint;
  inventory_ids uuid[];
BEGIN
  IF p_profile_id IS NULL
     OR COALESCE(p_roblox_id, '') !~ '^[0-9]+$'
     OR NULLIF(btrim(p_external_trade_id), '') IS NULL
     OR length(p_external_trade_id) > 128
     OR COALESCE(p_bot_roblox_id, '') !~ '^[0-9]+$'
     OR COALESCE(jsonb_typeof(p_item_names), '') <> 'array' THEN
    RAISE EXCEPTION 'The PS99 deposit payload is invalid.';
  END IF;

  requested_count := jsonb_array_length(p_item_names);
  IF requested_count < 1 OR requested_count > 50 THEN
    RAISE EXCEPTION 'A PS99 deposit must contain between 1 and 50 items.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'ps99-deposit:' || p_bot_roblox_id || ':' || p_external_trade_id,
    0
  ));

  SELECT * INTO existing_deposit
  FROM public.deposits
  WHERE game = 'PS99'
    AND bot_roblox_id = p_bot_roblox_id
    AND external_trade_id = p_external_trade_id;
  IF FOUND THEN
    RETURN jsonb_build_object('duplicate', true, 'deposit', to_jsonb(existing_deposit));
  END IF;

  SELECT * INTO selected_profile
  FROM public.user_profiles
  WHERE id = p_profile_id AND roblox_id = p_roblox_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The PS99 deposit profile could not be verified.';
  END IF;

  WITH requested AS (
    SELECT btrim(value #>> '{}') AS item_name, ordinality
    FROM jsonb_array_elements(p_item_names) WITH ORDINALITY AS entry(value, ordinality)
  ), catalogued AS (
    SELECT
      requested.ordinality,
      catalog.id AS item_id,
      gen_random_uuid() AS inventory_id,
      gen_random_uuid() AS item_uuid,
      catalog.name,
      catalog.value,
      catalog.image_url,
      catalog.type
    FROM requested
    JOIN LATERAL (
      SELECT item.*
      FROM public.items AS item
      WHERE lower(item.name) = lower(requested.item_name)
        AND item.type = 'PS99'
        AND item.value > 0
      ORDER BY item.id
      LIMIT 1
    ) AS catalog ON true
  )
  SELECT
    count(*)::integer,
    COALESCE(sum(value), 0)::bigint,
    COALESCE(jsonb_agg(jsonb_build_object(
      'inventory_id', inventory_id,
      'item_id', item_id,
      'item_uuid', item_uuid,
      'name', name,
      'value', value,
      'image_url', image_url,
      'type', type
    ) ORDER BY ordinality), '[]'::jsonb)
  INTO resolved_count, deposit_value, resolved_items
  FROM catalogued;

  IF resolved_count <> requested_count THEN
    RAISE EXCEPTION 'One or more deposited PS99 items are missing from the supported item catalog.';
  END IF;

  INSERT INTO public.inventory_items (
    id, item_id, item_uuid, user_id, name, value, image_url, type, created_at, updated_at
  )
  SELECT
    (item->>'inventory_id')::uuid,
    (item->>'item_id')::uuid,
    (item->>'item_uuid')::uuid,
    p_profile_id::text,
    item->>'name',
    (item->>'value')::integer,
    NULLIF(item->>'image_url', ''),
    item->>'type',
    now(),
    now()
  FROM jsonb_array_elements(resolved_items) AS deposited(item);

  SELECT array_agg((item->>'inventory_id')::uuid)
  INTO inventory_ids
  FROM jsonb_array_elements(resolved_items) AS deposited(item);

  INSERT INTO public.deposits (
    profile_id, roblox_id, username, game, external_trade_id, bot_roblox_id,
    items, inventory_item_ids, item_count, total_value
  ) VALUES (
    p_profile_id,
    p_roblox_id,
    COALESCE(NULLIF(selected_profile.username, ''), 'Player'),
    'PS99',
    p_external_trade_id,
    p_bot_roblox_id,
    resolved_items,
    inventory_ids,
    resolved_count,
    deposit_value
  )
  RETURNING * INTO created_deposit;

  RETURN jsonb_build_object('duplicate', false, 'deposit', to_jsonb(created_deposit));
END;
$$;

REVOKE ALL ON FUNCTION public.record_ps99_deposit(uuid, text, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_ps99_deposit(uuid, text, text, text, jsonb)
  TO service_role;

COMMENT ON TABLE public.deposits IS
  'Immutable audit rows for completed PS99 bot trades credited to user inventory.';
