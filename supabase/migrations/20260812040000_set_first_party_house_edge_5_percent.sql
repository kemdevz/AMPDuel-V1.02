-- Standardize first-party house games on a 95% return. Jackpot and Coinflip
-- are peer-to-peer games and are intentionally not changed here.

-- Upgrade databases that already ran the original Mines migration. Fresh
-- databases already contain the 0.95 expression in that migration.
DO $$
DECLARE
  function_sql text;
BEGIN
  SELECT pg_get_functiondef(
    'public.reveal_mines_position_secure(text,uuid,integer)'::regprocedure
  ) INTO function_sql;

  IF position('next_multiplier * 0.97' IN function_sql) > 0 THEN
    function_sql := replace(
      function_sql,
      'next_multiplier * 0.97',
      'next_multiplier * 0.95'
    );
    EXECUTE function_sql;
  ELSIF position('next_multiplier * 0.95' IN function_sql) = 0 THEN
    RAISE EXCEPTION 'Unable to locate the Mines return expression.';
  END IF;
END;
$$;

-- Upgrade databases that already ran the original Upgrader migration.
ALTER TABLE public.upgrader_games
  ALTER COLUMN house_edge_bps SET DEFAULT 500;

DO $$
DECLARE
  function_sql text;
BEGIN
  SELECT pg_get_functiondef(
    'public.complete_upgrader_game(text,uuid,text,text,bigint,uuid[],uuid[],numeric,uuid,text,bigint,text,text,numeric,uuid,text,text)'::regprocedure
  ) INTO function_sql;

  IF position('v_wager_value::numeric * 9000' IN function_sql) > 0 THEN
    function_sql := replace(
      function_sql,
      'v_wager_value::numeric * 9000',
      'v_wager_value::numeric * 9500'
    );
    EXECUTE function_sql;
  ELSIF position('v_wager_value::numeric * 9500' IN function_sql) = 0 THEN
    RAISE EXCEPTION 'Unable to locate the Upgrader return expression.';
  END IF;
END;
$$;

-- Apply the same payout reduction to both natural and action-resolved
-- Blackjack wins. Pushes still return the wager in full.
DO $$
DECLARE
  function_sql text;
BEGIN
  SELECT pg_get_functiondef(
    'public.create_blackjack_game_secure(text,uuid,bigint,jsonb,jsonb,jsonb,text,uuid,text,text,text,bigint)'::regprocedure
  ) INTO function_sql;

  IF position('floor(p_wager_value * 2.5)' IN function_sql) > 0 THEN
    function_sql := replace(
      function_sql,
      'floor(p_wager_value * 2.5)',
      'floor(p_wager_value * 2.375)'
    );
    EXECUTE function_sql;
  ELSIF position('floor(p_wager_value * 2.375)' IN function_sql) = 0 THEN
    RAISE EXCEPTION 'Unable to locate the Blackjack natural payout expression.';
  END IF;
END;
$$;

DO $$
DECLARE
  function_sql text;
BEGIN
  SELECT pg_get_functiondef(
    'public.advance_blackjack_game_secure(text,uuid,uuid,integer,text,jsonb,jsonb,jsonb,text)'::regprocedure
  ) INTO function_sql;

  IF position('selected_game.wager_value * 2' IN function_sql) > 0 THEN
    function_sql := replace(
      function_sql,
      'selected_game.wager_value * 2',
      'floor(selected_game.wager_value * 1.9)::bigint'
    );
    EXECUTE function_sql;
  ELSIF position('floor(selected_game.wager_value * 1.9)::bigint' IN function_sql) = 0 THEN
    RAISE EXCEPTION 'Unable to locate the Blackjack win payout expression.';
  END IF;
END;
$$;

-- Case prices are derived from their item expected value. Community creator
-- commission is additive: 5% remains with the house and the configured
-- creator commission is funded separately by the case price.
WITH case_expected_values AS (
  SELECT
    selected_case.uuid,
    sum(
      (case_item.item ->> 'value')::numeric
      * (case_item.item ->> 'chance')::numeric
      / 100
    ) AS expected_value
  FROM public.cases AS selected_case
  CROSS JOIN LATERAL jsonb_array_elements(selected_case.items) AS case_item(item)
  WHERE jsonb_typeof(selected_case.items) = 'array'
    AND jsonb_typeof(case_item.item) = 'object'
    AND (case_item.item ->> 'value') ~ '^[0-9]+$'
    AND (case_item.item ->> 'chance') ~ '^[0-9]+([.][0-9]+)?$'
  GROUP BY selected_case.uuid
)
UPDATE public.cases AS selected_case
SET price = ceil(
      expected.expected_value * 10000
      / (9500 - COALESCE(selected_case.commission_bps, 0))
    )::bigint,
    updated_at = now()
FROM case_expected_values AS expected
WHERE selected_case.uuid = expected.uuid
  AND expected.expected_value > 0;
