CREATE OR REPLACE FUNCTION public.recover_unreadable_roll_round(
  p_round_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_round public.roll_rounds%ROWTYPE;
  selected_bet public.roll_bets%ROWTYPE;
  refunded_profile_ids jsonb := '[]'::jsonb;
  balance_after_refund bigint;
BEGIN
  SELECT * INTO selected_round
  FROM public.roll_rounds
  WHERE id = p_round_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('recovered', false, 'already_closed', true, 'profile_ids', refunded_profile_ids);
  END IF;

  IF selected_round.status NOT IN ('countdown', 'rolling') THEN
    RETURN jsonb_build_object('recovered', false, 'already_closed', true, 'profile_ids', refunded_profile_ids);
  END IF;

  FOR selected_bet IN
    SELECT *
    FROM public.roll_bets
    WHERE round_id = p_round_id AND outcome = 'pending'
    ORDER BY placed_at, id
    FOR UPDATE
  LOOP
    UPDATE public.user_profiles
    SET balance = COALESCE(balance, 0) + selected_bet.wager_amount,
        updated_at = now()
    WHERE id = selected_bet.profile_id
    RETURNING balance INTO balance_after_refund;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'A Roll participant profile could not be refunded.';
    END IF;

    UPDATE public.roll_bets
    SET outcome = 'refunded',
        payout_amount = selected_bet.wager_amount,
        balance_after_settlement = balance_after_refund,
        settled_at = now()
    WHERE id = selected_bet.id;

    refunded_profile_ids := refunded_profile_ids || jsonb_build_array(selected_bet.profile_id);
  END LOOP;

  UPDATE public.roll_rounds
  SET status = 'cancelled',
      settled_at = now()
  WHERE id = p_round_id;

  RETURN jsonb_build_object(
    'recovered', true,
    'already_closed', false,
    'profile_ids', refunded_profile_ids
  );
END;
$$;

REVOKE ALL ON FUNCTION public.recover_unreadable_roll_round(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recover_unreadable_roll_round(uuid) TO service_role;

COMMENT ON FUNCTION public.recover_unreadable_roll_round(uuid) IS
  'Atomically refunds pending plays and cancels an active Roll round only when the trusted server cannot hydrate its committed state.';
