CREATE TABLE IF NOT EXISTS public.cases (
  uuid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) > 0),
  price bigint NOT NULL CHECK (price >= 0),
  image_url text,
  items jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(items) = 'array'),
  active boolean NOT NULL DEFAULT true,
  community boolean NOT NULL DEFAULT false,
  owner_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT cases_owner_user_id_fkey
    FOREIGN KEY (owner_user_id)
    REFERENCES public.user_profiles(id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,

  CONSTRAINT community_case_requires_owner
    CHECK (
      (
        community = true
        AND owner_user_id IS NOT NULL
      )
      OR
      (
        community = false
        AND owner_user_id IS NULL
      )
    ),

  CONSTRAINT active_case_requires_items
    CHECK (
      active = false
      OR jsonb_array_length(items) > 0
    )
);

CREATE INDEX IF NOT EXISTS cases_active_idx
  ON public.cases (active);

CREATE INDEX IF NOT EXISTS cases_community_idx
  ON public.cases (community);

CREATE INDEX IF NOT EXISTS cases_owner_user_id_idx
  ON public.cases (owner_user_id);

CREATE INDEX IF NOT EXISTS cases_created_at_idx
  ON public.cases (created_at DESC);

CREATE INDEX IF NOT EXISTS cases_price_idx
  ON public.cases (price DESC);

CREATE INDEX IF NOT EXISTS cases_items_gin_idx
  ON public.cases USING gin (items);

CREATE OR REPLACE FUNCTION public.update_cases_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cases_update_updated_at
  ON public.cases;

CREATE TRIGGER cases_update_updated_at
BEFORE UPDATE ON public.cases
FOR EACH ROW
EXECUTE FUNCTION public.update_cases_updated_at();

ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view active cases"
  ON public.cases;

CREATE POLICY "Anyone can view active cases"
ON public.cases
FOR SELECT
TO anon, authenticated
USING (
  active = true
  OR owner_user_id = auth.uid()
);

DROP POLICY IF EXISTS "Users can create community cases"
  ON public.cases;

CREATE POLICY "Users can create community cases"
ON public.cases
FOR INSERT
TO authenticated
WITH CHECK (
  community = true
  AND owner_user_id = auth.uid()
);

DROP POLICY IF EXISTS "Owners can update community cases"
  ON public.cases;

CREATE POLICY "Owners can update community cases"
ON public.cases
FOR UPDATE
TO authenticated
USING (
  community = true
  AND owner_user_id = auth.uid()
)
WITH CHECK (
  community = true
  AND owner_user_id = auth.uid()
);

DROP POLICY IF EXISTS "Owners can delete community cases"
  ON public.cases;

CREATE POLICY "Owners can delete community cases"
ON public.cases
FOR DELETE
TO authenticated
USING (
  community = true
  AND owner_user_id = auth.uid()
);

GRANT SELECT ON public.cases TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.cases TO authenticated;
