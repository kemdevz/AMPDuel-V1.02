-- Server-authoritative Betnex wallet bridge.
-- Coins remain in user_profiles.balance. Betnex receives a USD-denominated
-- view at launch and every callback atomically applies its USD delta in coins.

ALTER TABLE public.user_profiles
  ALTER COLUMN played TYPE bigint USING COALESCE(played, 0)::bigint,
  ALTER COLUMN won TYPE bigint USING COALESCE(won, 0)::bigint,
  ALTER COLUMN lost TYPE bigint USING COALESCE(lost, 0)::bigint;

CREATE TABLE IF NOT EXISTS public.live_casino_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id text NOT NULL,
  member_account text NOT NULL UNIQUE,
  game_uid text NOT NULL,
  game_name text NOT NULL,
  game_provider text NOT NULL,
  coins_per_usd bigint NOT NULL CHECK (coins_per_usd > 0),
  launch_balance_coins bigint NOT NULL CHECK (launch_balance_coins >= 0),
  launch_balance_usd numeric(24, 6) NOT NULL CHECK (launch_balance_usd >= 0),
  status text NOT NULL DEFAULT 'launching'
    CHECK (status IN ('launching', 'active', 'closed', 'failed')),
  launched_at timestamptz NOT NULL DEFAULT now(),
  last_callback_at timestamptz,
  closed_at timestamptz,
  failure_reason text
);

CREATE INDEX IF NOT EXISTS live_casino_sessions_profile_launched_idx
  ON public.live_casino_sessions (profile_id, launched_at DESC);
CREATE INDEX IF NOT EXISTS live_casino_sessions_member_account_idx
  ON public.live_casino_sessions (member_account);

CREATE TABLE IF NOT EXISTS public.live_casino_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.live_casino_sessions(id) ON DELETE RESTRICT,
  profile_id text NOT NULL,
  game_round text NOT NULL,
  game_uid text NOT NULL,
  game_name text NOT NULL,
  game_provider text NOT NULL,
  currency_code text NOT NULL DEFAULT 'USD',
  bet_usd numeric(24, 6) NOT NULL DEFAULT 0 CHECK (bet_usd >= 0),
  win_usd numeric(24, 6) NOT NULL DEFAULT 0 CHECK (win_usd >= 0),
  bet_coins bigint NOT NULL DEFAULT 0 CHECK (bet_coins >= 0),
  win_coins bigint NOT NULL DEFAULT 0 CHECK (win_coins >= 0),
  callback_count integer NOT NULL DEFAULT 0 CHECK (callback_count >= 0),
  started_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, game_round)
);

