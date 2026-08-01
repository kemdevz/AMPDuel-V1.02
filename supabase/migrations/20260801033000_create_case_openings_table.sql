CREATE TABLE IF NOT EXISTS public.case_openings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL,
  batch_position smallint NOT NULL CHECK (batch_position BETWEEN 0 AND 3),
  batch_quantity smallint NOT NULL CHECK (batch_quantity BETWEEN 1 AND 4),
  case_id uuid NOT NULL,
  user_id uuid NOT NULL,

  case_name text NOT NULL CHECK (length(trim(case_name)) > 0),
  case_price bigint NOT NULL CHECK (case_price >= 0),
  case_items_snapshot jsonb NOT NULL
    CHECK (jsonb_typeof(case_items_snapshot) = 'array' AND jsonb_array_length(case_items_snapshot) > 0),

  balance_before bigint NOT NULL CHECK (balance_before >= 0),
  coin_payout bigint NOT NULL CHECK (coin_payout >= 0),
  balance_after bigint NOT NULL CHECK (balance_after >= 0),

  winning_item_id uuid,
  winning_item_name text NOT NULL CHECK (length(trim(winning_item_name)) > 0),
  winning_item_value bigint NOT NULL CHECK (winning_item_value >= 0),
  winning_item_image_url text,
  winning_item_type text,
  winning_item_chance numeric(8, 5) NOT NULL
    CHECK (winning_item_chance > 0 AND winning_item_chance <= 100),

  roll integer NOT NULL CHECK (roll BETWEEN 0 AND 99999),
  roll_range_start integer NOT NULL CHECK (roll_range_start BETWEEN 0 AND 99999),
  roll_range_end integer NOT NULL CHECK (roll_range_end BETWEEN 0 AND 99999),

  fairness_seed_id uuid NOT NULL,
  server_seed_hash text NOT NULL CHECK (server_seed_hash ~ '^[0-9a-f]{64}$'),
  server_seed text,
  client_seed text NOT NULL CHECK (length(client_seed) BETWEEN 1 AND 128),
  nonce bigint NOT NULL CHECK (nonce >= 0),

  purchased_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT case_openings_case_id_fkey
    FOREIGN KEY (case_id) REFERENCES public.cases(uuid) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT case_openings_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.user_profiles(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT case_openings_winning_item_id_fkey
    FOREIGN KEY (winning_item_id) REFERENCES public.items(id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT case_openings_balance_calculation_check
    CHECK (balance_before >= case_price AND balance_after = balance_before - case_price + coin_payout),
  CONSTRAINT case_openings_payout_matches_item_value_check
    CHECK (coin_payout = winning_item_value),
  CONSTRAINT case_openings_roll_range_check
    CHECK (roll_range_start <= roll_range_end AND roll BETWEEN roll_range_start AND roll_range_end),
  CONSTRAINT case_openings_batch_position_check
    CHECK (batch_position < batch_quantity),
  CONSTRAINT case_openings_resolution_time_check
    CHECK (resolved_at >= purchased_at),
  CONSTRAINT case_openings_user_batch_position_key
    UNIQUE (user_id, batch_id, batch_position),
  CONSTRAINT case_openings_user_seed_nonce_key
    UNIQUE (user_id, fairness_seed_id, nonce)
);

CREATE INDEX IF NOT EXISTS case_openings_user_purchased_at_idx
  ON public.case_openings (user_id, purchased_at DESC);
CREATE INDEX IF NOT EXISTS case_openings_case_purchased_at_idx
  ON public.case_openings (case_id, purchased_at DESC);
CREATE INDEX IF NOT EXISTS case_openings_batch_id_idx
  ON public.case_openings (batch_id);
CREATE INDEX IF NOT EXISTS case_openings_winning_item_id_idx
  ON public.case_openings (winning_item_id);

ALTER TABLE public.case_openings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own case openings" ON public.case_openings;
CREATE POLICY "Users can view own case openings"
ON public.case_openings
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

REVOKE ALL ON public.case_openings FROM anon, authenticated;
GRANT SELECT ON public.case_openings TO authenticated;

COMMENT ON TABLE public.case_openings IS
  'Immutable balance-only case results. Displayed winning items are never inserted into inventory_items.';
COMMENT ON COLUMN public.case_openings.server_seed IS
  'NULL while this fairness seed is active; revealed only after the user rotates to a new server seed.';
COMMENT ON COLUMN public.case_openings.case_items_snapshot IS
  'Complete cases.items configuration at purchase time for historical roll verification.';
