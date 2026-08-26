-- Bloxdice consolidated Supabase bootstrap.
-- Retained systems: profiles/auth, inventory, deposits, withdrawals, tips, chat support,
-- promotions/giveaways, security/admin controls, Coinflip, and its tax stock.
-- Retired games, rain, and exchanges are intentionally absent. Back up an existing
-- database before running this destructive reset/bootstrap script.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Remove retired database systems when applying this bootstrap to an existing
-- project. CASCADE also removes their table-bound triggers and policies.
DROP TABLE IF EXISTS public.rain_events CASCADE;
DROP TABLE IF EXISTS public.rain_state CASCADE;
DROP TABLE IF EXISTS public.exchange_stock CASCADE;
DROP TABLE IF EXISTS public.items_to_coins_exchanges CASCADE;
DROP TABLE IF EXISTS public.coins_to_items_exchanges CASCADE;
DROP TABLE IF EXISTS public.summer_event CASCADE;
DROP TABLE IF EXISTS public.case_commission_claims CASCADE;
DROP TABLE IF EXISTS public.case_openings CASCADE;
DROP TABLE IF EXISTS public.case_fairness_states CASCADE;
DROP TABLE IF EXISTS public.cases CASCADE;
DROP TABLE IF EXISTS public.case_battle_fairness_secrets CASCADE;
DROP TABLE IF EXISTS public.case_battle_games CASCADE;
DROP TABLE IF EXISTS public.bot_profiles CASCADE;
DROP TABLE IF EXISTS public.mines_fairness_states CASCADE;
DROP TABLE IF EXISTS public.mines_games CASCADE;
DROP TABLE IF EXISTS public.roll_bets CASCADE;
DROP TABLE IF EXISTS public.roll_rounds CASCADE;
DROP TABLE IF EXISTS public.blackjack_games CASCADE;
DROP TABLE IF EXISTS public.blackjack_fairness_states CASCADE;
DROP TABLE IF EXISTS public.upgrader_games CASCADE;
DROP TABLE IF EXISTS public.upgrader_fairness_states CASCADE;
DROP TABLE IF EXISTS public.upgrader_stock CASCADE;
DROP TABLE IF EXISTS public.jackpot_games CASCADE;
DROP TABLE IF EXISTS public.live_casino_transactions CASCADE;
DROP TABLE IF EXISTS public.live_casino_rounds CASCADE;
DROP TABLE IF EXISTS public.live_casino_sessions CASCADE;

DO $$
DECLARE
  retired_function record;
BEGIN
  FOR retired_function IN
    SELECT
      procedure.proname AS procedure_name,
      pg_get_function_identity_arguments(procedure.oid) AS identity_arguments
    FROM pg_proc AS procedure
    JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname ~ '^(rain|join_rain|settle_rain|tip_rain|case_|create_case|complete_case|claim_case|get_case|upgrader|roll|mines|blackjack|live_casino|exchange_|exchange_items|jackpot)'
  LOOP
    EXECUTE format(
      'DROP FUNCTION IF EXISTS public.%I(%s) CASCADE',
      retired_function.procedure_name,
      retired_function.identity_arguments
    );
  END LOOP;
END;
$$;

-- ===== 20260701_create_user_profiles_table.sql =====
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id uuid PRIMARY KEY,
  username text,
  avatar_url text,
  avatar_headshot_url text,
  balance integer DEFAULT 0,
  level integer DEFAULT 1,
  xp integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  ip_address text
);

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own user_profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can insert own user_profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can update own user_profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Allow public read/write user_profiles" ON public.user_profiles;

CREATE POLICY "Allow public read/write user_profiles"
  ON public.user_profiles
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- ===== 20260702_add_discord_linked_to_user_profiles.sql =====
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS discord_linked boolean DEFAULT false;

-- ===== 20260702_add_user_profile_stats_columns.sql =====
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS played integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS won integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lost integer DEFAULT 0;

-- ===== 20260702_create_inventory_items_table.sql =====
CREATE TABLE IF NOT EXISTS public.items (
  id uuid DEFAULT gen_random_uuid(),
  name text NOT NULL,
  value numeric(20, 4) NOT NULL DEFAULT 0,
  image_url text,
  type text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'items'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'items' AND column_name = 'id'
  ) THEN
    ALTER TABLE public.items ADD COLUMN id uuid;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.items'::regclass AND contype = 'p'
  ) THEN
    ALTER TABLE public.items ADD CONSTRAINT items_pkey PRIMARY KEY (id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid,
  user_id text NOT NULL,
  name text NOT NULL,
  value numeric(20, 4) NOT NULL DEFAULT 0,
  image_url text,
  type text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS item_id uuid;

ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS user_id text;

ALTER TABLE public.inventory_items
  DROP COLUMN IF EXISTS quantity;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'inventory_items'
      AND constraint_name = 'inventory_items_user_id_fkey'
  ) THEN
    ALTER TABLE public.inventory_items
      DROP CONSTRAINT inventory_items_user_id_fkey;
  END IF;
END $$;

ALTER TABLE public.inventory_items
  ALTER COLUMN user_id TYPE text USING user_id::text;

ALTER TABLE public.inventory_items
  ALTER COLUMN user_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'inventory_items'
      AND constraint_name = 'inventory_items_item_id_fkey'
  ) THEN
    ALTER TABLE public.inventory_items
      ADD CONSTRAINT inventory_items_item_id_fkey
      FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS inventory_items_user_id_idx ON public.inventory_items (user_id);
CREATE INDEX IF NOT EXISTS inventory_items_item_id_idx ON public.inventory_items (item_id);

ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own inventory_items" ON public.inventory_items;
DROP POLICY IF EXISTS "Users can insert own inventory_items" ON public.inventory_items;
DROP POLICY IF EXISTS "Users can update own inventory_items" ON public.inventory_items;
DROP POLICY IF EXISTS "Users can delete own inventory_items" ON public.inventory_items;

CREATE POLICY "Users can view own inventory_items"
  ON public.inventory_items
  FOR SELECT
  USING (true);

CREATE POLICY "Users can insert own inventory_items"
  ON public.inventory_items
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update own inventory_items"
  ON public.inventory_items
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can delete own inventory_items"
  ON public.inventory_items
  FOR DELETE
  USING (true);

-- Stable identity for each owned item instance.
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS item_uuid uuid;
UPDATE public.inventory_items SET item_uuid = id WHERE item_uuid IS NULL;
ALTER TABLE public.inventory_items
  ALTER COLUMN item_uuid SET DEFAULT gen_random_uuid(),
  ALTER COLUMN item_uuid SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS inventory_items_item_uuid_key
  ON public.inventory_items (item_uuid);

-- ===== 20260703_create_coinflip_games_table.sql =====
-- Create coinflip_games table
CREATE TABLE IF NOT EXISTS public.coinflip_games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_uuid text NOT NULL,
  creator_username text,
  creator_side text,
  creator_items jsonb,
  opponent_uuid text,
  opponent_username text,
  opponent_side text,
  opponent_items jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  canceled boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS coinflip_games_creator_uuid_idx ON public.coinflip_games (creator_uuid);
CREATE INDEX IF NOT EXISTS coinflip_games_opponent_uuid_idx ON public.coinflip_games (opponent_uuid);

ALTER TABLE public.coinflip_games ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view coinflip_games" ON public.coinflip_games;
DROP POLICY IF EXISTS "Users can insert coinflip_games" ON public.coinflip_games;
DROP POLICY IF EXISTS "Users can update coinflip_games" ON public.coinflip_games;
DROP POLICY IF EXISTS "Users can delete coinflip_games" ON public.coinflip_games;

CREATE POLICY "Users can view coinflip_games"
  ON public.coinflip_games
  FOR SELECT
  USING (true);

CREATE POLICY "Users can insert coinflip_games"
  ON public.coinflip_games
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update coinflip_games"
  ON public.coinflip_games
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can delete coinflip_games"
  ON public.coinflip_games
  FOR DELETE
  USING (true);

-- ===== 20260704_add_result_to_coinflip_games_table.sql =====
-- Add result column to coinflip_games
ALTER TABLE public.coinflip_games
  ADD COLUMN IF NOT EXISTS result text;

-- Optionally: index if you will query by result frequently
-- CREATE INDEX IF NOT EXISTS coinflip_games_result_idx ON public.coinflip_games (result);

-- ===== 20260705_create_withdraws_table.sql =====
CREATE TABLE IF NOT EXISTS public.withdraws (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  user_name text,
  item_id uuid,
  item_name text,
  image_url text,
  value integer NOT NULL DEFAULT 0,
  withdrawed_at timestamptz NOT NULL DEFAULT now(),
  canceled boolean NOT NULL DEFAULT false
);

ALTER TABLE public.withdraws
  ADD COLUMN IF NOT EXISTS user_id text;

ALTER TABLE public.withdraws
  ADD COLUMN IF NOT EXISTS user_name text;

ALTER TABLE public.withdraws
  ADD COLUMN IF NOT EXISTS item_id uuid;

ALTER TABLE public.withdraws
  ADD COLUMN IF NOT EXISTS item_name text;

ALTER TABLE public.withdraws
  ADD COLUMN IF NOT EXISTS withdrawed_at timestamptz;

ALTER TABLE public.withdraws
  ADD COLUMN IF NOT EXISTS canceled boolean;

ALTER TABLE public.withdraws
  ADD COLUMN IF NOT EXISTS image_url text;

ALTER TABLE public.withdraws
  ADD COLUMN IF NOT EXISTS value integer;

CREATE INDEX IF NOT EXISTS withdraws_user_id_idx ON public.withdraws (user_id);
CREATE INDEX IF NOT EXISTS withdraws_item_id_idx ON public.withdraws (item_id);

ALTER TABLE public.withdraws ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view withdraws" ON public.withdraws;
DROP POLICY IF EXISTS "Users can insert withdraws" ON public.withdraws;
DROP POLICY IF EXISTS "Users can update withdraws" ON public.withdraws;
DROP POLICY IF EXISTS "Users can delete withdraws" ON public.withdraws;

CREATE POLICY "Users can view withdraws"
  ON public.withdraws
  FOR SELECT
  USING (true);

CREATE POLICY "Users can insert withdraws"
  ON public.withdraws
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update withdraws"
  ON public.withdraws
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can delete withdraws"
  ON public.withdraws
  FOR DELETE
  USING (true);

-- ===== 20260706_update_withdraws_item_details.sql =====
ALTER TABLE public.withdraws
  ADD COLUMN IF NOT EXISTS image_url text;

ALTER TABLE public.withdraws
  ADD COLUMN IF NOT EXISTS value integer;

ALTER TABLE public.withdraws
  ALTER COLUMN item_id DROP NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'withdraws'
      AND constraint_name = 'withdraws_item_id_fkey'
  ) THEN
    ALTER TABLE public.withdraws
      DROP CONSTRAINT withdraws_item_id_fkey;
  END IF;
END $$;

-- ===== 20260707_add_avatar_urls_to_coinflip_games.sql =====
-- Add avatar URL columns to coinflip games so creator/opponent headshots can be stored and rendered
ALTER TABLE public.coinflip_games
  ADD COLUMN IF NOT EXISTS creator_avatar_url text,
  ADD COLUMN IF NOT EXISTS opponent_avatar_url text;

-- ===== 20260709_create_giveaways_table.sql =====
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.giveaways (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  user_name text,
  status text NOT NULL DEFAULT 'active',
  level_requirement integer NOT NULL DEFAULT 0,
  duration_minutes integer NOT NULL DEFAULT 15,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz
);

ALTER TABLE public.giveaways
  ADD COLUMN IF NOT EXISTS user_id text;

ALTER TABLE public.giveaways
  ADD COLUMN IF NOT EXISTS user_name text;

ALTER TABLE public.giveaways
  ADD COLUMN IF NOT EXISTS status text;

ALTER TABLE public.giveaways
  ADD COLUMN IF NOT EXISTS level_requirement integer;

ALTER TABLE public.giveaways
  ADD COLUMN IF NOT EXISTS duration_minutes integer;

ALTER TABLE public.giveaways
  ADD COLUMN IF NOT EXISTS items jsonb;

ALTER TABLE public.giveaways
  ADD COLUMN IF NOT EXISTS created_at timestamptz;

ALTER TABLE public.giveaways
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

ALTER TABLE public.giveaways
  ADD COLUMN IF NOT EXISTS ends_at timestamptz;

ALTER TABLE public.giveaways
  ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE public.giveaways
  ALTER COLUMN status SET DEFAULT 'active';

ALTER TABLE public.giveaways
  ALTER COLUMN level_requirement SET DEFAULT 0;

ALTER TABLE public.giveaways
  ALTER COLUMN duration_minutes SET DEFAULT 15;

ALTER TABLE public.giveaways
  ALTER COLUMN items SET DEFAULT '[]'::jsonb;

ALTER TABLE public.giveaways
  ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE public.giveaways
  ALTER COLUMN updated_at SET DEFAULT now();

CREATE INDEX IF NOT EXISTS giveaways_user_id_idx ON public.giveaways (user_id);
CREATE INDEX IF NOT EXISTS giveaways_status_idx ON public.giveaways (status);
CREATE INDEX IF NOT EXISTS giveaways_ends_at_idx ON public.giveaways (ends_at);

