-- Roll is a shared global round. A round does not belong to one profile;
-- each player's wager and settlement belongs in roll_bets instead.

DROP INDEX IF EXISTS public.roll_rounds_profile_id_idx;
DROP INDEX IF EXISTS public.roll_rounds_game_state_idx;

ALTER TABLE public.roll_rounds
  DROP COLUMN IF EXISTS profile_id,
  DROP COLUMN IF EXISTS username,
  DROP COLUMN IF EXISTS avatar_url;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'roll_rounds' AND column_name = 'items'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'roll_rounds' AND column_name = 'reel_items'
  ) THEN
    ALTER TABLE public.roll_rounds RENAME COLUMN items TO reel_items;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'roll_rounds' AND column_name = 'game_state'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'roll_rounds' AND column_name = 'status'
  ) THEN
    ALTER TABLE public.roll_rounds RENAME COLUMN game_state TO status;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'roll_rounds' AND column_name = 'started_at'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'roll_rounds' AND column_name = 'rolling_started_at'
  ) THEN
    ALTER TABLE public.roll_rounds RENAME COLUMN started_at TO rolling_started_at;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'roll_rounds' AND column_name = 'ended_at'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'roll_rounds' AND column_name = 'settled_at'
  ) THEN
    ALTER TABLE public.roll_rounds RENAME COLUMN ended_at TO settled_at;
  END IF;
END $$;

ALTER TABLE public.roll_rounds
  ALTER COLUMN nonce TYPE bigint USING nonce::bigint,
  ALTER COLUMN result_multiplier DROP NOT NULL,
  ALTER COLUMN result_multiplier TYPE numeric(12, 4) USING result_multiplier::numeric(12, 4),
  ADD COLUMN IF NOT EXISTS server_seed_hash text,
  ADD COLUMN IF NOT EXISTS revealed_server_seed text,
  ADD COLUMN IF NOT EXISTS reel_multipliers jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS result_index integer,
  ADD COLUMN IF NOT EXISTS winning_item_id uuid REFERENCES public.items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS winning_item_name text,
  ADD COLUMN IF NOT EXISTS winning_item_value bigint,
  ADD COLUMN IF NOT EXISTS betting_opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS betting_closes_at timestamptz;

UPDATE public.roll_rounds
SET betting_opened_at = created_at
WHERE betting_opened_at IS NULL;

ALTER TABLE public.roll_rounds
  ALTER COLUMN betting_opened_at SET DEFAULT now(),
  ALTER COLUMN betting_opened_at SET NOT NULL;

UPDATE public.roll_rounds
SET status = CASE status
  WHEN 'ended' THEN 'settled'
  WHEN 'complete' THEN 'settled'
  WHEN 'void' THEN 'cancelled'
  ELSE status
END;

ALTER TABLE public.roll_rounds DROP CONSTRAINT IF EXISTS roll_rounds_status_check;
ALTER TABLE public.roll_rounds ADD CONSTRAINT roll_rounds_status_check
  CHECK (status IN ('countdown', 'rolling', 'settled', 'cancelled'));

ALTER TABLE public.roll_rounds DROP CONSTRAINT IF EXISTS roll_rounds_result_index_check;
ALTER TABLE public.roll_rounds ADD CONSTRAINT roll_rounds_result_index_check
  CHECK (result_index IS NULL OR result_index >= 0);

ALTER TABLE public.roll_rounds DROP CONSTRAINT IF EXISTS roll_rounds_winning_item_value_check;
ALTER TABLE public.roll_rounds ADD CONSTRAINT roll_rounds_winning_item_value_check
  CHECK (winning_item_value IS NULL OR winning_item_value >= 0);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'roll_bets' AND column_name = 'username'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'roll_bets' AND column_name = 'username_snapshot'
  ) THEN
    ALTER TABLE public.roll_bets RENAME COLUMN username TO username_snapshot;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'roll_bets' AND column_name = 'avatar_url'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'roll_bets' AND column_name = 'avatar_url_snapshot'
  ) THEN
    ALTER TABLE public.roll_bets RENAME COLUMN avatar_url TO avatar_url_snapshot;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'roll_bets' AND column_name = 'bet_amount'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'roll_bets' AND column_name = 'wager_amount'
  ) THEN
    ALTER TABLE public.roll_bets RENAME COLUMN bet_amount TO wager_amount;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'roll_bets' AND column_name = 'chosen_multiplier'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'roll_bets' AND column_name = 'target_multiplier'
  ) THEN
    ALTER TABLE public.roll_bets RENAME COLUMN chosen_multiplier TO target_multiplier;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'roll_bets' AND column_name = 'potential_win'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'roll_bets' AND column_name = 'potential_payout'
  ) THEN
    ALTER TABLE public.roll_bets RENAME COLUMN potential_win TO potential_payout;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'roll_bets' AND column_name = 'actual_win'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'roll_bets' AND column_name = 'payout_amount'
  ) THEN
    ALTER TABLE public.roll_bets RENAME COLUMN actual_win TO payout_amount;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'roll_bets' AND column_name = 'created_at'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'roll_bets' AND column_name = 'placed_at'
  ) THEN
    ALTER TABLE public.roll_bets RENAME COLUMN created_at TO placed_at;
  END IF;
