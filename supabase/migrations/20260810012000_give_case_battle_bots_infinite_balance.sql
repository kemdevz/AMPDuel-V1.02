-- Keep bots effectively unlimited without exceeding JavaScript's safe integer
-- range when PostgREST serializes their profiles for the application.
UPDATE public.bot_profiles
SET balance = 9000000000000000,
    updated_at = now();
