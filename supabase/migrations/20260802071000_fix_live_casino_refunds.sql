-- Betnex serial numbers are provider-scoped and refund/correction callbacks use
-- negative bet or win values. Support both without losing atomicity.

ALTER TABLE public.live_casino_transactions
  DROP CONSTRAINT IF EXISTS live_casino_transactions_pkey,
  DROP CONSTRAINT IF EXISTS live_casino_transactions_bet_usd_check,
  DROP CONSTRAINT IF EXISTS live_casino_transactions_win_usd_check,
  DROP CONSTRAINT IF EXISTS live_casino_transactions_bet_coins_check,
  DROP CONSTRAINT IF EXISTS live_casino_transactions_win_coins_check;

ALTER TABLE public.live_casino_transactions
  ADD CONSTRAINT live_casino_transactions_pkey
    PRIMARY KEY (game_provider, serial_number);

ALTER TABLE public.live_casino_rounds
  DROP CONSTRAINT IF EXISTS live_casino_rounds_bet_usd_check,
  DROP CONSTRAINT IF EXISTS live_casino_rounds_win_usd_check,
  DROP CONSTRAINT IF EXISTS live_casino_rounds_bet_coins_check,
  DROP CONSTRAINT IF EXISTS live_casino_rounds_win_coins_check;

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
  existing_round public.live_casino_rounds%ROWTYPE;
  bet_coins_value bigint;
  win_coins_value bigint;
  next_balance bigint;
  old_round_bet bigint := 0;
  old_round_win bigint := 0;
  new_round_bet bigint;
  new_round_win bigint;
  old_played bigint;
  old_won bigint;
  old_lost bigint;
  new_played bigint;
  new_won bigint;
  new_lost bigint;
  next_level integer;
  next_xp bigint;
  next_lifetime_xp bigint;
  required_xp bigint;
BEGIN
  IF NULLIF(trim(p_member_account), '') IS NULL
     OR NULLIF(trim(p_serial_number), '') IS NULL
     OR NULLIF(trim(p_game_round), '') IS NULL
     OR NULLIF(trim(p_game_provider), '') IS NULL
     OR p_bet_usd IS NULL OR p_win_usd IS NULL
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
  WHERE game_provider = p_game_provider
    AND serial_number = p_serial_number;

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

  IF abs((bet_coins_value::numeric / selected_session.coins_per_usd) - p_bet_usd) > 0.0000005
     OR abs((win_coins_value::numeric / selected_session.coins_per_usd) - p_win_usd) > 0.0000005 THEN
    RAISE EXCEPTION 'Live Casino amount cannot be represented exactly in Coins.';
  END IF;

  next_balance := COALESCE(selected_profile.balance, 0) - bet_coins_value + win_coins_value;
  IF next_balance < 0 THEN
    RAISE EXCEPTION 'Insufficient coin balance.';
  END IF;

  SELECT * INTO existing_round
  FROM public.live_casino_rounds
  WHERE session_id = selected_session.id
    AND game_round = p_game_round
  FOR UPDATE;

  IF FOUND THEN
    old_round_bet := existing_round.bet_coins;
    old_round_win := existing_round.win_coins;
  END IF;
  new_round_bet := old_round_bet + bet_coins_value;
  new_round_win := old_round_win + win_coins_value;

  old_played := GREATEST(old_round_bet, 0);
  old_won := GREATEST(old_round_win - old_round_bet, 0);
  old_lost := GREATEST(old_round_bet - old_round_win, 0);
  new_played := GREATEST(new_round_bet, 0);
  new_won := GREATEST(new_round_win - new_round_bet, 0);
  new_lost := GREATEST(new_round_bet - new_round_win, 0);

  next_level := LEAST(GREATEST(COALESCE(selected_profile.level, 1), 1), 200);
  next_xp := GREATEST(COALESCE(selected_profile.xp, 0), 0) + GREATEST(bet_coins_value, 0);
  next_lifetime_xp := GREATEST(COALESCE(selected_profile.lifetime_xp, 0), 0) + GREATEST(bet_coins_value, 0);

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
      selected_session.profile_id,
      'live_casino',
      p_game_provider || ':' || p_serial_number,
      bet_coins_value,
      bet_coins_value
    );
  END IF;

  UPDATE public.user_profiles
  SET balance = next_balance,
      played = GREATEST(COALESCE(played, 0) + new_played - old_played, 0),
      won = GREATEST(COALESCE(won, 0) + new_won - old_won, 0),
      lost = GREATEST(COALESCE(lost, 0) + new_lost - old_lost, 0),
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
