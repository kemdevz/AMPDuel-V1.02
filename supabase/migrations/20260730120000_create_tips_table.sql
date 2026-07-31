CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.tips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid()
);

ALTER TABLE public.tips
  ADD COLUMN IF NOT EXISTS tip_type text NOT NULL DEFAULT 'coins',
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'completed',
  ADD COLUMN IF NOT EXISTS sender_profile_id text,
  ADD COLUMN IF NOT EXISTS recipient_profile_id text,
  ADD COLUMN IF NOT EXISTS sender_roblox_id text,
  ADD COLUMN IF NOT EXISTS recipient_roblox_id text,
  ADD COLUMN IF NOT EXISTS sender_username text,
  ADD COLUMN IF NOT EXISTS recipient_username text,
  ADD COLUMN IF NOT EXISTS items jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS item_uuids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS item_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS item_total_value bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS coin_amount bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_value bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS show_in_chat boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sent_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS received_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tips_tip_type_check'
      AND conrelid = 'public.tips'::regclass
  ) THEN
    ALTER TABLE public.tips
      ADD CONSTRAINT tips_tip_type_check
      CHECK (tip_type IN ('coins', 'items'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tips_status_check'
      AND conrelid = 'public.tips'::regclass
  ) THEN
    ALTER TABLE public.tips
      ADD CONSTRAINT tips_status_check
      CHECK (status IN ('pending', 'completed', 'failed', 'reversed'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tips_values_check'
      AND conrelid = 'public.tips'::regclass
  ) THEN
    ALTER TABLE public.tips
      ADD CONSTRAINT tips_values_check
      CHECK (
        item_count >= 0
        AND item_total_value >= 0
        AND coin_amount >= 0
        AND total_value >= 0
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tips_payload_check'
      AND conrelid = 'public.tips'::regclass
  ) THEN
    ALTER TABLE public.tips
      ADD CONSTRAINT tips_payload_check
      CHECK (
        (tip_type = 'coins' AND coin_amount > 0 AND item_count = 0)
        OR
        (tip_type = 'items' AND coin_amount = 0 AND item_count > 0)
      );
  END IF;

END $$;

-- Profile IDs are deliberately stored as text. Existing BloxyBattles databases
-- use either text or uuid for user_profiles.id, so cross-table foreign keys
-- would make this migration incompatible with one of those schema versions.
ALTER TABLE public.tips
  DROP CONSTRAINT IF EXISTS tips_sender_profile_id_fkey,
  DROP CONSTRAINT IF EXISTS tips_recipient_profile_id_fkey;

CREATE INDEX IF NOT EXISTS tips_sender_profile_id_idx
  ON public.tips (sender_profile_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS tips_recipient_profile_id_idx
  ON public.tips (recipient_profile_id, received_at DESC);

CREATE INDEX IF NOT EXISTS tips_sender_roblox_id_idx
  ON public.tips (sender_roblox_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS tips_recipient_roblox_id_idx
  ON public.tips (recipient_roblox_id, received_at DESC);

CREATE INDEX IF NOT EXISTS tips_tip_type_idx
  ON public.tips (tip_type, sent_at DESC);

ALTER TABLE public.tips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read tips" ON public.tips;
CREATE POLICY "Allow public read tips"
  ON public.tips
  FOR SELECT
  USING (true);

REVOKE INSERT, UPDATE, DELETE ON public.tips FROM anon, authenticated;
GRANT SELECT ON public.tips TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_tip_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_tips_updated_at ON public.tips;
CREATE TRIGGER set_tips_updated_at
  BEFORE UPDATE ON public.tips
  FOR EACH ROW
  EXECUTE FUNCTION public.set_tip_updated_at();

CREATE OR REPLACE FUNCTION public.send_coin_tip(
  p_sender_profile_id text,
  p_recipient_profile_id text,
  p_sender_roblox_id text,
  p_recipient_roblox_id text,
  p_sender_username text,
  p_recipient_username text,
  p_coin_amount bigint,
  p_show_in_chat boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sender_balance bigint;
  v_tip_id uuid;
BEGIN
  IF p_sender_profile_id IS NULL OR btrim(p_sender_profile_id) = '' THEN
    RAISE EXCEPTION 'Sender profile is required.';
  END IF;

  IF p_recipient_profile_id IS NULL OR btrim(p_recipient_profile_id) = '' THEN
    RAISE EXCEPTION 'Recipient profile is required.';
  END IF;

  IF p_sender_profile_id = p_recipient_profile_id THEN
    RAISE EXCEPTION 'You cannot tip coins to yourself.';
  END IF;

  IF p_coin_amount IS NULL OR p_coin_amount <= 0 THEN
    RAISE EXCEPTION 'Coin amount must be greater than zero.';
  END IF;

  PERFORM 1
  FROM public.user_profiles
  WHERE id::text IN (p_sender_profile_id, p_recipient_profile_id)
  ORDER BY id
  FOR UPDATE;

  SELECT balance::bigint
  INTO v_sender_balance
  FROM public.user_profiles
  WHERE id::text = p_sender_profile_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sender profile could not be found.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_profiles WHERE id::text = p_recipient_profile_id
  ) THEN
    RAISE EXCEPTION 'Recipient profile could not be found.';
  END IF;

  IF COALESCE(v_sender_balance, 0) < p_coin_amount THEN
    RAISE EXCEPTION 'Insufficient coins.';
  END IF;

  UPDATE public.user_profiles
  SET balance = COALESCE(balance, 0) - p_coin_amount
  WHERE id::text = p_sender_profile_id;

  UPDATE public.user_profiles
  SET balance = COALESCE(balance, 0) + p_coin_amount
  WHERE id::text = p_recipient_profile_id;

  INSERT INTO public.tips (
    tip_type,
    status,
    sender_profile_id,
    recipient_profile_id,
    sender_roblox_id,
    recipient_roblox_id,
    sender_username,
    recipient_username,
    coin_amount,
    total_value,
    show_in_chat,
    sent_at,
    received_at
  )
  VALUES (
    'coins',
    'completed',
    p_sender_profile_id,
    p_recipient_profile_id,
    NULLIF(btrim(p_sender_roblox_id), ''),
    NULLIF(btrim(p_recipient_roblox_id), ''),
    NULLIF(btrim(p_sender_username), ''),
    NULLIF(btrim(p_recipient_username), ''),
    p_coin_amount,
    p_coin_amount,
    COALESCE(p_show_in_chat, false),
    now(),
    now()
  )
  RETURNING id INTO v_tip_id;

  RETURN v_tip_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.send_item_tip(
  p_sender_profile_id text,
  p_sender_owner_ids text[],
  p_recipient_profile_id text,
  p_sender_roblox_id text,
  p_recipient_roblox_id text,
  p_sender_username text,
  p_recipient_username text,
  p_item_uuids uuid[],
  p_show_in_chat boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requested_count integer;
  v_item_count integer;
  v_item_total_value bigint;
  v_items jsonb;
  v_tip_id uuid;
  v_inventory_user_id_type text;
BEGIN
  IF p_sender_profile_id IS NULL OR btrim(p_sender_profile_id) = '' THEN
    RAISE EXCEPTION 'Sender profile is required.';
  END IF;

  IF p_recipient_profile_id IS NULL OR btrim(p_recipient_profile_id) = '' THEN
    RAISE EXCEPTION 'Recipient profile is required.';
  END IF;

  IF p_sender_profile_id = p_recipient_profile_id THEN
    RAISE EXCEPTION 'You cannot tip items to yourself.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_profiles WHERE id::text = p_recipient_profile_id
  ) THEN
    RAISE EXCEPTION 'Recipient profile could not be found.';
  END IF;

  v_requested_count := COALESCE(cardinality(p_item_uuids), 0);
  IF v_requested_count = 0 THEN
    RAISE EXCEPTION 'Select at least one item to tip.';
  END IF;

  PERFORM 1
  FROM public.inventory_items
  WHERE id = ANY(p_item_uuids)
    AND user_id::text = ANY(p_sender_owner_ids)
  ORDER BY id
  FOR UPDATE;

  SELECT
    count(*)::integer,
    COALESCE(sum(COALESCE(value, 0)), 0)::bigint,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'inventory_item_uuid', id,
          'item_uuid', item_id,
          'name', name,
          'value', COALESCE(value, 0),
          'image_url', image_url,
          'type', type
        )
        ORDER BY created_at, id
      ),
      '[]'::jsonb
    )
  INTO v_item_count, v_item_total_value, v_items
  FROM public.inventory_items
  WHERE id = ANY(p_item_uuids)
    AND user_id::text = ANY(p_sender_owner_ids);

  IF v_item_count <> v_requested_count THEN
    RAISE EXCEPTION 'One or more selected items are no longer available.';
  END IF;

  SELECT format_type(attribute.atttypid, attribute.atttypmod)
  INTO v_inventory_user_id_type
  FROM pg_attribute AS attribute
  WHERE attribute.attrelid = 'public.inventory_items'::regclass
    AND attribute.attname = 'user_id'
    AND NOT attribute.attisdropped;

  IF v_inventory_user_id_type IS NULL THEN
    RAISE EXCEPTION 'Inventory owner column could not be found.';
  END IF;

  EXECUTE format(
    'UPDATE public.inventory_items
     SET user_id = $1::%s
     WHERE id = ANY($2)
       AND user_id::text = ANY($3)',
    v_inventory_user_id_type
  )
  USING p_recipient_profile_id, p_item_uuids, p_sender_owner_ids;

  INSERT INTO public.tips (
    tip_type,
    status,
    sender_profile_id,
    recipient_profile_id,
    sender_roblox_id,
    recipient_roblox_id,
    sender_username,
    recipient_username,
    items,
    item_uuids,
    item_count,
    item_total_value,
    total_value,
    show_in_chat,
    sent_at,
    received_at
  )
  VALUES (
    'items',
    'completed',
    p_sender_profile_id,
    p_recipient_profile_id,
    NULLIF(btrim(p_sender_roblox_id), ''),
    NULLIF(btrim(p_recipient_roblox_id), ''),
    NULLIF(btrim(p_sender_username), ''),
    NULLIF(btrim(p_recipient_username), ''),
    v_items,
    p_item_uuids,
    v_item_count,
    v_item_total_value,
    v_item_total_value,
    COALESCE(p_show_in_chat, false),
    now(),
    now()
  )
  RETURNING id INTO v_tip_id;

  RETURN v_tip_id;
END;
$$;

REVOKE ALL ON FUNCTION public.send_coin_tip(text, text, text, text, text, text, bigint, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_coin_tip(text, text, text, text, text, text, bigint, boolean)
  TO anon, authenticated;

REVOKE ALL ON FUNCTION public.send_item_tip(text, text[], text, text, text, text, text, uuid[], boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_item_tip(text, text[], text, text, text, text, text, uuid[], boolean)
  TO anon, authenticated;
