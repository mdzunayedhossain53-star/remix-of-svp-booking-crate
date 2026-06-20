-- Shared cache for the Booking page "Reveal Real Center" flow.
--
-- The frontend reads and writes this table through
-- src/lib/revealed-centers-cache.ts. Keys are exact SVP exam_session_id
-- values, not city/date tuples, so multiple centres on the same date do
-- not overwrite each other.

CREATE TABLE IF NOT EXISTS public.revealed_test_centers (
  exam_session_id text PRIMARY KEY,
  test_center_id text NOT NULL,
  test_center_name text NOT NULL,
  address text,
  city text,
  revealed_at timestamptz NOT NULL DEFAULT now(),
  revealed_by text
);

COMMENT ON TABLE public.revealed_test_centers IS
  'Cache of exact SVP exam_session_id to real test centre pairs revealed via draft reservations.';

CREATE INDEX IF NOT EXISTS revealed_test_centers_city_idx
  ON public.revealed_test_centers (city);

CREATE INDEX IF NOT EXISTS revealed_test_centers_revealed_at_idx
  ON public.revealed_test_centers (revealed_at DESC);

ALTER TABLE public.revealed_test_centers ENABLE ROW LEVEL SECURITY;