CREATE INDEX IF NOT EXISTS live_casino_rounds_profile_updated_idx
  ON public.live_casino_rounds (profile_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.live_casino_transactions (
  serial_number text PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.live_casino_sessions(id) ON DELETE RESTRICT,
  profile_id text NOT NULL,
  game_round text NOT NULL,
  game_uid text NOT NULL,
  game_name text NOT NULL,
  game_provider text NOT NULL,
  currency_code text NOT NULL DEFAULT 'USD',
  bet_usd numeric(24, 6) NOT NULL CHECK (bet_usd >= 0),
  win_usd numeric(24, 6) NOT NULL CHECK (win_usd >= 0),
  bet_coins bigint NOT NULL CHECK (bet_coins >= 0),
  win_coins bigint NOT NULL CHECK (win_coins >= 0),
  balance_before bigint NOT NULL CHECK (balance_before >= 0),
  balance_after bigint NOT NULL CHECK (balance_after >= 0),
  provider_data jsonb,
  processed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS live_casino_transactions_profile_processed_idx
  ON public.live_casino_transactions (profile_id, processed_at DESC);
CREATE INDEX IF NOT EXISTS live_casino_transactions_round_idx
  ON public.live_casino_transactions (session_id, game_round);

ALTER TABLE public.live_casino_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_casino_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_casino_transactions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.live_casino_sessions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.live_casino_rounds FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.live_casino_transactions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.live_casino_sessions TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.live_casino_rounds TO service_role;
GRANT SELECT, INSERT ON public.live_casino_transactions TO service_role;

-- Live Casino wager callbacks are uniquely keyed by serial number, so they can
-- safely participate in the existing one-wagered-coin-equals-one-XP ledger.
ALTER TABLE public.profile_xp_events
  DROP CONSTRAINT IF EXISTS profile_xp_events_game_type_check;
ALTER TABLE public.profile_xp_events
  ADD CONSTRAINT profile_xp_events_game_type_check
  CHECK (game_type IN ('case', 'coinflip', 'mines', 'roll', 'live_casino'));

CREATE OR REPLACE FUNCTION public.process_live_casino_callback(
  p_member_account text,
  p_serial_number text,
  p_game_uid text,
  p_game_round text,
  p_game_name text,
  p_game_provider text,
  p_currency_code text,
  p_bet_usd numeric,
  p_win_usd numeric,
  p_provider_data jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_session public.live_casino_sessions%ROWTYPE;
  selected_profile public.user_profiles%ROWTYPE;
  existing_transaction public.live_casino_transactions%ROWTYPE;
  bet_coins_value bigint;
  win_coins_value bigint;
  next_balance bigint;
  next_level integer;
  next_xp bigint;
  next_lifetime_xp bigint;
  required_xp bigint;
BEGIN
  IF NULLIF(trim(p_member_account), '') IS NULL
     OR NULLIF(trim(p_serial_number), '') IS NULL
     OR NULLIF(trim(p_game_round), '') IS NULL
     OR p_bet_usd IS NULL OR p_bet_usd < 0
     OR p_win_usd IS NULL OR p_win_usd < 0
     OR (p_bet_usd = 0 AND p_win_usd = 0) THEN
    RAISE EXCEPTION 'Invalid Live Casino callback.';
  END IF;

  IF upper(trim(p_currency_code)) <> 'USD' THEN
    RAISE EXCEPTION 'Unsupported Live Casino callback currency.';
  END IF;

  SELECT * INTO selected_session
  FROM public.live_casino_sessions
  WHERE member_account = p_member_account
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Live Casino session not found.';
  END IF;

  SELECT * INTO selected_profile
  FROM public.user_profiles
  WHERE id::text = selected_session.profile_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Live Casino profile not found.';
  END IF;

  SELECT * INTO existing_transaction
  FROM public.live_casino_transactions
  WHERE serial_number = p_serial_number;

  IF FOUND THEN
    IF existing_transaction.session_id <> selected_session.id THEN
      RAISE EXCEPTION 'Live Casino serial number belongs to another session.';
    END IF;
    RETURN jsonb_build_object(
      'duplicate', true,
      'profile_id', selected_session.profile_id,
      'balance_coins', selected_profile.balance,
      'balance_usd', trunc(selected_profile.balance::numeric / selected_session.coins_per_usd, 2)
    );
  END IF;

  bet_coins_value := round(p_bet_usd * selected_session.coins_per_usd)::bigint;
  win_coins_value := round(p_win_usd * selected_session.coins_per_usd)::bigint;

  -- Never silently round a provider amount that cannot be represented as an
  -- exact whole number of Coins at the rate captured for this session.
  IF abs((bet_coins_value::numeric / selected_session.coins_per_usd) - p_bet_usd) > 0.0000005
     OR abs((win_coins_value::numeric / selected_session.coins_per_usd) - p_win_usd) > 0.0000005 THEN
    RAISE EXCEPTION 'Live Casino amount cannot be represented exactly in Coins.';
  END IF;

  IF COALESCE(selected_profile.balance, 0) < bet_coins_value THEN
    RAISE EXCEPTION 'Insufficient coin balance.';
  END IF;

  next_balance := COALESCE(selected_profile.balance, 0) - bet_coins_value + win_coins_value;
  next_level := LEAST(GREATEST(COALESCE(selected_profile.level, 1), 1), 200);
  next_xp := GREATEST(COALESCE(selected_profile.xp, 0), 0) + bet_coins_value;
  next_lifetime_xp := GREATEST(COALESCE(selected_profile.lifetime_xp, 0), 0) + bet_coins_value;

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

  INSERT INTO public.live_casino_transactions (
    serial_number, session_id, profile_id, game_round, game_uid, game_name,
    game_provider, currency_code, bet_usd, win_usd, bet_coins, win_coins,
    balance_before, balance_after, provider_data
  ) VALUES (
    p_serial_number, selected_session.id, selected_session.profile_id,
    p_game_round, p_game_uid, p_game_name, p_game_provider, 'USD',
    p_bet_usd, p_win_usd, bet_coins_value, win_coins_value,
    COALESCE(selected_profile.balance, 0), next_balance, p_provider_data
  );

  INSERT INTO public.live_casino_rounds (
    session_id, profile_id, game_round, game_uid, game_name, game_provider,
    currency_code, bet_usd, win_usd, bet_coins, win_coins, callback_count
  ) VALUES (
    selected_session.id, selected_session.profile_id, p_game_round, p_game_uid,
    p_game_name, p_game_provider, 'USD', p_bet_usd, p_win_usd,
    bet_coins_value, win_coins_value, 1
  )
  ON CONFLICT (session_id, game_round) DO UPDATE
  SET bet_usd = public.live_casino_rounds.bet_usd + EXCLUDED.bet_usd,
      win_usd = public.live_casino_rounds.win_usd + EXCLUDED.win_usd,
      bet_coins = public.live_casino_rounds.bet_coins + EXCLUDED.bet_coins,
      win_coins = public.live_casino_rounds.win_coins + EXCLUDED.win_coins,
      callback_count = public.live_casino_rounds.callback_count + 1,
      updated_at = now();

  IF bet_coins_value > 0 THEN
    INSERT INTO public.profile_xp_events (
      profile_id, game_type, game_id, wager_amount, xp_awarded
    ) VALUES (
      selected_session.profile_id, 'live_casino', p_serial_number,
      bet_coins_value, bet_coins_value
    );
  END IF;

  UPDATE public.user_profiles
  SET balance = next_balance,
      played = COALESCE(played, 0) + bet_coins_value,
      won = COALESCE(won, 0) + GREATEST(win_coins_value - bet_coins_value, 0),
      lost = COALESCE(lost, 0) + GREATEST(bet_coins_value - win_coins_value, 0),
      level = next_level,
      xp = next_xp,
      lifetime_xp = next_lifetime_xp,
      updated_at = now()
  WHERE id::text = selected_session.profile_id
  RETURNING * INTO selected_profile;

  UPDATE public.live_casino_sessions
  SET status = CASE WHEN status IN ('failed', 'closed') THEN status ELSE 'active' END,
      last_callback_at = now()
  WHERE id = selected_session.id;

  RETURN jsonb_build_object(
    'duplicate', false,
    'profile_id', selected_session.profile_id,
    'balance_coins', selected_profile.balance,
    'balance_usd', trunc(selected_profile.balance::numeric / selected_session.coins_per_usd, 2),
    'bet_coins', bet_coins_value,
    'win_coins', win_coins_value
  );
END;
$$;

REVOKE ALL ON FUNCTION public.process_live_casino_callback(
  text, text, text, text, text, text, text, numeric, numeric, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_live_casino_callback(
  text, text, text, text, text, text, text, numeric, numeric, jsonb
) TO service_role;
