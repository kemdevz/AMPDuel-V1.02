-- Accept a Roll bet based on when the trusted API received it, rather than when
-- a potentially delayed Supabase request begins executing.

DROP FUNCTION IF EXISTS public.place_roll_bet(text, uuid, bigint, numeric);

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

  IF p_request_received_at IS NULL OR p_request_received_at > now() + interval '5 seconds' THEN
    RAISE EXCEPTION 'Invalid Roll request timestamp.';
  END IF;

  SELECT * INTO selected_round
  FROM public.roll_rounds
  WHERE id = p_round_id
  FOR UPDATE;

  -- A request accepted immediately before zero can reach Postgres after the
  -- lifecycle has marked the round rolling. Its trusted receipt timestamp is
  -- still before the committed close, so it remains a valid entry.
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

REVOKE ALL ON FUNCTION public.place_roll_bet(text, uuid, bigint, numeric, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.place_roll_bet(text, uuid, bigint, numeric, timestamptz) TO service_role;
