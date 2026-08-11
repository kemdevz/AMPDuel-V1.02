-- Supabase installs pgcrypto in the extensions schema. Replace the existing
-- settlement function so its seed commitment check resolves digest reliably.
CREATE OR REPLACE FUNCTION public.settle_jackpot_game(
  p_game_id uuid,
  p_random_value bigint,
  p_server_seed text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_game public.jackpot_games%ROWTYPE;
  v_winner jsonb;
  v_entrant jsonb;
  v_winner_id text;
  v_winner_username text;
  v_winning_ticket bigint;
  v_wager bigint;
  v_inserted_count integer := 0;
  v_expected_count integer := 0;
  v_updated_profiles integer := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('jackpot:' || p_game_id::text, 0));

  SELECT * INTO v_game
  FROM public.jackpot_games
  WHERE id = p_game_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The Jackpot round could not be found.';
  END IF;
  IF v_game.status = 'resolved' THEN
    RETURN to_jsonb(v_game);
  END IF;
  IF v_game.status <> 'countdown' OR v_game.ends_at > now() THEN
    RAISE EXCEPTION 'This Jackpot round is not ready to settle.';
  END IF;
  IF v_game.entrant_count < 1 OR v_game.pot_value <= 0 OR p_random_value < 0 THEN
    RAISE EXCEPTION 'The Jackpot result is invalid.';
  END IF;
  IF encode(extensions.digest(convert_to(p_server_seed, 'UTF8'), 'sha256'::text), 'hex') <> v_game.server_seed_hash THEN
    RAISE EXCEPTION 'The Jackpot server seed does not match its commitment.';
  END IF;

  v_winning_ticket := p_random_value % v_game.pot_value;

  SELECT ranged.entrant INTO v_winner
  FROM (
    SELECT
      entry.entrant,
      sum((entry.entrant->>'value')::bigint) OVER (ORDER BY entry.ordinality) AS range_end
    FROM jsonb_array_elements(v_game.entrants) WITH ORDINALITY AS entry(entrant, ordinality)
  ) AS ranged
  WHERE v_winning_ticket < ranged.range_end
  ORDER BY ranged.range_end
  LIMIT 1;

  IF v_winner IS NULL THEN
    RAISE EXCEPTION 'The Jackpot winner could not be determined.';
  END IF;
  v_winner_id := v_winner->>'profileId';
  v_winner_username := COALESCE(NULLIF(v_winner->>'username', ''), 'Player');

  SELECT jsonb_array_length(v_game.pot_items) INTO v_expected_count;

  INSERT INTO public.inventory_items (
    id, item_id, item_uuid, user_id, name, value, image_url, type, created_at, updated_at
  )
  SELECT
    (item->>'id')::uuid,
    NULLIF(item->>'item_id', '')::uuid,
    COALESCE(NULLIF(item->>'item_uuid', '')::uuid, (item->>'id')::uuid),
    v_winner_id,
    COALESCE(NULLIF(item->>'name', ''), 'Unknown item'),
    (item->>'value')::integer,
    NULLIF(item->>'image_url', ''),
    NULLIF(item->>'type', ''),
    now(),
    now()
  FROM jsonb_array_elements(v_game.pot_items) AS pot(item);

  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;
  IF v_inserted_count <> v_expected_count THEN
    RAISE EXCEPTION 'The complete Jackpot pot could not be paid out.';
  END IF;

  -- A one-person round is refunded without generating played, won, lost, or
  -- XP totals. This prevents risk-free Jackpot stat/XP farming.
  IF v_game.entrant_count = 1 THEN
    UPDATE public.jackpot_games
    SET status = 'cancelled',
        server_seed = p_server_seed,
        resolved_at = now(),
        updated_at = now()
    WHERE id = p_game_id
    RETURNING * INTO v_game;
    RETURN to_jsonb(v_game);
  END IF;

  FOR v_entrant IN SELECT value FROM jsonb_array_elements(v_game.entrants)
  LOOP
    v_wager := (v_entrant->>'value')::bigint;
    UPDATE public.user_profiles
    SET played = COALESCE(played, 0) + v_wager,
        won = COALESCE(won, 0) + CASE
          WHEN id::text = v_winner_id THEN GREATEST(v_game.pot_value - v_wager, 0)
          ELSE 0
        END,
        lost = COALESCE(lost, 0) + CASE WHEN id::text = v_winner_id THEN 0 ELSE v_wager END,
        updated_at = now()
    WHERE id::text = v_entrant->>'profileId';

    GET DIAGNOSTICS v_updated_profiles = ROW_COUNT;
    IF v_updated_profiles <> 1 THEN
      RAISE EXCEPTION 'A Jackpot participant profile could not be updated.';
    END IF;

    PERFORM public.award_profile_game_xp(
      v_entrant->>'profileId',
      'jackpot',
      v_game.id::text,
      v_wager
    );
  END LOOP;

  UPDATE public.jackpot_games
  SET status = 'resolved',
      winning_ticket = v_winning_ticket,
      winner_profile_id = v_winner_id,
      winner_username = v_winner_username,
      server_seed = p_server_seed,
      resolved_at = now(),
      updated_at = now()
  WHERE id = p_game_id
  RETURNING * INTO v_game;

  RETURN to_jsonb(v_game);
END;
$$;

REVOKE ALL ON FUNCTION public.settle_jackpot_game(uuid, bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_jackpot_game(uuid, bigint, text) TO service_role;