ALTER TABLE public.giveaways ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view giveaways" ON public.giveaways;
DROP POLICY IF EXISTS "Users can insert giveaways" ON public.giveaways;
DROP POLICY IF EXISTS "Users can update giveaways" ON public.giveaways;
DROP POLICY IF EXISTS "Users can delete giveaways" ON public.giveaways;

CREATE POLICY "Users can view giveaways"
  ON public.giveaways
  FOR SELECT
  USING (true);

CREATE POLICY "Users can insert giveaways"
  ON public.giveaways
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update giveaways"
  ON public.giveaways
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can delete giveaways"
  ON public.giveaways
  FOR DELETE
  USING (true);

-- ===== 20260728_create_promo_codes_table.sql =====
CREATE TABLE IF NOT EXISTS public.promo_codes (
  promocode_uuid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promocode_name text NOT NULL UNIQUE,
  item_id uuid NOT NULL REFERENCES public.items(id) ON DELETE RESTRICT,
  uses integer NOT NULL DEFAULT 1,
  level_requirement integer NOT NULL DEFAULT 1,
  redeemed text[] NOT NULL DEFAULT ARRAY[]::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.promo_codes
  ALTER COLUMN redeemed SET DEFAULT ARRAY[]::text[];

CREATE INDEX IF NOT EXISTS promo_codes_item_id_idx ON public.promo_codes (item_id);
CREATE INDEX IF NOT EXISTS promo_codes_promocode_name_idx ON public.promo_codes (promocode_name);

ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view promo codes" ON public.promo_codes;
DROP POLICY IF EXISTS "Users can redeem promo codes" ON public.promo_codes;

CREATE POLICY "Users can view promo codes"
  ON public.promo_codes
  FOR SELECT
  USING (true);

CREATE POLICY "Users can redeem promo codes"
  ON public.promo_codes
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- ===== 20260730090000_add_max_level_and_vip_promotion.sql =====
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS role text DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS max_level integer DEFAULT 200;

UPDATE public.user_profiles
SET
  level = LEAST(GREATEST(COALESCE(level, 1), 1), 200),
  max_level = 200,
  role = CASE
    WHEN level >= 200 AND LOWER(COALESCE(role, 'user')) IN ('user', 'vip') THEN 'VIP'
    ELSE COALESCE(role, 'user')
  END;

ALTER TABLE public.user_profiles
  ALTER COLUMN role SET DEFAULT 'user',
  ALTER COLUMN role SET NOT NULL,
  ALTER COLUMN max_level SET DEFAULT 200,
  ALTER COLUMN max_level SET NOT NULL;

ALTER TABLE public.user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_max_level_is_200,
  DROP CONSTRAINT IF EXISTS user_profiles_level_within_range;

ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_max_level_is_200 CHECK (max_level = 200),
  ADD CONSTRAINT user_profiles_level_within_range CHECK (level BETWEEN 1 AND max_level);

CREATE OR REPLACE FUNCTION public.enforce_user_profile_max_level()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.max_level := 200;
  NEW.level := LEAST(GREATEST(COALESCE(NEW.level, 1), 1), NEW.max_level);

  IF NEW.level >= NEW.max_level
    AND LOWER(COALESCE(NEW.role, 'user')) IN ('user', 'vip')
  THEN
    NEW.role := 'VIP';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_user_profile_max_level_trigger
  ON public.user_profiles;

CREATE TRIGGER enforce_user_profile_max_level_trigger
BEFORE INSERT OR UPDATE OF level, max_level, role
ON public.user_profiles
FOR EACH ROW
EXECUTE FUNCTION public.enforce_user_profile_max_level();

-- ===== 20260730090100_add_roblox_id_to_user_profiles.sql =====
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS roblox_id text;

UPDATE public.user_profiles
SET roblox_id = SUBSTRING(id::text FROM 8)
WHERE roblox_id IS NULL
  AND id::text LIKE 'roblox:%'
  AND SUBSTRING(id::text FROM 8) ~ '^[0-9]+$';

ALTER TABLE public.user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_roblox_id_is_numeric;

ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_roblox_id_is_numeric
  CHECK (roblox_id IS NULL OR roblox_id ~ '^[0-9]+$');

CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_roblox_id_unique
  ON public.user_profiles (roblox_id)
  WHERE roblox_id IS NOT NULL;

-- ===== 20260730090200_create_user_sessions.sql =====
CREATE TABLE IF NOT EXISTS public.user_sessions (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  ip_address text,
  ip_addresses jsonb NOT NULL DEFAULT '[]'::jsonb,
  user_agent text,
  location text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  first_login_at timestamptz NOT NULL DEFAULT now(),
  last_active_at timestamptz NOT NULL DEFAULT now(),
  is_current boolean NOT NULL DEFAULT true,
  "current" boolean NOT NULL DEFAULT true
);

ALTER TABLE public.user_sessions
  ADD COLUMN IF NOT EXISTS ip_address text,
  ADD COLUMN IF NOT EXISTS ip_addresses jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS user_agent text,
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS first_login_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_active_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS is_current boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS "current" boolean DEFAULT true;

-- Older deployments used text[] for this field while newer deployments use a
-- JSON array. Normalize either shape before applying defaults and constraints.
DO $$
DECLARE
  v_ip_addresses_type text;
BEGIN
  SELECT udt_name
  INTO v_ip_addresses_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'user_sessions'
    AND column_name = 'ip_addresses';

  IF v_ip_addresses_type IS NOT NULL AND v_ip_addresses_type <> 'jsonb' THEN
    ALTER TABLE public.user_sessions
      ALTER COLUMN ip_addresses DROP DEFAULT;

    ALTER TABLE public.user_sessions
      ALTER COLUMN ip_addresses TYPE jsonb
      USING to_jsonb(ip_addresses);
  END IF;
END $$;

UPDATE public.user_sessions
SET
  ip_addresses = COALESCE(ip_addresses, '[]'::jsonb),
  created_at = COALESCE(created_at, now()),
  updated_at = COALESCE(updated_at, created_at, now()),
  last_seen_at = COALESCE(last_seen_at, updated_at, created_at, now()),
  first_login_at = COALESCE(first_login_at, created_at, now()),
  last_active_at = COALESCE(last_active_at, last_seen_at, updated_at, now()),
  is_current = COALESCE(is_current, true),
  "current" = COALESCE("current", is_current, true);

ALTER TABLE public.user_sessions
  ALTER COLUMN ip_addresses SET DEFAULT '[]'::jsonb,
  ALTER COLUMN ip_addresses SET NOT NULL,
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL,
  ALTER COLUMN last_seen_at SET DEFAULT now(),
  ALTER COLUMN last_seen_at SET NOT NULL,
  ALTER COLUMN first_login_at SET DEFAULT now(),
  ALTER COLUMN first_login_at SET NOT NULL,
  ALTER COLUMN last_active_at SET DEFAULT now(),
  ALTER COLUMN last_active_at SET NOT NULL,
  ALTER COLUMN is_current SET DEFAULT true,
  ALTER COLUMN is_current SET NOT NULL,
  ALTER COLUMN "current" SET DEFAULT true,
  ALTER COLUMN "current" SET NOT NULL;

CREATE INDEX IF NOT EXISTS user_sessions_user_id_idx
  ON public.user_sessions (user_id);

CREATE INDEX IF NOT EXISTS user_sessions_last_active_at_idx
  ON public.user_sessions (last_active_at DESC);

CREATE OR REPLACE FUNCTION public.preserve_user_session_first_login()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.created_at := OLD.created_at;
  NEW.first_login_at := OLD.first_login_at;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS preserve_user_session_first_login_trigger
  ON public.user_sessions;

CREATE TRIGGER preserve_user_session_first_login_trigger
BEFORE UPDATE
ON public.user_sessions
FOR EACH ROW
EXECUTE FUNCTION public.preserve_user_session_first_login();

ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read/write user_sessions"
  ON public.user_sessions;

CREATE POLICY "Allow public read/write user_sessions"
  ON public.user_sessions
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- ===== 20260730090300_add_ignored_users_to_user_profiles.sql =====
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS ignored_users text[] DEFAULT ARRAY[]::text[];

UPDATE public.user_profiles
SET ignored_users = ARRAY[]::text[]
WHERE ignored_users IS NULL;

ALTER TABLE public.user_profiles
  ALTER COLUMN ignored_users SET DEFAULT ARRAY[]::text[],
  ALTER COLUMN ignored_users SET NOT NULL;

-- ===== 20260730120000_create_tips_table.sql =====
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

-- ===== 20260730121000_preserve_withdraw_item_uuids.sql =====
-- A withdrawal is a historical snapshot. It must not retain a foreign key to
-- inventory_items because the inventory row is deleted after the withdrawal
-- is created. ON DELETE SET NULL was erasing the UUID from withdraws.item_id.
DO $$
DECLARE
  v_constraint_name text;
BEGIN
  FOR v_constraint_name IN
    SELECT DISTINCT constraint_row.conname
    FROM pg_constraint AS constraint_row
    JOIN pg_attribute AS attribute_row
      ON attribute_row.attrelid = constraint_row.conrelid
      AND attribute_row.attnum = ANY(constraint_row.conkey)
    WHERE constraint_row.conrelid = 'public.withdraws'::regclass
      AND constraint_row.contype = 'f'
      AND attribute_row.attname = 'item_id'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.withdraws DROP CONSTRAINT %I',
      v_constraint_name
    );
  END LOOP;
END $$;

-- Remove fields from an earlier version of this migration. item_id is the
-- single source of truth and stores inventory_items.id.
DROP INDEX IF EXISTS public.withdraws_inventory_item_uuid_idx;
DROP INDEX IF EXISTS public.withdraws_catalog_item_uuid_idx;

ALTER TABLE public.withdraws
  DROP COLUMN IF EXISTS inventory_item_uuid,
  DROP COLUMN IF EXISTS catalog_item_uuid,
  DROP COLUMN IF EXISTS item_type;

COMMENT ON COLUMN public.withdraws.item_id IS
  'Immutable snapshot of the withdrawn inventory_items.id UUID; intentionally has no foreign key.';

