-- Atomic, server-only Roll wagering and settlement.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'roll_bets' AND column_name = 'balance_after'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'roll_bets' AND column_name = 'balance_after_wager'
  ) THEN
    ALTER TABLE public.roll_bets RENAME COLUMN balance_after TO balance_after_wager;
  END IF;
END $$;

ALTER TABLE public.roll_bets
  ADD COLUMN IF NOT EXISTS balance_after_wager bigint,
  ADD COLUMN IF NOT EXISTS balance_after_settlement bigint;

CREATE UNIQUE INDEX IF NOT EXISTS roll_rounds_one_active_uidx
  ON public.roll_rounds ((true))
  WHERE status IN ('countdown', 'rolling');

CREATE OR REPLACE FUNCTION public.place_roll_bet(
  p_profile_id text,
  p_round_id uuid,
  p_wager_amount bigint,
  p_target_multiplier numeric,
  p_request_received_at timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_round public.roll_rounds%ROWTYPE;
  selected_profile public.user_profiles%ROWTYPE;
  created_bet public.roll_bets%ROWTYPE;
  balance_before_value bigint;
  balance_after_value bigint;
  potential_payout_value bigint;
BEGIN
  IF p_wager_amount < 5000 OR p_wager_amount > 1000000 THEN
    RAISE EXCEPTION 'Play amount must be between 5,000 and 1,000,000 coins.';
  END IF;

  IF p_target_multiplier < 1.01 OR p_target_multiplier > 10 THEN
    RAISE EXCEPTION 'Multiplier must be between 1.01x and 10x.';
  END IF;

  SELECT * INTO selected_round
  FROM public.roll_rounds
  WHERE id = p_round_id
  FOR UPDATE;

  IF NOT FOUND OR selected_round.status NOT IN ('countdown', 'rolling') THEN
    RAISE EXCEPTION 'This Roll round is not accepting plays.';
  END IF;

  IF selected_round.betting_closes_at IS NULL OR p_request_received_at >= selected_round.betting_closes_at THEN
    RAISE EXCEPTION 'Betting has closed for this Roll round.';
  END IF;

  SELECT * INTO selected_profile
  FROM public.user_profiles
  WHERE id::text = p_profile_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.roll_bets
    WHERE round_id = p_round_id AND profile_id = selected_profile.id
  ) THEN
    RAISE EXCEPTION 'You already have a play in this Roll round.';
  END IF;

  balance_before_value := COALESCE(selected_profile.balance, 0);
  IF balance_before_value < p_wager_amount THEN
    RAISE EXCEPTION 'Insufficient balance.';
  END IF;

  balance_after_value := balance_before_value - p_wager_amount;
  potential_payout_value := floor(p_wager_amount * p_target_multiplier)::bigint;

  UPDATE public.user_profiles
  SET balance = balance_after_value,
      updated_at = now()
  WHERE id = selected_profile.id;

  INSERT INTO public.roll_bets (
    round_id,
    profile_id,
    username_snapshot,
    avatar_url_snapshot,
    wager_amount,
    target_multiplier,
    potential_payout,
    payout_amount,
    outcome,
    balance_before,
    balance_after_wager,
    placed_at
  ) VALUES (
    p_round_id,
    selected_profile.id,
    COALESCE(selected_profile.username, 'Unknown'),
    COALESCE(selected_profile.avatar_headshot_url, selected_profile.avatar_url),
    p_wager_amount,
    p_target_multiplier,
    potential_payout_value,
    0,
    'pending',
    balance_before_value,
    balance_after_value,
    p_request_received_at
  )
  RETURNING * INTO created_bet;

  RETURN jsonb_build_object(
    'bet', to_jsonb(created_bet),
    'balance', balance_after_value
  );
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'You already have a play in this Roll round.';
END;
$$;

CREATE OR REPLACE FUNCTION public.settle_roll_round(
  p_round_id uuid,
  p_result_multiplier numeric,
  p_result_index integer,
  p_winning_item_id uuid,
  p_winning_item_name text,
  p_winning_item_value bigint,
  p_revealed_server_seed text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_round public.roll_rounds%ROWTYPE;
  selected_bet public.roll_bets%ROWTYPE;
  payout_value bigint;
  balance_after_value bigint;
  bet_outcome text;
  settlements jsonb := '[]'::jsonb;
BEGIN
  IF p_result_multiplier < 1 OR p_result_index < 0 THEN
    RAISE EXCEPTION 'Invalid Roll result.';
  END IF;

  SELECT * INTO selected_round
  FROM public.roll_rounds
  WHERE id = p_round_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Roll round not found.';
  END IF;

  IF selected_round.status = 'settled' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', bet.id,
      'profile_id', bet.profile_id,
      'outcome', bet.outcome,
      'payout_amount', bet.payout_amount,
      'balance', bet.balance_after_settlement
    )), '[]'::jsonb)
    INTO settlements
    FROM public.roll_bets AS bet
    WHERE bet.round_id = p_round_id;

    RETURN jsonb_build_object('already_settled', true, 'settlements', settlements);
  END IF;

  IF selected_round.status <> 'rolling' THEN
    RAISE EXCEPTION 'Roll round is not ready to settle.';
  END IF;

  FOR selected_bet IN
    SELECT * FROM public.roll_bets
    WHERE round_id = p_round_id AND outcome = 'pending'
    ORDER BY placed_at, id
    FOR UPDATE
  LOOP
    IF p_result_multiplier >= selected_bet.target_multiplier THEN
      bet_outcome := 'won';
      payout_value := floor(selected_bet.wager_amount * selected_bet.target_multiplier)::bigint;
    ELSE
      bet_outcome := 'lost';
      payout_value := 0;
    END IF;

    UPDATE public.user_profiles AS profile
    SET balance = COALESCE(profile.balance, 0) + payout_value,
        played = COALESCE(profile.played, 0) + selected_bet.wager_amount,
        won = COALESCE(profile.won, 0) + GREATEST(payout_value - selected_bet.wager_amount, 0),
        lost = COALESCE(profile.lost, 0) + CASE WHEN bet_outcome = 'lost' THEN selected_bet.wager_amount ELSE 0 END,
        updated_at = now()
    WHERE profile.id = selected_bet.profile_id
    RETURNING balance INTO balance_after_value;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'A Roll participant profile could not be settled.';
    END IF;

    UPDATE public.roll_bets
    SET outcome = bet_outcome,
        payout_amount = payout_value,
        balance_after_settlement = balance_after_value,
        settled_at = now()
    WHERE id = selected_bet.id;

    settlements := settlements || jsonb_build_array(jsonb_build_object(
      'id', selected_bet.id,
      'profile_id', selected_bet.profile_id,
      'outcome', bet_outcome,
      'payout_amount', payout_value,
      'balance', balance_after_value
    ));
  END LOOP;

  UPDATE public.roll_rounds
  SET status = 'settled',
      result_multiplier = p_result_multiplier,
      result_index = p_result_index,
      winning_item_id = p_winning_item_id,
      winning_item_name = p_winning_item_name,
      winning_item_value = p_winning_item_value,
      revealed_server_seed = p_revealed_server_seed,
      settled_at = now()
  WHERE id = p_round_id;

  RETURN jsonb_build_object('already_settled', false, 'settlements', settlements);
END;
$$;

REVOKE ALL ON FUNCTION public.place_roll_bet(text, uuid, bigint, numeric, timestamptz)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.settle_roll_round(uuid, numeric, integer, uuid, text, bigint, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.place_roll_bet(text, uuid, bigint, numeric, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_roll_round(uuid, numeric, integer, uuid, text, bigint, text) TO service_role;