END $$;

-- Match the deployed user_profiles primary-key type. Older project installs use
-- text while the current production schema uses uuid.
DO $$
DECLARE
  profile_id_type text;
BEGIN
  SELECT format_type(attribute.atttypid, attribute.atttypmod)
  INTO profile_id_type
  FROM pg_attribute AS attribute
  WHERE attribute.attrelid = 'public.user_profiles'::regclass
    AND attribute.attname = 'id'
    AND attribute.attnum > 0
    AND NOT attribute.attisdropped;

  IF profile_id_type IS NULL THEN
    RAISE EXCEPTION 'Unable to determine public.user_profiles.id type';
  END IF;

  EXECUTE format(
    'ALTER TABLE public.roll_bets ALTER COLUMN profile_id TYPE %s USING profile_id::text::%s',
    profile_id_type,
    profile_id_type
  );
END $$;

ALTER TABLE public.roll_bets
  ALTER COLUMN wager_amount TYPE bigint USING wager_amount::bigint,
  ALTER COLUMN target_multiplier TYPE numeric(12, 4) USING target_multiplier::numeric(12, 4),
  ALTER COLUMN potential_payout TYPE bigint USING potential_payout::bigint,
  ALTER COLUMN payout_amount TYPE bigint USING payout_amount::bigint,
  ADD COLUMN IF NOT EXISTS outcome text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS balance_before bigint,
  ADD COLUMN IF NOT EXISTS balance_after_wager bigint,
  ADD COLUMN IF NOT EXISTS balance_after_settlement bigint,
  ADD COLUMN IF NOT EXISTS settled_at timestamptz;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'roll_bets' AND column_name = 'won'
  ) THEN
    EXECUTE $sql$
      UPDATE public.roll_bets
      SET outcome = CASE
        WHEN won IS TRUE THEN 'won'
        WHEN settled_at IS NOT NULL OR payout_amount > 0 THEN 'lost'
        ELSE 'pending'
      END
    $sql$;
  END IF;
END $$;

ALTER TABLE public.roll_bets DROP COLUMN IF EXISTS won;

ALTER TABLE public.roll_bets DROP CONSTRAINT IF EXISTS roll_bets_outcome_check;
ALTER TABLE public.roll_bets ADD CONSTRAINT roll_bets_outcome_check
  CHECK (outcome IN ('pending', 'won', 'lost', 'refunded'));

ALTER TABLE public.roll_bets DROP CONSTRAINT IF EXISTS roll_bets_wager_amount_check;
ALTER TABLE public.roll_bets ADD CONSTRAINT roll_bets_wager_amount_check
  CHECK (wager_amount > 0);

ALTER TABLE public.roll_bets DROP CONSTRAINT IF EXISTS roll_bets_target_multiplier_check;
ALTER TABLE public.roll_bets ADD CONSTRAINT roll_bets_target_multiplier_check
  CHECK (target_multiplier >= 1);

ALTER TABLE public.roll_bets DROP CONSTRAINT IF EXISTS roll_bets_payout_amount_check;
ALTER TABLE public.roll_bets ADD CONSTRAINT roll_bets_payout_amount_check
  CHECK (potential_payout >= 0 AND payout_amount >= 0);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'roll_bets_profile_id_fkey'
      AND conrelid = 'public.roll_bets'::regclass
  ) THEN
    ALTER TABLE public.roll_bets
      ADD CONSTRAINT roll_bets_profile_id_fkey
      FOREIGN KEY (profile_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS roll_bets_round_profile_uidx
  ON public.roll_bets (round_id, profile_id);
CREATE INDEX IF NOT EXISTS roll_rounds_status_created_at_idx
  ON public.roll_rounds (status, created_at DESC);
CREATE INDEX IF NOT EXISTS roll_bets_profile_placed_at_idx
  ON public.roll_bets (profile_id, placed_at DESC);

-- Roll writes move balance and determine payouts, so only the trusted server role
-- may access these ledger tables directly. Clients use authenticated API routes.
DROP POLICY IF EXISTS "Users can view roll_rounds" ON public.roll_rounds;
DROP POLICY IF EXISTS "Users can insert roll_rounds" ON public.roll_rounds;
DROP POLICY IF EXISTS "Users can update roll_rounds" ON public.roll_rounds;
DROP POLICY IF EXISTS "Users can view roll_bets" ON public.roll_bets;
DROP POLICY IF EXISTS "Users can insert roll_bets" ON public.roll_bets;
DROP POLICY IF EXISTS "Users can update roll_bets" ON public.roll_bets;

ALTER TABLE public.roll_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roll_bets ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.roll_rounds FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.roll_bets FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.roll_rounds TO service_role;
GRANT ALL ON public.roll_bets TO service_role;
