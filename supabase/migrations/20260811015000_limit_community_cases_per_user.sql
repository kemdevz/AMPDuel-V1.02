-- Enforce the community-case ownership limit inside the database so concurrent
-- creation requests cannot bypass the API's preflight count.
CREATE OR REPLACE FUNCTION public.enforce_community_case_owner_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  owned_case_count integer;
BEGIN
  IF NEW.community IS NOT TRUE OR NEW.owner_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('community-case-owner:' || NEW.owner_user_id::text, 0)
  );

  SELECT count(*)::integer
  INTO owned_case_count
  FROM public.cases
  WHERE community = true
    AND owner_user_id = NEW.owner_user_id
    AND (TG_OP = 'INSERT' OR uuid <> NEW.uuid);

  IF owned_case_count >= 5 THEN
    RAISE EXCEPTION 'You can create up to 5 community cases.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cases_enforce_owner_limit ON public.cases;
CREATE TRIGGER cases_enforce_owner_limit
BEFORE INSERT OR UPDATE OF community, owner_user_id
ON public.cases
FOR EACH ROW
EXECUTE FUNCTION public.enforce_community_case_owner_limit();

COMMENT ON FUNCTION public.enforce_community_case_owner_limit() IS
  'Limits each profile to five community cases, including active and inactive cases.';