CREATE OR REPLACE FUNCTION public.create_item_withdrawals(
  p_owner_ids text[],
  p_user_name text,
  p_item_uuids uuid[]
)
RETURNS TABLE (withdraw_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requested_count integer;
  v_available_count integer;
BEGIN
  v_requested_count := COALESCE(cardinality(p_item_uuids), 0);

  IF v_requested_count = 0 THEN
    RAISE EXCEPTION 'Select at least one item to withdraw.';
  END IF;

  IF COALESCE(cardinality(p_owner_ids), 0) = 0 THEN
    RAISE EXCEPTION 'A withdrawal owner is required.';
  END IF;

  PERFORM 1
  FROM public.inventory_items
  WHERE id = ANY(p_item_uuids)
    AND user_id::text = ANY(p_owner_ids)
  ORDER BY id
  FOR UPDATE;

  SELECT count(*)::integer
  INTO v_available_count
  FROM public.inventory_items
  WHERE id = ANY(p_item_uuids)
    AND user_id::text = ANY(p_owner_ids);

  IF v_available_count <> v_requested_count THEN
    RAISE EXCEPTION 'One or more selected inventory items are no longer available.';
  END IF;

  RETURN QUERY
  INSERT INTO public.withdraws AS created_withdraw (
    user_id,
    user_name,
    item_id,
    item_name,
    image_url,
    value,
    canceled
  )
  SELECT
    inventory_item.user_id,
    NULLIF(btrim(p_user_name), ''),
    inventory_item.id,
    inventory_item.name,
    inventory_item.image_url,
    COALESCE(inventory_item.value, 0),
    false
  FROM public.inventory_items AS inventory_item
  WHERE inventory_item.id = ANY(p_item_uuids)
    AND inventory_item.user_id::text = ANY(p_owner_ids)
  RETURNING created_withdraw.id;

  DELETE FROM public.inventory_items
  WHERE id = ANY(p_item_uuids)
    AND user_id::text = ANY(p_owner_ids);
END;
$$;

REVOKE ALL ON FUNCTION public.create_item_withdrawals(text[], text, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_item_withdrawals(text[], text, uuid[])
  TO anon, authenticated;

-- ===== 20260730160000_secure_promocode_redemption.sql =====
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

-- ===== 20260730190000_restore_cancelled_coinflip_items.sql =====
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.restore_cancelled_coinflip_items()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.canceled IS NOT TRUE OR OLD.canceled IS TRUE THEN
    RETURN NEW;
  END IF;

  WITH escrowed_items AS (
    SELECT NEW.creator_uuid AS owner_id, entry.item
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(NEW.creator_items) = 'array' THEN NEW.creator_items
        ELSE '[]'::jsonb
      END
    ) AS entry(item)

    UNION ALL

    SELECT NEW.opponent_uuid AS owner_id, entry.item
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(NEW.opponent_items) = 'array' THEN NEW.opponent_items
        ELSE '[]'::jsonb
      END
    ) AS entry(item)
    WHERE NULLIF(NEW.opponent_uuid, '') IS NOT NULL
  ),
  normalized_items AS (
    SELECT DISTINCT ON (item_id)
      item_id,
      owner_id,
      item
    FROM (
      SELECT
        CASE
          WHEN COALESCE(item->>'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            THEN (item->>'id')::uuid
          ELSE gen_random_uuid()
        END AS item_id,
        owner_id,
        item
      FROM escrowed_items
      WHERE NULLIF(owner_id, '') IS NOT NULL
    ) AS prepared_items
    ORDER BY item_id, owner_id
  )
  INSERT INTO public.inventory_items (
    id,
    item_id,
    user_id,
    name,
    value,
    image_url,
    type,
    created_at,
    updated_at
  )
  SELECT
    normalized_items.item_id,
    CASE
      WHEN COALESCE(item->>'item_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        THEN (item->>'item_id')::uuid
      ELSE NULL
    END,
    owner_id,
    COALESCE(NULLIF(item->>'name', ''), 'Unknown item'),
    CASE
      WHEN COALESCE(item->>'value', '') ~ '^-?[0-9]+$'
        THEN (item->>'value')::integer
      ELSE 0
    END,
    NULLIF(item->>'image_url', ''),
    NULLIF(item->>'type', ''),
    now(),
    now()
  FROM normalized_items
  ON CONFLICT (id) DO UPDATE
  SET item_id = COALESCE(EXCLUDED.item_id, inventory_items.item_id),
      user_id = EXCLUDED.user_id,
      name = EXCLUDED.name,
      value = EXCLUDED.value,
      image_url = EXCLUDED.image_url,
      type = COALESCE(EXCLUDED.type, inventory_items.type),
      updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS restore_cancelled_coinflip_items_trigger
  ON public.coinflip_games;

CREATE TRIGGER restore_cancelled_coinflip_items_trigger
AFTER UPDATE OF canceled ON public.coinflip_games
FOR EACH ROW
WHEN (NEW.canceled IS TRUE AND OLD.canceled IS DISTINCT FROM TRUE)
EXECUTE FUNCTION public.restore_cancelled_coinflip_items();

REVOKE ALL ON FUNCTION public.restore_cancelled_coinflip_items() FROM PUBLIC, anon, authenticated;

-- ===== 20260731030000_assign_coinflip_opponent_sides.sql =====
-- The opponent must always receive the opposite coin side from the creator.

UPDATE public.coinflip_games
SET creator_side = CASE
      WHEN lower(btrim(COALESCE(creator_side, ''))) = 'tails' THEN 'tails'
      ELSE 'heads'
    END,
    opponent_side = CASE
      WHEN lower(btrim(COALESCE(creator_side, ''))) = 'tails' THEN 'heads'
      ELSE 'tails'
    END;

CREATE OR REPLACE FUNCTION public.assign_coinflip_sides()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.creator_side := CASE
    WHEN lower(btrim(COALESCE(NEW.creator_side, ''))) = 'tails' THEN 'tails'
    ELSE 'heads'
  END;

  NEW.opponent_side := CASE
    WHEN NEW.creator_side = 'heads' THEN 'tails'
    ELSE 'heads'
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS coinflip_games_assign_sides
  ON public.coinflip_games;

CREATE TRIGGER coinflip_games_assign_sides
BEFORE INSERT OR UPDATE OF creator_side, opponent_side
ON public.coinflip_games
FOR EACH ROW
EXECUTE FUNCTION public.assign_coinflip_sides();

ALTER TABLE public.coinflip_games
  ALTER COLUMN creator_side SET DEFAULT 'heads',
  ALTER COLUMN creator_side SET NOT NULL,
  ALTER COLUMN opponent_side SET NOT NULL;

ALTER TABLE public.coinflip_games
  DROP CONSTRAINT IF EXISTS coinflip_games_creator_side_check,
  DROP CONSTRAINT IF EXISTS coinflip_games_opponent_side_check,
  DROP CONSTRAINT IF EXISTS coinflip_games_sides_differ_check;

ALTER TABLE public.coinflip_games
  ADD CONSTRAINT coinflip_games_creator_side_check
    CHECK (creator_side IN ('heads', 'tails')),
  ADD CONSTRAINT coinflip_games_opponent_side_check
    CHECK (opponent_side IN ('heads', 'tails')),
  ADD CONSTRAINT coinflip_games_sides_differ_check
    CHECK (creator_side <> opponent_side);

REVOKE ALL ON FUNCTION public.assign_coinflip_sides()
  FROM PUBLIC, anon, authenticated;

-- ===== 20260731040000_add_provably_fair_coinflip_results.sql =====
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Commit to a secret seed when a game is created, then reveal it when the
-- opponent joins. The HMAC roll and participant winner are stored for audit.
ALTER TABLE public.coinflip_games
  ADD COLUMN IF NOT EXISTS server_seed_hash text,
  ADD COLUMN IF NOT EXISTS server_seed_encrypted text,
  ADD COLUMN IF NOT EXISTS server_seed text,
  ADD COLUMN IF NOT EXISTS client_seed text,
  ADD COLUMN IF NOT EXISTS nonce integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS result_roll double precision,
  ADD COLUMN IF NOT EXISTS winner_uuid text,
  ADD COLUMN IF NOT EXISTS winner_username text,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

ALTER TABLE public.coinflip_games
  DROP CONSTRAINT IF EXISTS coinflip_games_result_check,
  DROP CONSTRAINT IF EXISTS coinflip_games_result_roll_check;

ALTER TABLE public.coinflip_games
  ADD CONSTRAINT coinflip_games_result_check
    CHECK (result IS NULL OR result IN ('heads', 'tails')),
  ADD CONSTRAINT coinflip_games_result_roll_check
    CHECK (result_roll IS NULL OR (result_roll >= 0 AND result_roll < 1));

CREATE INDEX IF NOT EXISTS coinflip_games_winner_uuid_idx
  ON public.coinflip_games (winner_uuid);

-- Keep pre-migration open games joinable. Their generated seed and commitment
-- are written together; all games created after this migration keep the seed
-- encrypted until resolution.
WITH legacy_seeds AS (
  SELECT id, encode(gen_random_bytes(32), 'hex') AS seed
  FROM public.coinflip_games
  WHERE result IS NULL
    AND canceled = false
    AND server_seed_hash IS NULL
)
UPDATE public.coinflip_games AS game
SET server_seed = legacy.seed,
    server_seed_hash = encode(digest(legacy.seed, 'sha256'), 'hex'),
    client_seed = encode(gen_random_bytes(16), 'hex')
FROM legacy_seeds AS legacy
WHERE game.id = legacy.id;

-- ===== 20260731050000_settle_resolved_coinflip_items.sql =====
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- A result update, opponent escrow removal, and winner payout must succeed or
-- fail together. This trigger runs inside the transaction that resolves a game.
CREATE OR REPLACE FUNCTION public.settle_resolved_coinflip_items()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  expected_opponent_items integer;
  removed_opponent_items integer;
BEGIN
  IF NEW.result IS NULL OR OLD.result IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NULLIF(NEW.opponent_uuid, '') IS NULL
     OR NULLIF(NEW.winner_uuid, '') IS NULL
     OR NEW.winner_uuid NOT IN (NEW.creator_uuid, NEW.opponent_uuid) THEN
    RAISE EXCEPTION 'Invalid resolved coinflip participants or winner';
  END IF;

  -- Remove the opponent's still-owned wager before rebuilding the complete pot
  -- in the winner's inventory. Creator items were escrowed when the game opened.
  SELECT count(DISTINCT item->>'id')
  INTO expected_opponent_items
  FROM jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(NEW.opponent_items) = 'array' THEN NEW.opponent_items
      ELSE '[]'::jsonb
    END
  ) AS wager(item)
  WHERE NULLIF(item->>'id', '') IS NOT NULL;

  IF expected_opponent_items = 0 THEN
    RAISE EXCEPTION 'A coinflip opponent must escrow at least one item';
  END IF;

  DELETE FROM public.inventory_items AS inventory
  WHERE inventory.user_id = NEW.opponent_uuid
    AND inventory.id::text IN (
      SELECT item->>'id'
      FROM jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(NEW.opponent_items) = 'array' THEN NEW.opponent_items
          ELSE '[]'::jsonb
        END
      ) AS wager(item)
      WHERE NULLIF(item->>'id', '') IS NOT NULL
    );

  GET DIAGNOSTICS removed_opponent_items = ROW_COUNT;
  IF removed_opponent_items <> expected_opponent_items THEN
    RAISE EXCEPTION 'One or more opponent coinflip items are no longer owned';
  END IF;

  WITH pot_items AS (
    SELECT entry.item
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(NEW.creator_items) = 'array' THEN NEW.creator_items
        ELSE '[]'::jsonb
      END
    ) AS entry(item)

    UNION ALL

    SELECT entry.item
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(NEW.opponent_items) = 'array' THEN NEW.opponent_items
        ELSE '[]'::jsonb
      END
    ) AS entry(item)
  ),
  normalized_items AS (
    SELECT DISTINCT ON (inventory_id)
      inventory_id,
      item
    FROM (
      SELECT
        CASE
          WHEN COALESCE(item->>'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            THEN (item->>'id')::uuid
          ELSE gen_random_uuid()
        END AS inventory_id,
        item
      FROM pot_items
    ) AS prepared_items
    ORDER BY inventory_id
  )
  INSERT INTO public.inventory_items (
    id,
    item_id,
    item_uuid,
    user_id,
    name,
    value,
    image_url,
    type,
    created_at,
    updated_at
  )
  SELECT
    normalized_items.inventory_id,
    CASE
      WHEN COALESCE(item->>'item_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        THEN (item->>'item_id')::uuid
      ELSE NULL
    END,
    CASE
      WHEN COALESCE(item->>'item_uuid', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        THEN (item->>'item_uuid')::uuid
      ELSE normalized_items.inventory_id
    END,
    NEW.winner_uuid,
    COALESCE(NULLIF(item->>'name', ''), 'Unknown item'),
    CASE
      WHEN COALESCE(item->>'value', '') ~ '^-?[0-9]+$'
        THEN (item->>'value')::integer
      ELSE 0
    END,
    NULLIF(item->>'image_url', ''),
    NULLIF(item->>'type', ''),
    now(),
    now()
  FROM normalized_items
  ON CONFLICT (id) DO UPDATE
  SET item_id = COALESCE(EXCLUDED.item_id, inventory_items.item_id),
      item_uuid = COALESCE(EXCLUDED.item_uuid, inventory_items.item_uuid),
      user_id = EXCLUDED.user_id,
      name = EXCLUDED.name,
      value = EXCLUDED.value,
      image_url = EXCLUDED.image_url,
      type = COALESCE(EXCLUDED.type, inventory_items.type),
      updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS settle_resolved_coinflip_items_trigger
  ON public.coinflip_games;

CREATE TRIGGER settle_resolved_coinflip_items_trigger
AFTER UPDATE OF result ON public.coinflip_games
FOR EACH ROW
WHEN (NEW.result IS NOT NULL AND OLD.result IS NULL)
EXECUTE FUNCTION public.settle_resolved_coinflip_items();

REVOKE ALL ON FUNCTION public.settle_resolved_coinflip_items()
  FROM PUBLIC, anon, authenticated;

-- ===== 20260731060000_update_coinflip_profile_stats.sql =====
-- Coinflip profile totals are monetary values, so use bigint to prevent
-- long-running accounts from overflowing the original integer columns.
ALTER TABLE public.user_profiles
  ALTER COLUMN played TYPE bigint USING COALESCE(played, 0)::bigint,
  ALTER COLUMN won TYPE bigint USING COALESCE(won, 0)::bigint,
  ALTER COLUMN lost TYPE bigint USING COALESCE(lost, 0)::bigint;

UPDATE public.user_profiles
SET played = COALESCE(played, 0),
    won = COALESCE(won, 0),
    lost = COALESCE(lost, 0)
WHERE played IS NULL OR won IS NULL OR lost IS NULL;

ALTER TABLE public.user_profiles
  ALTER COLUMN played SET DEFAULT 0,
  ALTER COLUMN played SET NOT NULL,
  ALTER COLUMN won SET DEFAULT 0,
  ALTER COLUMN won SET NOT NULL,
  ALTER COLUMN lost SET DEFAULT 0,
  ALTER COLUMN lost SET NOT NULL;

CREATE OR REPLACE FUNCTION public.update_resolved_coinflip_profile_stats()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  creator_wager bigint;
  opponent_wager bigint;
  updated_profiles integer;
BEGIN
  IF NEW.result IS NULL OR OLD.result IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NULLIF(NEW.creator_uuid, '') IS NULL
     OR NULLIF(NEW.opponent_uuid, '') IS NULL
     OR NEW.creator_uuid = NEW.opponent_uuid
     OR NULLIF(NEW.winner_uuid, '') IS NULL
     OR NEW.winner_uuid NOT IN (NEW.creator_uuid, NEW.opponent_uuid) THEN
    RAISE EXCEPTION 'Invalid resolved coinflip participants or winner';
  END IF;

  SELECT COALESCE(sum(
    CASE
      WHEN COALESCE(item->>'value', '') ~ '^[0-9]+$' THEN (item->>'value')::bigint
      ELSE 0
    END
  ), 0)
  INTO creator_wager
  FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(NEW.creator_items) = 'array' THEN NEW.creator_items ELSE '[]'::jsonb END
  ) AS wager(item);

  SELECT COALESCE(sum(
    CASE
      WHEN COALESCE(item->>'value', '') ~ '^[0-9]+$' THEN (item->>'value')::bigint
      ELSE 0
    END
  ), 0)
  INTO opponent_wager
  FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(NEW.opponent_items) = 'array' THEN NEW.opponent_items ELSE '[]'::jsonb END
  ) AS wager(item);

  IF creator_wager <= 0 OR opponent_wager <= 0 THEN
    RAISE EXCEPTION 'Resolved coinflip wagers must have a positive value';
  END IF;

  UPDATE public.user_profiles AS profile
  SET played = profile.played + CASE
        WHEN profile.id::text = NEW.creator_uuid THEN creator_wager
        ELSE opponent_wager
      END,
      won = profile.won + CASE
        WHEN profile.id::text <> NEW.winner_uuid THEN 0
        WHEN NEW.winner_uuid = NEW.creator_uuid THEN opponent_wager
        ELSE creator_wager
      END,
      lost = profile.lost + CASE
        WHEN profile.id::text = NEW.winner_uuid THEN 0
        WHEN profile.id::text = NEW.creator_uuid THEN creator_wager
        ELSE opponent_wager
      END,
      updated_at = now()
  WHERE profile.id::text IN (NEW.creator_uuid, NEW.opponent_uuid);

  GET DIAGNOSTICS updated_profiles = ROW_COUNT;
  IF updated_profiles <> 2 THEN
    RAISE EXCEPTION 'Both coinflip participant profiles must exist';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_resolved_coinflip_profile_stats_trigger
  ON public.coinflip_games;

CREATE TRIGGER update_resolved_coinflip_profile_stats_trigger
AFTER UPDATE OF result ON public.coinflip_games
FOR EACH ROW
WHEN (NEW.result IS NOT NULL AND OLD.result IS NULL)
EXECUTE FUNCTION public.update_resolved_coinflip_profile_stats();

REVOKE ALL ON FUNCTION public.update_resolved_coinflip_profile_stats()
  FROM PUBLIC, anon, authenticated;

-- ===== 20260801010000_harden_coinflip_item_custody.sql =====
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Escrow the creator's wager in the same transaction that creates the room.
-- Any missing item aborts the insert, so an unbacked room cannot be published.
CREATE OR REPLACE FUNCTION public.escrow_created_coinflip_items()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  expected_items integer;
  removed_items integer;
BEGIN
  SELECT count(DISTINCT item->>'id')
  INTO expected_items
  FROM jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(NEW.creator_items) = 'array' THEN NEW.creator_items
      ELSE '[]'::jsonb
    END
  ) AS wager(item)
  WHERE NULLIF(item->>'id', '') IS NOT NULL;

  IF expected_items = 0 THEN
    RAISE EXCEPTION 'A coinflip creator must escrow at least one item';
  END IF;

  DELETE FROM public.inventory_items AS inventory
  WHERE inventory.user_id = NEW.creator_uuid
    AND inventory.id::text IN (
      SELECT item->>'id'
      FROM jsonb_array_elements(NEW.creator_items) AS wager(item)
      WHERE NULLIF(item->>'id', '') IS NOT NULL
    );

  GET DIAGNOSTICS removed_items = ROW_COUNT;
  IF removed_items <> expected_items THEN
    RAISE EXCEPTION 'One or more creator coinflip items are no longer owned';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS escrow_created_coinflip_items_trigger
  ON public.coinflip_games;

