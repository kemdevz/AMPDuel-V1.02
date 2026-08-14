ALTER TABLE public.deposits
  ADD COLUMN IF NOT EXISTS bot_username text,
  ADD COLUMN IF NOT EXISTS server_job_id text,
  ADD COLUMN IF NOT EXISTS roblox_trade_id text,
  ADD COLUMN IF NOT EXISTS place_id bigint,
  ADD COLUMN IF NOT EXISTS pet_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gem_amount bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payload_version smallint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS source_payload jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.deposits AS deposit
SET pet_count = (
      SELECT count(*) FILTER (
        WHERE lower(COALESCE(item->>'name', '')) !~ '^[0-9]+[kmb]? gems$'
      )::integer
      FROM jsonb_array_elements(deposit.items) AS deposited(item)
    ),
    gem_amount = (
      SELECT COALESCE(sum(
        CASE
          WHEN lower(COALESCE(item->>'name', '')) ~ '^[0-9]+[kmb]? gems$'
            THEN COALESCE((item->>'value')::bigint, 0)
          ELSE 0
        END
      ), 0)::bigint
      FROM jsonb_array_elements(deposit.items) AS deposited(item)
    )
WHERE deposit.pet_count = 0
  AND deposit.gem_amount = 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.deposits'::regclass
      AND conname = 'deposits_audit_counts_check'
  ) THEN
    ALTER TABLE public.deposits
      ADD CONSTRAINT deposits_audit_counts_check
      CHECK (
        pet_count >= 0
        AND gem_amount >= 0
        AND pet_count <= item_count
        AND payload_version > 0
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.deposits'::regclass
      AND conname = 'deposits_source_payload_check'
  ) THEN
    ALTER TABLE public.deposits
      ADD CONSTRAINT deposits_source_payload_check
      CHECK (jsonb_typeof(source_payload) = 'object');
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.record_ps99_deposit_v2(
  p_profile_id uuid,
  p_roblox_id text,
  p_external_trade_id text,
  p_bot_roblox_id text,
  p_item_names jsonb,
  p_metadata jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base_result jsonb;
  deposit_id uuid;
  updated_deposit public.deposits%ROWTYPE;
  normalized_metadata jsonb := COALESCE(p_metadata, '{}'::jsonb);
  calculated_pet_count integer;
  calculated_gem_amount bigint;
  metadata_place_id bigint;
  metadata_payload_version smallint;
BEGIN
  IF jsonb_typeof(normalized_metadata) <> 'object'
     OR pg_column_size(normalized_metadata) > 65536 THEN
    RAISE EXCEPTION 'The PS99 deposit metadata is invalid.';
  END IF;

  IF length(COALESCE(normalized_metadata->>'bot_username', '')) > 100
     OR length(COALESCE(normalized_metadata->>'server_job_id', '')) > 128
     OR length(COALESCE(normalized_metadata->>'roblox_trade_id', '')) > 128 THEN
    RAISE EXCEPTION 'The PS99 deposit metadata is too long.';
  END IF;

  IF COALESCE(normalized_metadata->>'place_id', '') ~ '^[0-9]{1,18}$' THEN
    metadata_place_id := (normalized_metadata->>'place_id')::bigint;
  ELSE
    metadata_place_id := NULL;
  END IF;

  IF COALESCE(normalized_metadata->>'payload_version', '') ~ '^[0-9]{1,5}$' THEN
    metadata_payload_version := LEAST(
      32767,
      GREATEST(1, (normalized_metadata->>'payload_version')::integer)
    )::smallint;
  ELSE
    metadata_payload_version := 1;
  END IF;

  base_result := public.record_ps99_deposit(
    p_profile_id,
    p_roblox_id,
    p_external_trade_id,
    p_bot_roblox_id,
    p_item_names
  );

  deposit_id := NULLIF(base_result->'deposit'->>'id', '')::uuid;
  IF deposit_id IS NULL THEN
    RAISE EXCEPTION 'The PS99 deposit audit row was not returned.';
  END IF;

  SELECT
    count(*) FILTER (
      WHERE lower(COALESCE(item->>'name', '')) !~ '^[0-9]+[kmb]? gems$'
    )::integer,
    COALESCE(sum(
      CASE
        WHEN lower(COALESCE(item->>'name', '')) ~ '^[0-9]+[kmb]? gems$'
          THEN COALESCE((item->>'value')::bigint, 0)
        ELSE 0
      END
    ), 0)::bigint
  INTO calculated_pet_count, calculated_gem_amount
  FROM jsonb_array_elements(base_result->'deposit'->'items') AS deposited(item);

  UPDATE public.deposits
  SET bot_username = NULLIF(btrim(normalized_metadata->>'bot_username'), ''),
      server_job_id = NULLIF(btrim(normalized_metadata->>'server_job_id'), ''),
      roblox_trade_id = NULLIF(btrim(normalized_metadata->>'roblox_trade_id'), ''),
      place_id = metadata_place_id,
      pet_count = COALESCE(calculated_pet_count, 0),
      gem_amount = COALESCE(calculated_gem_amount, 0),
      payload_version = metadata_payload_version,
      source_payload = jsonb_strip_nulls(normalized_metadata)
  WHERE id = deposit_id
  RETURNING * INTO updated_deposit;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The PS99 deposit audit row could not be updated.';
  END IF;

  RETURN jsonb_build_object(
    'duplicate', COALESCE((base_result->>'duplicate')::boolean, false),
    'deposit', to_jsonb(updated_deposit)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_ps99_deposit_v2(uuid, text, text, text, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_ps99_deposit_v2(uuid, text, text, text, jsonb, jsonb)
  TO service_role;

COMMENT ON FUNCTION public.record_ps99_deposit_v2(uuid, text, text, text, jsonb, jsonb) IS
  'Records an idempotent PS99 deposit and enriches its immutable audit row with validated trade metadata.';
