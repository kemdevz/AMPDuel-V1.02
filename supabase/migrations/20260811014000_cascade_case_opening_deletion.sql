-- Community cases must remain deletable after they have been opened. Removing a
-- case also removes every opening associated with it in the same transaction.
ALTER TABLE public.case_openings
  DROP CONSTRAINT IF EXISTS case_openings_case_id_fkey;

ALTER TABLE public.case_openings
  ADD CONSTRAINT case_openings_case_id_fkey
  FOREIGN KEY (case_id)
  REFERENCES public.cases(uuid)
  ON UPDATE CASCADE
  ON DELETE CASCADE;