CREATE TRIGGER escrow_created_coinflip_items_trigger
AFTER INSERT ON public.coinflip_games
FOR EACH ROW
EXECUTE FUNCTION public.escrow_created_coinflip_items();

REVOKE ALL ON FUNCTION public.escrow_created_coinflip_items()
  FROM PUBLIC, anon, authenticated;

-- Preserve the permanent item-instance UUID when an open game is canceled.
CREATE OR REPLACE FUNCTION public.restore_cancelled_coinflip_items()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.canceled IS NOT TRUE OR OLD.canceled IS TRUE THEN
    RETURN NEW;
  END IF;

  WITH escrowed_items AS (
    SELECT NEW.creator_uuid AS owner_id, entry.item
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(NEW.creator_items) = 'array' THEN NEW.creator_items ELSE '[]'::jsonb END
    ) AS entry(item)

    UNION ALL

    SELECT NEW.opponent_uuid AS owner_id, entry.item
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(NEW.opponent_items) = 'array' THEN NEW.opponent_items ELSE '[]'::jsonb END
    ) AS entry(item)
    WHERE NULLIF(NEW.opponent_uuid, '') IS NOT NULL
  ),
  normalized_items AS (
    SELECT DISTINCT ON (inventory_id)
      inventory_id,
      owner_id,
      item
    FROM (
      SELECT
        CASE
          WHEN COALESCE(item->>'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            THEN (item->>'id')::uuid
          ELSE gen_random_uuid()
        END AS inventory_id,
        owner_id,
        item
      FROM escrowed_items
      WHERE NULLIF(owner_id, '') IS NOT NULL
    ) AS prepared_items
    ORDER BY inventory_id, owner_id
  )
  INSERT INTO public.inventory_items (
    id,
    item_id,
    item_uuid,
    user_id,
    name,
    value,
    image_url,
    type,
    created_at,
    updated_at
  )
  SELECT
    normalized_items.inventory_id,
    CASE
      WHEN COALESCE(item->>'item_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        THEN (item->>'item_id')::uuid
      ELSE NULL
    END,
    CASE
      WHEN COALESCE(item->>'item_uuid', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        THEN (item->>'item_uuid')::uuid
      ELSE normalized_items.inventory_id
    END,
    owner_id,
    COALESCE(NULLIF(item->>'name', ''), 'Unknown item'),
    CASE WHEN COALESCE(item->>'value', '') ~ '^-?[0-9]+$' THEN (item->>'value')::integer ELSE 0 END,
    NULLIF(item->>'image_url', ''),
    NULLIF(item->>'type', ''),
    now(),
    now()
  FROM normalized_items
  ON CONFLICT (id) DO UPDATE
  SET item_id = COALESCE(EXCLUDED.item_id, inventory_items.item_id),
      item_uuid = COALESCE(inventory_items.item_uuid, EXCLUDED.item_uuid),
      user_id = EXCLUDED.user_id,
      name = EXCLUDED.name,
      value = EXCLUDED.value,
      image_url = EXCLUDED.image_url,
      type = COALESCE(EXCLUDED.type, inventory_items.type),
      updated_at = now();

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.restore_cancelled_coinflip_items()
  FROM PUBLIC, anon, authenticated;

-- Coinflip state and inventory custody are server-owned. Browsers only need
-- read access for the lobby and realtime display.
REVOKE INSERT, UPDATE, DELETE ON public.coinflip_games FROM anon, authenticated;
GRANT SELECT ON public.coinflip_games TO anon, authenticated;

DROP POLICY IF EXISTS "Users can insert coinflip_games" ON public.coinflip_games;
DROP POLICY IF EXISTS "Users can update coinflip_games" ON public.coinflip_games;
DROP POLICY IF EXISTS "Users can delete coinflip_games" ON public.coinflip_games;

-- ===== 20260801020000_enable_coinflip_realtime.sql =====
-- Ensure coinflip inserts and updates reach every subscribed client in realtime.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication
    WHERE pubname = 'supabase_realtime'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'coinflip_games'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.coinflip_games;
  END IF;
END;
$$;

-- ===== Coinflip XP progression =====
-- Server-authoritative game XP. One wagered coin awards one XP, with no cap.
-- Every award is written to an immutable, uniquely-keyed ledger first so a
-- retried settlement can never award the same game's XP twice.

ALTER TABLE public.user_profiles
  ALTER COLUMN level SET DEFAULT 0,
  ALTER COLUMN xp TYPE bigint USING GREATEST(COALESCE(xp, 0), 0)::bigint,
  ALTER COLUMN xp SET DEFAULT 0,
  ALTER COLUMN xp SET NOT NULL,
  ADD COLUMN IF NOT EXISTS lifetime_xp bigint NOT NULL DEFAULT 0;

ALTER TABLE public.user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_level_within_range;
ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_level_within_range
  CHECK (level BETWEEN 0 AND max_level);

CREATE OR REPLACE FUNCTION public.enforce_user_profile_max_level()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.max_level := 200;
  NEW.level := LEAST(GREATEST(COALESCE(NEW.level, 0), 0), NEW.max_level);
  NEW.xp := GREATEST(COALESCE(NEW.xp, 0), 0);
  NEW.lifetime_xp := GREATEST(COALESCE(NEW.lifetime_xp, 0), 0);

  IF NEW.level >= NEW.max_level
     AND LOWER(COALESCE(NEW.role, 'user')) IN ('user', 'vip') THEN
    NEW.role := 'VIP';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.profile_xp_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id text NOT NULL,
  game_type text NOT NULL,
  game_id text NOT NULL,
  wager_amount bigint NOT NULL CHECK (wager_amount > 0),
  xp_awarded bigint NOT NULL CHECK (xp_awarded = wager_amount),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profile_xp_events_game_type_check
    CHECK (game_type IN ('coinflip')),
  CONSTRAINT profile_xp_events_unique_game_award
    UNIQUE (profile_id, game_type, game_id)
);

CREATE INDEX IF NOT EXISTS profile_xp_events_profile_created_idx
  ON public.profile_xp_events (profile_id, created_at DESC);

ALTER TABLE public.profile_xp_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.profile_xp_events FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.profile_xp_events TO service_role;

CREATE OR REPLACE FUNCTION public.profile_xp_required_for_level(p_level integer)
RETURNS bigint
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  -- Calibrated so all 200 thresholds total approximately 6.4 trillion XP.
  -- Each level requires 4% more XP than the preceding level.
  SELECT round(
    100402008.42216134::numeric
    * power(1.04::numeric, LEAST(GREATEST(p_level, 0), 199))
  )::bigint;
$$;

CREATE OR REPLACE FUNCTION public.award_profile_game_xp(
  p_profile_id text,
  p_game_type text,
  p_game_id text,
  p_wager_amount bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_profile public.user_profiles%ROWTYPE;
  inserted_event_id uuid;
  next_level integer;
  next_xp bigint;
  next_lifetime_xp bigint;
  required_xp bigint;
BEGIN
  IF NULLIF(trim(p_profile_id), '') IS NULL
     OR NULLIF(trim(p_game_id), '') IS NULL
     OR p_game_type NOT IN ('coinflip')
     OR p_wager_amount IS NULL
     OR p_wager_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid game XP award.';
  END IF;

  INSERT INTO public.profile_xp_events (
    profile_id, game_type, game_id, wager_amount, xp_awarded
  )
  VALUES (
    p_profile_id, p_game_type, p_game_id, p_wager_amount, p_wager_amount
  )
  ON CONFLICT (profile_id, game_type, game_id) DO NOTHING
  RETURNING id INTO inserted_event_id;

  SELECT * INTO selected_profile
  FROM public.user_profiles
  WHERE id::text = p_profile_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The XP profile could not be found.';
  END IF;

  IF inserted_event_id IS NULL THEN
    RETURN jsonb_build_object(
      'awarded', false,
      'level', selected_profile.level,
      'xp', selected_profile.xp,
      'lifetime_xp', selected_profile.lifetime_xp
    );
  END IF;

  next_level := LEAST(GREATEST(COALESCE(selected_profile.level, 0), 0), 200);
  next_xp := GREATEST(COALESCE(selected_profile.xp, 0), 0) + p_wager_amount;
  next_lifetime_xp := GREATEST(COALESCE(selected_profile.lifetime_xp, 0), 0) + p_wager_amount;

  WHILE next_level < 200 LOOP
    required_xp := public.profile_xp_required_for_level(next_level);
    EXIT WHEN next_xp < required_xp;
    next_xp := next_xp - required_xp;
    next_level := next_level + 1;
  END LOOP;

  IF next_level >= 200 THEN
    next_level := 200;
    next_xp := 0;
  END IF;

  UPDATE public.user_profiles
  SET level = next_level,
      xp = next_xp,
      lifetime_xp = next_lifetime_xp,
      updated_at = now()
  WHERE id::text = p_profile_id
  RETURNING * INTO selected_profile;

  RETURN jsonb_build_object(
    'awarded', true,
    'xp_awarded', p_wager_amount,
    'level', selected_profile.level,
    'xp', selected_profile.xp,
    'lifetime_xp', selected_profile.lifetime_xp
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.award_resolved_coinflip_xp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  creator_wager bigint;
  opponent_wager bigint;
BEGIN
  IF NEW.result IS NULL OR OLD.result IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(sum(
    CASE WHEN COALESCE(item->>'value', '') ~ '^[0-9]+$'
      THEN (item->>'value')::bigint ELSE 0 END
  ), 0)
  INTO creator_wager
  FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(NEW.creator_items) = 'array' THEN NEW.creator_items ELSE '[]'::jsonb END
  ) AS wager(item);

  SELECT COALESCE(sum(
    CASE WHEN COALESCE(item->>'value', '') ~ '^[0-9]+$'
      THEN (item->>'value')::bigint ELSE 0 END
  ), 0)
  INTO opponent_wager
  FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(NEW.opponent_items) = 'array' THEN NEW.opponent_items ELSE '[]'::jsonb END
  ) AS wager(item);

  PERFORM public.award_profile_game_xp(
    NEW.creator_uuid,
    'coinflip',
    NEW.id::text,
    creator_wager
  );
  PERFORM public.award_profile_game_xp(
    NEW.opponent_uuid,
    'coinflip',
    NEW.id::text,
    opponent_wager
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS award_resolved_coinflip_xp_trigger ON public.coinflip_games;
CREATE TRIGGER award_resolved_coinflip_xp_trigger
AFTER UPDATE OF result ON public.coinflip_games
FOR EACH ROW
WHEN (NEW.result IS NOT NULL AND OLD.result IS NULL)
EXECUTE FUNCTION public.award_resolved_coinflip_xp();


REVOKE ALL ON FUNCTION public.profile_xp_required_for_level(integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.award_profile_game_xp(text, text, text, bigint)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.award_resolved_coinflip_xp()
  FROM PUBLIC, anon, authenticated;

-- ===== 20260802061000_make_level_one_the_starting_level.sql =====
-- Level 1 is the starting level. The 199 thresholds from level 1 through
-- level 199 compound by 4% and total approximately 6.4 trillion XP.

ALTER TABLE public.user_profiles
  ALTER COLUMN level SET DEFAULT 1;

UPDATE public.user_profiles
SET level = 1,
    updated_at = now()
WHERE level < 1;

ALTER TABLE public.user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_level_within_range;
ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_level_within_range
  CHECK (level BETWEEN 1 AND max_level);

CREATE OR REPLACE FUNCTION public.enforce_user_profile_max_level()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.max_level := 200;
  NEW.level := LEAST(GREATEST(COALESCE(NEW.level, 1), 1), NEW.max_level);
  NEW.xp := GREATEST(COALESCE(NEW.xp, 0), 0);
  NEW.lifetime_xp := GREATEST(COALESCE(NEW.lifetime_xp, 0), 0);

  IF NEW.level >= NEW.max_level
     AND LOWER(COALESCE(NEW.role, 'user')) IN ('user', 'vip') THEN
    NEW.role := 'VIP';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.profile_xp_required_for_level(p_level integer)
RETURNS bigint
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT round(
    104419726.87628177::numeric
    * power(
        1.04::numeric,
        LEAST(GREATEST(p_level, 1), 199) - 1
      )
  )::bigint;
$$;

-- ===== 20260809010000_set_level_one_to_100k_xp.sql =====
-- XP is awarded one-for-one with wager value. Level 1 requires exactly
-- 100,000 XP, and each following level requires 4% more than the prior level.

CREATE OR REPLACE FUNCTION public.profile_xp_required_for_level(p_level integer)
RETURNS bigint
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT round(
    100000::numeric
    * power(
        1.04::numeric,
        LEAST(GREATEST(p_level, 1), 199) - 1
      )
  )::bigint;
$$;

-- Carry any existing XP above the new, lower threshold through the appropriate
-- levels immediately instead of waiting for the player's next wager.
DO $$
DECLARE
  selected_profile record;
  next_level integer;
  next_xp bigint;
  required_xp bigint;
BEGIN
  FOR selected_profile IN
    SELECT id, level, xp, max_level
    FROM public.user_profiles
    FOR UPDATE
  LOOP
    next_level := LEAST(
      GREATEST(COALESCE(selected_profile.level, 1), 1),
      LEAST(GREATEST(COALESCE(selected_profile.max_level, 200), 1), 200)
    );
    next_xp := GREATEST(COALESCE(selected_profile.xp, 0), 0);

    WHILE next_level < LEAST(COALESCE(selected_profile.max_level, 200), 200) LOOP
      required_xp := public.profile_xp_required_for_level(next_level);
      EXIT WHEN next_xp < required_xp;
      next_xp := next_xp - required_xp;
      next_level := next_level + 1;
    END LOOP;

    IF next_level >= LEAST(COALESCE(selected_profile.max_level, 200), 200) THEN
      next_xp := 0;
    END IF;

    UPDATE public.user_profiles
    SET level = next_level,
        xp = next_xp,
        updated_at = now()
    WHERE id = selected_profile.id;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.profile_xp_required_for_level(integer)
  FROM PUBLIC, anon, authenticated;

-- ===== Security event audit =====
-- High-confidence security telemetry for manual review. Routine validation
-- failures and ordinary button spam are intentionally not written here.
CREATE TABLE IF NOT EXISTS public.security_events (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  profile_id text,
  ip_address text,
  event_type text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  route text,
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS security_events_created_idx
  ON public.security_events (created_at DESC);
CREATE INDEX IF NOT EXISTS security_events_profile_created_idx
  ON public.security_events (profile_id, created_at DESC)
  WHERE profile_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS security_events_ip_created_idx
  ON public.security_events (ip_address, created_at DESC)
  WHERE ip_address IS NOT NULL;

ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;

-- ===== 20260811016000_create_ps99_deposits.sql =====
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

-- ===== 20260812020000_secure_ps99_withdrawals.sql =====
ALTER TABLE public.withdraws
  ADD COLUMN IF NOT EXISTS item_type text,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS external_trade_id text,
  ADD COLUMN IF NOT EXISTS bot_roblox_id text,
  ADD COLUMN IF NOT EXISTS claim_token text,
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS claimed_by_bot text;

-- Gem packages are catalogued PS99 items on the website and are delivered as
-- their corresponding diamond amount by the Lua bot.
INSERT INTO public.items (id, name, value, image_url, type)
SELECT gen_random_uuid(), gem_package.name, gem_package.value, NULL, 'PS99'
FROM (VALUES
  ('100K gems', 100000),
  ('500K gems', 500000),
  ('1M gems', 1000000),
  ('5M gems', 5000000),
  ('10M gems', 10000000),
  ('25M gems', 25000000),
  ('50M gems', 50000000),
  ('100M gems', 100000000)
) AS gem_package(name, value)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.items AS existing
  WHERE existing.name = gem_package.name
    AND existing.type = 'PS99'
);

UPDATE public.withdraws AS withdrawal
SET item_type = (
  SELECT item.type
  FROM public.items AS item
  WHERE lower(item.name) = lower(withdrawal.item_name)
  ORDER BY (item.type = 'PS99') DESC, item.id
  LIMIT 1
)
WHERE withdrawal.item_type IS NULL;

CREATE OR REPLACE FUNCTION public.assign_withdrawal_item_type()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.item_type IS NULL AND NEW.item_id IS NOT NULL THEN
    SELECT inventory.type INTO NEW.item_type
    FROM public.inventory_items AS inventory
    WHERE inventory.id = NEW.item_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS withdraws_assign_item_type ON public.withdraws;
CREATE TRIGGER withdraws_assign_item_type
BEFORE INSERT ON public.withdraws
FOR EACH ROW EXECUTE FUNCTION public.assign_withdrawal_item_type();

CREATE INDEX IF NOT EXISTS withdraws_pending_user_idx
  ON public.withdraws (user_id, withdrawed_at)
  WHERE canceled IS FALSE AND completed_at IS NULL;

CREATE INDEX IF NOT EXISTS withdraws_external_trade_id_idx
  ON public.withdraws (external_trade_id)
  WHERE external_trade_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.claim_ps99_withdrawals(
  p_profile_id text,
  p_bot_roblox_id text,
  p_claim_token text
)
RETURNS TABLE (withdrawal_id uuid, item_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NULLIF(btrim(p_profile_id), '') IS NULL
    OR NULLIF(btrim(p_bot_roblox_id), '') IS NULL
    OR NULLIF(btrim(p_claim_token), '') IS NULL
    OR length(p_claim_token) > 128 THEN
    RAISE EXCEPTION 'Valid profile, bot, and claim identifiers are required.';
  END IF;

  RETURN QUERY
  WITH claimable AS (
    SELECT pending.id
    FROM public.withdraws AS pending
    WHERE pending.user_id = p_profile_id
      AND pending.canceled IS FALSE
      AND pending.completed_at IS NULL
      AND pending.item_type = 'PS99'
      AND (
        pending.claimed_at IS NULL
        OR pending.claimed_at < now() - interval '5 minutes'
        OR pending.claimed_by_bot = p_bot_roblox_id
      )
    ORDER BY pending.withdrawed_at, pending.id
    LIMIT 100
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.withdraws AS claimed
  SET claim_token = p_claim_token,
      claimed_at = now(),
      claimed_by_bot = p_bot_roblox_id
  FROM claimable
  WHERE claimed.id = claimable.id
  RETURNING claimed.id, claimed.item_name;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_ps99_withdrawals(
  p_profile_id text,
  p_withdrawal_uuids uuid[],
  p_claim_token text,
  p_external_trade_id text,
  p_bot_roblox_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requested_count integer;
  v_matching_count integer;
  v_completed_count integer;
BEGIN
  v_requested_count := COALESCE(cardinality(p_withdrawal_uuids), 0);
  IF v_requested_count < 1 OR v_requested_count > 100 THEN
    RAISE EXCEPTION 'Between 1 and 100 withdrawal IDs are required.';
  END IF;
  IF v_requested_count <> (
    SELECT count(DISTINCT requested.withdrawal_uuid)
    FROM unnest(p_withdrawal_uuids) AS requested(withdrawal_uuid)
  ) THEN
    RAISE EXCEPTION 'Duplicate withdrawal IDs are not allowed.';
  END IF;
  IF NULLIF(btrim(p_claim_token), '') IS NULL
    OR NULLIF(btrim(p_external_trade_id), '') IS NULL
    OR length(p_claim_token) > 128
    OR length(p_external_trade_id) > 128
    OR NULLIF(btrim(p_bot_roblox_id), '') IS NULL THEN
    RAISE EXCEPTION 'Valid claim, trade, and bot identifiers are required.';
  END IF;

  PERFORM 1
  FROM public.withdraws
  WHERE id = ANY(p_withdrawal_uuids)
  ORDER BY id
  FOR UPDATE;

  SELECT count(*)::integer,
         count(*) FILTER (
           WHERE completed_at IS NOT NULL
             AND external_trade_id = p_external_trade_id
             AND bot_roblox_id = p_bot_roblox_id
         )::integer
  INTO v_matching_count, v_completed_count
  FROM public.withdraws
  WHERE id = ANY(p_withdrawal_uuids)
    AND user_id = p_profile_id;

  IF v_matching_count <> v_requested_count THEN
    RAISE EXCEPTION 'One or more withdrawals do not belong to this user.';
  END IF;
  IF v_completed_count = v_requested_count THEN
    RETURN jsonb_build_object('completed_count', v_completed_count, 'duplicate', true);
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.withdraws
    WHERE id = ANY(p_withdrawal_uuids)
      AND (
        canceled IS TRUE
        OR completed_at IS NOT NULL
        OR claim_token IS DISTINCT FROM p_claim_token
        OR claimed_by_bot IS DISTINCT FROM p_bot_roblox_id
      )
  ) THEN
    RAISE EXCEPTION 'One or more withdrawals are no longer available to this bot.';
  END IF;

  UPDATE public.withdraws
  SET completed_at = now(),
      external_trade_id = p_external_trade_id,
      bot_roblox_id = p_bot_roblox_id,
      claim_token = NULL,
      claimed_at = NULL,
      claimed_by_bot = NULL
  WHERE id = ANY(p_withdrawal_uuids)
    AND user_id = p_profile_id
    AND canceled IS FALSE
    AND completed_at IS NULL;

  -- Release unfulfilled rows from a partial trade so another bot can claim them.
  UPDATE public.withdraws
  SET claim_token = NULL,
      claimed_at = NULL,
      claimed_by_bot = NULL
  WHERE user_id = p_profile_id
    AND claim_token = p_claim_token
    AND claimed_by_bot = p_bot_roblox_id
    AND completed_at IS NULL
    AND canceled IS FALSE;

  RETURN jsonb_build_object('completed_count', v_requested_count, 'duplicate', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.release_ps99_withdrawal_claim(
  p_profile_id text,
  p_claim_token text,
  p_bot_roblox_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_released_count integer;
BEGIN
  UPDATE public.withdraws
  SET claim_token = NULL,
      claimed_at = NULL,
      claimed_by_bot = NULL
  WHERE user_id = p_profile_id
    AND claim_token = p_claim_token
    AND claimed_by_bot = p_bot_roblox_id
    AND completed_at IS NULL
    AND canceled IS FALSE;

  GET DIAGNOSTICS v_released_count = ROW_COUNT;
  RETURN jsonb_build_object('released_count', v_released_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_item_withdrawals(
  p_profile_id text,
  p_withdrawal_uuids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requested_count integer;
  v_available_count integer;
BEGIN
  v_requested_count := COALESCE(cardinality(p_withdrawal_uuids), 0);
  IF v_requested_count = 0 THEN
    RAISE EXCEPTION 'Select at least one withdrawal to cancel.';
  END IF;

  PERFORM 1
  FROM public.withdraws
  WHERE id = ANY(p_withdrawal_uuids)
    AND user_id = p_profile_id
  ORDER BY id
  FOR UPDATE;

  SELECT count(*)::integer INTO v_available_count
  FROM public.withdraws
  WHERE id = ANY(p_withdrawal_uuids)
    AND user_id = p_profile_id
    AND canceled IS FALSE
    AND completed_at IS NULL
    AND (claimed_at IS NULL OR claimed_at < now() - interval '5 minutes');

  IF v_available_count <> v_requested_count THEN
    RAISE EXCEPTION 'One or more withdrawals are completed, claimed by a bot, or unavailable.';
  END IF;

  INSERT INTO public.inventory_items (id, user_id, name, value, image_url, type, created_at, updated_at)
  SELECT COALESCE(item_id, gen_random_uuid()), p_profile_id,
         COALESCE(NULLIF(item_name, ''), 'Unknown item'), COALESCE(value, 0), image_url, item_type, now(), now()
  FROM public.withdraws
  WHERE id = ANY(p_withdrawal_uuids)
    AND user_id = p_profile_id
    AND canceled IS FALSE
    AND completed_at IS NULL;

  UPDATE public.withdraws
  SET canceled = TRUE,
      claim_token = NULL,
      claimed_at = NULL,
      claimed_by_bot = NULL
  WHERE id = ANY(p_withdrawal_uuids)
    AND user_id = p_profile_id
    AND canceled IS FALSE
    AND completed_at IS NULL;

  RETURN jsonb_build_object('canceled_count', v_available_count);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_ps99_withdrawals(text, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_ps99_withdrawals(text, uuid[], text, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_ps99_withdrawal_claim(text, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_item_withdrawals(text, uuid[])
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_ps99_withdrawals(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_ps99_withdrawals(text, uuid[], text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_ps99_withdrawal_claim(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_item_withdrawals(text, uuid[]) TO service_role;

-- ===== 20260812021000_harden_ps99_deposits.sql =====
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
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_item_names) AS requested(value)
    WHERE jsonb_typeof(requested.value) <> 'string'
      OR length(btrim(requested.value #>> '{}')) NOT BETWEEN 1 AND 200
  ) THEN
    RAISE EXCEPTION 'Every PS99 deposit item must have a valid name.';
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
    IF existing_deposit.profile_id <> p_profile_id
       OR existing_deposit.roblox_id <> p_roblox_id THEN
      RAISE EXCEPTION 'This PS99 trade ID is already associated with another user.';
    END IF;
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

-- ===== Coinflip item tax stock and settlement =====
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Physical PS99 items cannot be split. When the exact 12.5% value falls
-- inside an item, the complete item is retained here and the winner receives
-- the untaxed remainder as a coin balance credit.
CREATE TABLE IF NOT EXISTS public.tax_stock (
  id uuid PRIMARY KEY,
  item_id uuid REFERENCES public.items(id) ON DELETE SET NULL,
  item_uuid uuid NOT NULL UNIQUE,
  name text NOT NULL,
  value integer NOT NULL CHECK (value >= 0),
  image_url text,
  type text,
  source_game_type text NOT NULL CHECK (source_game_type IN ('coinflip')),
  source_game_id uuid NOT NULL,
  winner_profile_id text NOT NULL,
  tax_rate_bps smallint NOT NULL DEFAULT 1250 CHECK (tax_rate_bps = 1250),
  taxed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_game_type, source_game_id, id)
);

CREATE INDEX IF NOT EXISTS tax_stock_source_game_idx
  ON public.tax_stock (source_game_type, source_game_id);
CREATE INDEX IF NOT EXISTS tax_stock_taxed_at_idx
  ON public.tax_stock (taxed_at DESC);
CREATE INDEX IF NOT EXISTS tax_stock_item_id_idx
  ON public.tax_stock (item_id);

ALTER TABLE public.tax_stock ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tax_stock FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tax_stock TO service_role;

COMMENT ON TABLE public.tax_stock IS
  'Server-owned custody for whole PS99 items retained to fund Coinflip tax.';

ALTER TABLE public.coinflip_games
  ADD COLUMN IF NOT EXISTS tax_rate_bps smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_value bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_stock_value bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_change_value bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS net_payout_value bigint NOT NULL DEFAULT 0;

ALTER TABLE public.coinflip_games
  DROP CONSTRAINT IF EXISTS coinflip_games_tax_rate_check,
  DROP CONSTRAINT IF EXISTS coinflip_games_tax_values_check,
  DROP CONSTRAINT IF EXISTS coinflip_games_tax_items_check;
ALTER TABLE public.coinflip_games
  ADD CONSTRAINT coinflip_games_tax_rate_check CHECK (tax_rate_bps IN (0, 1250)),
  ADD CONSTRAINT coinflip_games_tax_values_check CHECK (
    tax_value >= 0 AND tax_stock_value >= tax_value AND tax_change_value = tax_stock_value - tax_value
    AND net_payout_value >= 0
  ),
  ADD CONSTRAINT coinflip_games_tax_items_check CHECK (jsonb_typeof(tax_items) = 'array');
-- Historical settled rows remain accurately marked as untaxed. Any open round
-- and every newly-created round uses the new rate.
UPDATE public.coinflip_games
SET tax_rate_bps = 1250
WHERE result IS NULL AND canceled = false;
ALTER TABLE public.coinflip_games ALTER COLUMN tax_rate_bps SET DEFAULT 1250;

-- Choose the lowest-valued whole items until their stock value covers the
-- exact tax target. The excess is returned to the winner as coins.
CREATE OR REPLACE FUNCTION public.select_pvp_tax_item_ids(
  p_items jsonb,
  p_tax_value bigint
)
RETURNS uuid[]
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  selected_ids uuid[] := '{}'::uuid[];
  selected_value bigint := 0;
  selected_item record;
BEGIN
  IF p_tax_value <= 0 THEN RETURN selected_ids; END IF;

  FOR selected_item IN
    SELECT
      (entry.item->>'id')::uuid AS inventory_id,
      (entry.item->>'value')::bigint AS item_value
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_items) = 'array' THEN p_items ELSE '[]'::jsonb END) entry(item)
    WHERE COALESCE(entry.item->>'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      AND COALESCE(entry.item->>'value', '') ~ '^[0-9]+$'
      AND (entry.item->>'value')::bigint > 0
    ORDER BY (entry.item->>'value')::bigint, (entry.item->>'id')::uuid
  LOOP
    selected_ids := array_append(selected_ids, selected_item.inventory_id);
    selected_value := selected_value + selected_item.item_value;
    EXIT WHEN selected_value >= p_tax_value;
  END LOOP;

  IF selected_value < p_tax_value THEN
    RAISE EXCEPTION 'The item pot cannot cover its tax value.';
  END IF;
  RETURN selected_ids;
END;
$$;

REVOKE ALL ON FUNCTION public.select_pvp_tax_item_ids(jsonb, bigint)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.settle_resolved_coinflip_items()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  expected_opponent_items integer;
  removed_opponent_items integer;
  expected_pot_items integer;
  inserted_winner_items integer := 0;
  inserted_tax_items integer := 0;
  updated_winner integer := 0;
  gross_pot_value bigint := 0;
  tax_item_ids uuid[] := '{}'::uuid[];
  all_pot_items jsonb := '[]'::jsonb;
BEGIN
  IF NEW.result IS NULL OR OLD.result IS NOT NULL THEN RETURN NEW; END IF;
  IF NULLIF(NEW.opponent_uuid, '') IS NULL
     OR NULLIF(NEW.winner_uuid, '') IS NULL
     OR NEW.winner_uuid NOT IN (NEW.creator_uuid, NEW.opponent_uuid) THEN
    RAISE EXCEPTION 'Invalid resolved coinflip participants or winner';
  END IF;

  SELECT count(DISTINCT item->>'id') INTO expected_opponent_items
  FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(NEW.opponent_items) = 'array' THEN NEW.opponent_items ELSE '[]'::jsonb END
  ) wager(item)
  WHERE NULLIF(item->>'id', '') IS NOT NULL;
  IF expected_opponent_items = 0 THEN
    RAISE EXCEPTION 'A coinflip opponent must escrow at least one item';
  END IF;

  DELETE FROM public.inventory_items inventory
  WHERE inventory.user_id = NEW.opponent_uuid
    AND inventory.id::text IN (
      SELECT item->>'id'
      FROM jsonb_array_elements(NEW.opponent_items) wager(item)
      WHERE NULLIF(item->>'id', '') IS NOT NULL
    );
  GET DIAGNOSTICS removed_opponent_items = ROW_COUNT;
  IF removed_opponent_items <> expected_opponent_items THEN
    RAISE EXCEPTION 'One or more opponent coinflip items are no longer owned';
  END IF;

  all_pot_items :=
    (CASE WHEN jsonb_typeof(NEW.creator_items) = 'array' THEN NEW.creator_items ELSE '[]'::jsonb END)
    || (CASE WHEN jsonb_typeof(NEW.opponent_items) = 'array' THEN NEW.opponent_items ELSE '[]'::jsonb END);

  SELECT count(DISTINCT item->>'id'), COALESCE(sum((item->>'value')::bigint), 0)
  INTO expected_pot_items, gross_pot_value
  FROM jsonb_array_elements(all_pot_items) pot(item)
  WHERE COALESCE(item->>'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND COALESCE(item->>'value', '') ~ '^[0-9]+$';
  IF expected_pot_items = 0 OR gross_pot_value <= 0 THEN
    RAISE EXCEPTION 'The Coinflip pot is invalid';
  END IF;

  -- A 12.5% whole-item tax requires at least eight items before a complete
  -- item can represent one eighth of the pot. Smaller pots remain untaxed so
  -- settlement never retains too much of a low-item-count wager.
  IF expected_pot_items < 8 THEN
    NEW.tax_rate_bps := 0;
    NEW.tax_value := 0;
    tax_item_ids := '{}'::uuid[];
  ELSE
    NEW.tax_rate_bps := 1250;
    NEW.tax_value := floor(gross_pot_value::numeric * NEW.tax_rate_bps / 10000)::bigint;
    tax_item_ids := public.select_pvp_tax_item_ids(all_pot_items, NEW.tax_value);
  END IF;

  SELECT
    COALESCE(sum((item->>'value')::bigint), 0),
    COALESCE(jsonb_agg(item ORDER BY (item->>'value')::bigint, item->>'id'), '[]'::jsonb)
  INTO NEW.tax_stock_value, NEW.tax_items
  FROM jsonb_array_elements(all_pot_items) pot(item)
  WHERE (item->>'id')::uuid = ANY(tax_item_ids);

  NEW.tax_change_value := NEW.tax_stock_value - NEW.tax_value;
  NEW.net_payout_value := gross_pot_value - NEW.tax_value;

  INSERT INTO public.tax_stock (
    id, item_id, item_uuid, name, value, image_url, type,
    source_game_type, source_game_id, winner_profile_id, tax_rate_bps
  )
  SELECT
    (item->>'id')::uuid,
    CASE WHEN COALESCE(item->>'item_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN (item->>'item_id')::uuid ELSE NULL END,
    CASE WHEN COALESCE(item->>'item_uuid', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN (item->>'item_uuid')::uuid ELSE (item->>'id')::uuid END,
    COALESCE(NULLIF(item->>'name', ''), 'Unknown item'),
    (item->>'value')::integer,
    NULLIF(item->>'image_url', ''),
    NULLIF(item->>'type', ''),
    'coinflip', NEW.id, NEW.winner_uuid, NEW.tax_rate_bps
  FROM jsonb_array_elements(all_pot_items) pot(item)
  WHERE (item->>'id')::uuid = ANY(tax_item_ids);
  GET DIAGNOSTICS inserted_tax_items = ROW_COUNT;

  INSERT INTO public.inventory_items (
    id, item_id, item_uuid, user_id, name, value, image_url, type, created_at, updated_at
  )
  SELECT
    (item->>'id')::uuid,
    CASE WHEN COALESCE(item->>'item_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN (item->>'item_id')::uuid ELSE NULL END,
    CASE WHEN COALESCE(item->>'item_uuid', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN (item->>'item_uuid')::uuid ELSE (item->>'id')::uuid END,
    NEW.winner_uuid,
    COALESCE(NULLIF(item->>'name', ''), 'Unknown item'),
    (item->>'value')::integer,
    NULLIF(item->>'image_url', ''),
    NULLIF(item->>'type', ''),
    now(), now()
  FROM jsonb_array_elements(all_pot_items) pot(item)
  WHERE NOT ((item->>'id')::uuid = ANY(tax_item_ids));
  GET DIAGNOSTICS inserted_winner_items = ROW_COUNT;

  IF inserted_tax_items + inserted_winner_items <> expected_pot_items THEN
    RAISE EXCEPTION 'The complete Coinflip pot could not be distributed';
  END IF;

  UPDATE public.user_profiles
  SET balance = COALESCE(balance, 0) + NEW.tax_change_value,
      updated_at = now()
  WHERE id::text = NEW.winner_uuid;
  GET DIAGNOSTICS updated_winner = ROW_COUNT;
  IF updated_winner <> 1 THEN RAISE EXCEPTION 'The Coinflip winner profile could not be updated'; END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS settle_resolved_coinflip_items_trigger ON public.coinflip_games;
CREATE TRIGGER settle_resolved_coinflip_items_trigger
BEFORE UPDATE OF result ON public.coinflip_games
FOR EACH ROW
WHEN (NEW.result IS NOT NULL AND OLD.result IS NULL)
EXECUTE FUNCTION public.settle_resolved_coinflip_items();

REVOKE ALL ON FUNCTION public.settle_resolved_coinflip_items()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.update_resolved_coinflip_profile_stats()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  creator_wager bigint;
  opponent_wager bigint;
  winner_wager bigint;
  updated_profiles integer;
BEGIN
  IF NEW.result IS NULL OR OLD.result IS NOT NULL THEN RETURN NEW; END IF;
  IF NULLIF(NEW.creator_uuid, '') IS NULL OR NULLIF(NEW.opponent_uuid, '') IS NULL
     OR NEW.creator_uuid = NEW.opponent_uuid OR NULLIF(NEW.winner_uuid, '') IS NULL
     OR NEW.winner_uuid NOT IN (NEW.creator_uuid, NEW.opponent_uuid) THEN
    RAISE EXCEPTION 'Invalid resolved coinflip participants or winner';
  END IF;

  SELECT COALESCE(sum(CASE WHEN COALESCE(item->>'value', '') ~ '^[0-9]+$'
    THEN (item->>'value')::bigint ELSE 0 END), 0)
  INTO creator_wager
  FROM jsonb_array_elements(CASE WHEN jsonb_typeof(NEW.creator_items) = 'array' THEN NEW.creator_items ELSE '[]'::jsonb END) wager(item);
  SELECT COALESCE(sum(CASE WHEN COALESCE(item->>'value', '') ~ '^[0-9]+$'
    THEN (item->>'value')::bigint ELSE 0 END), 0)
  INTO opponent_wager
  FROM jsonb_array_elements(CASE WHEN jsonb_typeof(NEW.opponent_items) = 'array' THEN NEW.opponent_items ELSE '[]'::jsonb END) wager(item);
  IF creator_wager <= 0 OR opponent_wager <= 0 THEN
    RAISE EXCEPTION 'Resolved coinflip wagers must have a positive value';
  END IF;
  winner_wager := CASE WHEN NEW.winner_uuid = NEW.creator_uuid THEN creator_wager ELSE opponent_wager END;

  UPDATE public.user_profiles profile
  SET played = profile.played + CASE WHEN profile.id::text = NEW.creator_uuid THEN creator_wager ELSE opponent_wager END,
      won = profile.won + CASE WHEN profile.id::text = NEW.winner_uuid
        THEN GREATEST(NEW.net_payout_value - winner_wager, 0) ELSE 0 END,
      lost = profile.lost + CASE WHEN profile.id::text = NEW.winner_uuid THEN 0
        WHEN profile.id::text = NEW.creator_uuid THEN creator_wager ELSE opponent_wager END,
      updated_at = now()
  WHERE profile.id::text IN (NEW.creator_uuid, NEW.opponent_uuid);
  GET DIAGNOSTICS updated_profiles = ROW_COUNT;
  IF updated_profiles <> 2 THEN RAISE EXCEPTION 'Both coinflip participant profiles must exist'; END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.update_resolved_coinflip_profile_stats()
  FROM PUBLIC, anon, authenticated;


-- ===== 20260813010000_add_coinflip_game_mode.sql =====
ALTER TABLE public.coinflip_games
  ADD COLUMN IF NOT EXISTS game_mode text;

ALTER TABLE public.coinflip_games
  DROP CONSTRAINT IF EXISTS coinflip_games_game_mode_check;

ALTER TABLE public.coinflip_games
  ADD CONSTRAINT coinflip_games_game_mode_check
  CHECK (game_mode IS NULL OR game_mode IN (
    'mm2', 'adm', 'ps99', 'gems_only', 'titanics_only'
  )) NOT VALID;

-- ===== 20260814010000_expand_ps99_deposit_audit.sql =====
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

-- ===== 20260814020000_ensure_user_profiles_roblox_id.sql =====
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS roblox_id text;

UPDATE public.user_profiles
SET roblox_id = substring(id::text FROM 8)
WHERE roblox_id IS NULL
  AND id::text LIKE 'roblox:%'
  AND substring(id::text FROM 8) ~ '^[0-9]+$';

ALTER TABLE public.user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_roblox_id_is_numeric;

ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_roblox_id_is_numeric
  CHECK (roblox_id IS NULL OR roblox_id ~ '^[0-9]+$');

CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_roblox_id_unique
  ON public.user_profiles (roblox_id)
  WHERE roblox_id IS NOT NULL;

-- ===== 20260814030000_prevent_canceled_withdrawal_delivery.sql =====
-- A withdrawal claim is a delivery lock, not a short-lived cache entry.
-- Never expire it based only on elapsed time: an old Roblox trade can still be
-- open and capable of transferring assets. Claims are released explicitly by
-- the authenticated bot only after Roblox confirms cancellation or disconnect.

CREATE OR REPLACE FUNCTION public.claim_ps99_withdrawals(
  p_profile_id text,
  p_bot_roblox_id text,
  p_claim_token text
)
RETURNS TABLE (withdrawal_id uuid, item_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NULLIF(btrim(p_profile_id), '') IS NULL
    OR NULLIF(btrim(p_bot_roblox_id), '') IS NULL
    OR NULLIF(btrim(p_claim_token), '') IS NULL
    OR length(p_claim_token) > 128 THEN
    RAISE EXCEPTION 'Valid profile, bot, and claim identifiers are required.';
  END IF;

  RETURN QUERY
  WITH claimable AS (
    SELECT pending.id
    FROM public.withdraws AS pending
    WHERE pending.user_id = p_profile_id
      AND pending.canceled IS FALSE
      AND pending.completed_at IS NULL
      AND pending.item_type = 'PS99'
      AND (
        (
          pending.claim_token IS NULL
          AND pending.claimed_at IS NULL
          AND pending.claimed_by_bot IS NULL
        )
        OR (
          pending.claim_token = p_claim_token
          AND pending.claimed_by_bot = p_bot_roblox_id
        )
      )
    ORDER BY pending.withdrawed_at, pending.id
    LIMIT 100
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.withdraws AS claimed
  SET claim_token = p_claim_token,
      claimed_at = COALESCE(claimed.claimed_at, now()),
      claimed_by_bot = p_bot_roblox_id
  FROM claimable
  WHERE claimed.id = claimable.id
  RETURNING claimed.id, claimed.item_name;
END;
$$;

-- Manual recovery only. An operator must first verify that the Roblox trade is
-- closed. Requiring the exact row IDs, claim token, and bot ID prevents a broad
-- or accidental unlock, and this function is never exposed to site users.
CREATE OR REPLACE FUNCTION public.recover_ps99_withdrawal_claims(
  p_withdrawal_uuids uuid[],
  p_claim_token text,
  p_bot_roblox_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requested_count integer;
  v_released_count integer;
BEGIN
  v_requested_count := COALESCE(cardinality(p_withdrawal_uuids), 0);
  IF v_requested_count = 0 OR v_requested_count > 100 THEN
    RAISE EXCEPTION 'Select between 1 and 100 withdrawal claims to recover.';
  END IF;
  IF NULLIF(btrim(p_claim_token), '') IS NULL
    OR NULLIF(btrim(p_bot_roblox_id), '') IS NULL THEN
    RAISE EXCEPTION 'The exact claim token and bot ID are required.';
  END IF;

  UPDATE public.withdraws
  SET claim_token = NULL,
      claimed_at = NULL,
      claimed_by_bot = NULL
  WHERE id = ANY(p_withdrawal_uuids)
    AND claim_token = p_claim_token
    AND claimed_by_bot = p_bot_roblox_id
    AND canceled IS FALSE
    AND completed_at IS NULL;

  GET DIAGNOSTICS v_released_count = ROW_COUNT;
  IF v_released_count <> v_requested_count THEN
    RAISE EXCEPTION 'The requested claims did not exactly match the supplied token and bot.';
  END IF;

  RETURN jsonb_build_object('released_count', v_released_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_item_withdrawals(
  p_profile_id text,
  p_withdrawal_uuids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requested_count integer;
  v_available_count integer;
BEGIN
  v_requested_count := COALESCE(cardinality(p_withdrawal_uuids), 0);
  IF v_requested_count = 0 OR v_requested_count > 100 THEN
    RAISE EXCEPTION 'Select between 1 and 100 withdrawals to cancel.';
  END IF;
  IF v_requested_count <> (
    SELECT count(DISTINCT requested.withdrawal_uuid)
    FROM unnest(p_withdrawal_uuids) AS requested(withdrawal_uuid)
  ) THEN
    RAISE EXCEPTION 'Duplicate withdrawal IDs are not allowed.';
  END IF;

  PERFORM 1
  FROM public.withdraws
  WHERE id = ANY(p_withdrawal_uuids)
    AND user_id = p_profile_id
  ORDER BY id
  FOR UPDATE;

  SELECT count(*)::integer INTO v_available_count
  FROM public.withdraws
  WHERE id = ANY(p_withdrawal_uuids)
    AND user_id = p_profile_id
    AND canceled IS FALSE
    AND completed_at IS NULL
    AND claim_token IS NULL
    AND claimed_at IS NULL
    AND claimed_by_bot IS NULL;

  IF v_available_count <> v_requested_count THEN
    RAISE EXCEPTION 'One or more withdrawals are completed, actively claimed by a bot, or unavailable.';
  END IF;

  INSERT INTO public.inventory_items (id, user_id, name, value, image_url, type, created_at, updated_at)
  SELECT COALESCE(item_id, gen_random_uuid()), p_profile_id,
         COALESCE(NULLIF(item_name, ''), 'Unknown item'), COALESCE(value, 0), image_url, item_type, now(), now()
  FROM public.withdraws
  WHERE id = ANY(p_withdrawal_uuids)
    AND user_id = p_profile_id
    AND canceled IS FALSE
    AND completed_at IS NULL
    AND claim_token IS NULL
    AND claimed_at IS NULL
    AND claimed_by_bot IS NULL;

  UPDATE public.withdraws
  SET canceled = TRUE,
      claim_token = NULL,
      claimed_at = NULL,
      claimed_by_bot = NULL
  WHERE id = ANY(p_withdrawal_uuids)
    AND user_id = p_profile_id
    AND canceled IS FALSE
    AND completed_at IS NULL
    AND claim_token IS NULL
    AND claimed_at IS NULL
    AND claimed_by_bot IS NULL;

  RETURN jsonb_build_object('canceled_count', v_available_count);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_ps99_withdrawals(text, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_item_withdrawals(text, uuid[])
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recover_ps99_withdrawal_claims(uuid[], text, text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_ps99_withdrawals(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_item_withdrawals(text, uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.recover_ps99_withdrawal_claims(uuid[], text, text) TO service_role;

COMMENT ON FUNCTION public.claim_ps99_withdrawals(text, text, text) IS
  'Claims pending PS99 withdrawals without time-based expiry; only the same bot claim may retry idempotently.';
COMMENT ON FUNCTION public.cancel_item_withdrawals(text, uuid[]) IS
  'Returns unclaimed withdrawals to inventory; actively claimed withdrawals cannot be canceled.';
COMMENT ON FUNCTION public.recover_ps99_withdrawal_claims(uuid[], text, text) IS
  'Service-role-only manual recovery after an operator verifies the corresponding Roblox trade is closed.';

-- ===== 20260814040000_ensure_coinflip_game_mode.sql =====
-- Ensure the optional Coinflip wager lock exists even on environments where
-- the original migration was skipped, then explicitly refresh PostgREST's
-- schema cache so inserts can use the column immediately.
ALTER TABLE public.coinflip_games
  ADD COLUMN IF NOT EXISTS game_mode text;

ALTER TABLE public.coinflip_games
  DROP CONSTRAINT IF EXISTS coinflip_games_game_mode_check;

ALTER TABLE public.coinflip_games
  ADD CONSTRAINT coinflip_games_game_mode_check
  CHECK (game_mode IS NULL OR game_mode IN (
    'mm2', 'adm', 'ps99', 'gems_only', 'titanics_only'
  )) NOT VALID;

NOTIFY pgrst, 'reload schema';

-- ===== 20260815010000_exempt_small_coinflips_from_tax.sql =====
-- Coinflip pots with fewer than eight items transfer every escrowed item to
-- the winner. Eight or more items keep the existing 12.5% item tax.
CREATE OR REPLACE FUNCTION public.settle_resolved_coinflip_items()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  expected_opponent_items integer;
  removed_opponent_items integer;
  expected_pot_items integer;
  inserted_winner_items integer := 0;
  inserted_tax_items integer := 0;
  updated_winner integer := 0;
  gross_pot_value bigint := 0;
  tax_item_ids uuid[] := '{}'::uuid[];
  all_pot_items jsonb := '[]'::jsonb;
BEGIN
  IF NEW.result IS NULL OR OLD.result IS NOT NULL THEN RETURN NEW; END IF;
  IF NULLIF(NEW.opponent_uuid, '') IS NULL
     OR NULLIF(NEW.winner_uuid, '') IS NULL
     OR NEW.winner_uuid NOT IN (NEW.creator_uuid, NEW.opponent_uuid) THEN
    RAISE EXCEPTION 'Invalid resolved coinflip participants or winner';
  END IF;

  SELECT count(DISTINCT item->>'id') INTO expected_opponent_items
  FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(NEW.opponent_items) = 'array' THEN NEW.opponent_items ELSE '[]'::jsonb END
  ) wager(item)
  WHERE NULLIF(item->>'id', '') IS NOT NULL;
  IF expected_opponent_items = 0 THEN
    RAISE EXCEPTION 'A coinflip opponent must escrow at least one item';
  END IF;

  DELETE FROM public.inventory_items inventory
  WHERE inventory.user_id = NEW.opponent_uuid
    AND inventory.id::text IN (
      SELECT item->>'id'
      FROM jsonb_array_elements(NEW.opponent_items) wager(item)
      WHERE NULLIF(item->>'id', '') IS NOT NULL
    );
  GET DIAGNOSTICS removed_opponent_items = ROW_COUNT;
  IF removed_opponent_items <> expected_opponent_items THEN
    RAISE EXCEPTION 'One or more opponent coinflip items are no longer owned';
  END IF;

  all_pot_items :=
    (CASE WHEN jsonb_typeof(NEW.creator_items) = 'array' THEN NEW.creator_items ELSE '[]'::jsonb END)
    || (CASE WHEN jsonb_typeof(NEW.opponent_items) = 'array' THEN NEW.opponent_items ELSE '[]'::jsonb END);

  SELECT count(DISTINCT item->>'id'), COALESCE(sum((item->>'value')::bigint), 0)
  INTO expected_pot_items, gross_pot_value
  FROM jsonb_array_elements(all_pot_items) pot(item)
  WHERE COALESCE(item->>'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND COALESCE(item->>'value', '') ~ '^[0-9]+$';
  IF expected_pot_items = 0 OR gross_pot_value <= 0 THEN
    RAISE EXCEPTION 'The Coinflip pot is invalid';
  END IF;

  IF expected_pot_items < 8 THEN
    NEW.tax_rate_bps := 0;
    NEW.tax_value := 0;
    tax_item_ids := '{}'::uuid[];
  ELSE
    NEW.tax_rate_bps := 1250;
    NEW.tax_value := floor(gross_pot_value::numeric * NEW.tax_rate_bps / 10000)::bigint;
    tax_item_ids := public.select_pvp_tax_item_ids(all_pot_items, NEW.tax_value);
  END IF;

  SELECT
    COALESCE(sum((item->>'value')::bigint), 0),
    COALESCE(jsonb_agg(item ORDER BY (item->>'value')::bigint, item->>'id'), '[]'::jsonb)
  INTO NEW.tax_stock_value, NEW.tax_items
  FROM jsonb_array_elements(all_pot_items) pot(item)
  WHERE (item->>'id')::uuid = ANY(tax_item_ids);

  NEW.tax_change_value := NEW.tax_stock_value - NEW.tax_value;
  NEW.net_payout_value := gross_pot_value - NEW.tax_value;

  INSERT INTO public.tax_stock (
    id, item_id, item_uuid, name, value, image_url, type,
    source_game_type, source_game_id, winner_profile_id, tax_rate_bps
  )
  SELECT
    (item->>'id')::uuid,
    CASE WHEN COALESCE(item->>'item_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN (item->>'item_id')::uuid ELSE NULL END,
    CASE WHEN COALESCE(item->>'item_uuid', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN (item->>'item_uuid')::uuid ELSE (item->>'id')::uuid END,
    COALESCE(NULLIF(item->>'name', ''), 'Unknown item'),
    (item->>'value')::integer,
    NULLIF(item->>'image_url', ''),
    NULLIF(item->>'type', ''),
    'coinflip', NEW.id, NEW.winner_uuid, NEW.tax_rate_bps
  FROM jsonb_array_elements(all_pot_items) pot(item)
  WHERE (item->>'id')::uuid = ANY(tax_item_ids);
  GET DIAGNOSTICS inserted_tax_items = ROW_COUNT;

  INSERT INTO public.inventory_items (
    id, item_id, item_uuid, user_id, name, value, image_url, type, created_at, updated_at
  )
  SELECT
    (item->>'id')::uuid,
    CASE WHEN COALESCE(item->>'item_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN (item->>'item_id')::uuid ELSE NULL END,
    CASE WHEN COALESCE(item->>'item_uuid', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN (item->>'item_uuid')::uuid ELSE (item->>'id')::uuid END,
    NEW.winner_uuid,
    COALESCE(NULLIF(item->>'name', ''), 'Unknown item'),
    (item->>'value')::integer,
    NULLIF(item->>'image_url', ''),
    NULLIF(item->>'type', ''),
    now(), now()
  FROM jsonb_array_elements(all_pot_items) pot(item)
  WHERE NOT ((item->>'id')::uuid = ANY(tax_item_ids));
  GET DIAGNOSTICS inserted_winner_items = ROW_COUNT;

  IF inserted_tax_items + inserted_winner_items <> expected_pot_items THEN
    RAISE EXCEPTION 'The complete Coinflip pot could not be distributed';
  END IF;

  UPDATE public.user_profiles
  SET balance = COALESCE(balance, 0) + NEW.tax_change_value,
      updated_at = now()
  WHERE id::text = NEW.winner_uuid;
  GET DIAGNOSTICS updated_winner = ROW_COUNT;
  IF updated_winner <> 1 THEN RAISE EXCEPTION 'The Coinflip winner profile could not be updated'; END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.settle_resolved_coinflip_items()
  FROM PUBLIC, anon, authenticated;

-- ===== 20260816012000_add_user_profile_bans.sql =====
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS is_banned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS banned_at timestamptz,
  ADD COLUMN IF NOT EXISTS banned_by text;

COMMENT ON COLUMN public.user_profiles.is_banned IS
  'Prevents the profile from creating or continuing an authenticated site session.';

-- ===== 20260824010000_scope_coinflips_by_game.sql =====
ALTER TABLE public.coinflip_games
  ADD COLUMN IF NOT EXISTS game_mode text;

ALTER TABLE public.coinflip_games
  DROP CONSTRAINT IF EXISTS coinflip_games_game_mode_check;

ALTER TABLE public.coinflip_games
  ADD CONSTRAINT coinflip_games_game_mode_check
  CHECK (game_mode IS NULL OR game_mode IN (
    'mm2',
    'adm',
    'ps99',
    'gems_only',
    'titanics_only'
  )) NOT VALID;

-- Normalize values written by older builds before validating the final
-- constraint. Unknown legacy labels are inferred from their wager items below.
UPDATE public.coinflip_games
SET game_mode = CASE
  WHEN game_mode IS NULL OR btrim(game_mode) = '' THEN NULL
  WHEN lower(btrim(game_mode)) IN ('mm2', 'murder mystery 2', 'murder_mystery_2') THEN 'mm2'
  WHEN lower(btrim(game_mode)) IN ('adm', 'amp', 'adopt me', 'adopt_me') THEN 'adm'
  WHEN lower(btrim(game_mode)) IN ('ps99', 'pet simulator 99', 'pet_simulator_99') THEN 'ps99'
  WHEN lower(btrim(game_mode)) IN ('gems', 'gem_only', 'gems-only', 'gems_only') THEN 'gems_only'
  WHEN lower(btrim(game_mode)) IN (
    'titanic', 'titanics', 'titanic_only', 'titanics-only',
    'titanics_only', 'titanic_gems', 'titanic+gems'
  ) THEN 'titanics_only'
  ELSE NULL
END;

UPDATE public.coinflip_games
SET game_mode = CASE
  WHEN lower(COALESCE(creator_items -> 0 ->> 'type', creator_items -> 0 ->> 'game', creator_items -> 0 ->> 'item_type', '')) LIKE '%mm2%'
    OR lower(COALESCE(creator_items -> 0 ->> 'type', creator_items -> 0 ->> 'game', creator_items -> 0 ->> 'item_type', '')) LIKE '%murder%'
    THEN 'mm2'
  WHEN lower(COALESCE(creator_items -> 0 ->> 'type', creator_items -> 0 ->> 'game', creator_items -> 0 ->> 'item_type', '')) IN ('adm', 'amp')
    OR lower(COALESCE(creator_items -> 0 ->> 'type', creator_items -> 0 ->> 'game', creator_items -> 0 ->> 'item_type', '')) LIKE '%adopt%'
    THEN 'adm'
  WHEN lower(COALESCE(creator_items -> 0 ->> 'type', creator_items -> 0 ->> 'game', creator_items -> 0 ->> 'item_type', '')) LIKE '%ps99%'
    OR lower(COALESCE(creator_items -> 0 ->> 'type', creator_items -> 0 ->> 'game', creator_items -> 0 ->> 'item_type', '')) LIKE '%pet sim%'
    THEN 'ps99'
  ELSE game_mode
END
WHERE game_mode IS NULL
  AND jsonb_typeof(creator_items) = 'array'
  AND jsonb_array_length(creator_items) > 0;

ALTER TABLE public.coinflip_games
  VALIDATE CONSTRAINT coinflip_games_game_mode_check;

CREATE INDEX IF NOT EXISTS coinflip_games_game_mode_resolved_idx
  ON public.coinflip_games (game_mode, resolved_at DESC)
  WHERE canceled = false AND result IS NOT NULL;

NOTIFY pgrst, 'reload schema';

-- Persistent admin switches for retained services only.
DROP TABLE IF EXISTS public.site_service_settings CASCADE;
CREATE TABLE public.site_service_settings (
  service_key text PRIMARY KEY CHECK (service_key IN ('coinflip', 'chat')),
  enabled boolean NOT NULL DEFAULT true,
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- MM2 and AMP catalogs contain legitimate sub-unit values. Keep four decimal
-- places so catalog imports and owned-item snapshots never round them to zero.
-- MM2 also has distinct knife/gun records that intentionally share a cleaned
-- display name and are identified by their UUID/image instead.
ALTER TABLE public.items
  DROP CONSTRAINT IF EXISTS items_name_type_key;

ALTER TABLE public.items
  ALTER COLUMN value TYPE numeric(20, 4) USING value::numeric;

-- Older databases may still have this trigger. PostgreSQL will not change the
-- value column's type while its trigger definition references that column, so
-- preserve the exact definition, recreate it after the conversion, and leave
-- fresh databases (where the legacy trigger is absent) untouched.
DO $fractional_inventory_values$
DECLARE
  saved_trigger_definition text;
BEGIN
  SELECT pg_get_triggerdef(t.oid, true)
    INTO saved_trigger_definition
  FROM pg_trigger AS t
  JOIN pg_class AS c ON c.oid = t.tgrelid
  JOIN pg_namespace AS n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'inventory_items'
    AND t.tgname = 'inventory_items_assign_item_id'
    AND NOT t.tgisinternal
  LIMIT 1;

  IF saved_trigger_definition IS NOT NULL THEN
    DROP TRIGGER inventory_items_assign_item_id ON public.inventory_items;
  END IF;

  ALTER TABLE public.inventory_items
    ALTER COLUMN value TYPE numeric(20, 4) USING value::numeric;

  IF saved_trigger_definition IS NOT NULL THEN
    EXECUTE saved_trigger_definition;
  END IF;
END;
$fractional_inventory_values$;

-- Refresh stale AMP inventory snapshots created while inventory_items.value
-- was still an integer. Prefer the immutable catalog UUID, then repair older
-- unlinked rows by AMP's unique variation name.
UPDATE public.inventory_items AS owned
SET value = catalog.value,
    image_url = catalog.image_url,
    type = 'AMP',
    updated_at = now()
FROM public.items AS catalog
WHERE upper(COALESCE(owned.type, '')) = 'AMP'
  AND upper(COALESCE(catalog.type, '')) = 'AMP'
  AND owned.item_id = catalog.id
  AND (
    owned.value IS DISTINCT FROM catalog.value
    OR owned.image_url IS DISTINCT FROM catalog.image_url
  );

WITH catalog_matches AS (
  SELECT DISTINCT ON (owned.id)
    owned.id AS inventory_id,
    catalog.id AS catalog_id,
    catalog.value,
    catalog.image_url
  FROM public.inventory_items AS owned
  JOIN public.items AS catalog
    ON upper(COALESCE(catalog.type, '')) = 'AMP'
   AND lower(btrim(catalog.name)) = lower(btrim(owned.name))
  WHERE upper(COALESCE(owned.type, '')) = 'AMP'
    AND owned.item_id IS NULL
  ORDER BY
    owned.id,
    (NULLIF(owned.image_url, '') IS NOT DISTINCT FROM NULLIF(catalog.image_url, '')) DESC,
    catalog.updated_at DESC NULLS LAST,
    catalog.id
)
UPDATE public.inventory_items AS owned
SET item_id = match.catalog_id,
    value = match.value,
    image_url = match.image_url,
    type = 'AMP',
    updated_at = now()
FROM catalog_matches AS match
WHERE owned.id = match.inventory_id;

INSERT INTO public.site_service_settings (service_key, enabled)
VALUES ('coinflip', true), ('chat', true);
ALTER TABLE public.site_service_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.site_service_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.site_service_settings TO service_role;

-- Final browser/API permissions for retained private state.
REVOKE ALL ON public.user_profiles FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.inventory_items FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.coinflip_games FROM anon, authenticated;
REVOKE ALL ON public.user_sessions FROM anon, authenticated;
REVOKE ALL ON public.withdraws FROM anon, authenticated;
REVOKE ALL ON public.tips FROM anon, authenticated;
REVOKE ALL ON public.promo_codes FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.giveaways FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.items FROM anon, authenticated;
GRANT SELECT ON public.items, public.inventory_items, public.coinflip_games, public.giveaways TO anon, authenticated;
GRANT ALL ON public.user_profiles, public.user_sessions, public.withdraws, public.tips, public.promo_codes,
  public.inventory_items, public.coinflip_games, public.items, public.giveaways, public.deposits, public.security_events,
  public.tax_stock TO service_role;

ALTER TABLE public.user_profiles
  DROP COLUMN IF EXISTS pearls,
  DROP COLUMN IF EXISTS summer_tickets;

NOTIFY pgrst, 'reload schema';
