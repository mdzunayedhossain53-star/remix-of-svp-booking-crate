-- Restore access needed by the frontend shared reveal cache.
--
-- 20260620084613 revoked INSERT/UPDATE on this table. That breaks
-- revealed-centers-cache.ts because Supabase upsert needs both insert
-- and update privileges when an exam_session_id already exists.

CREATE TABLE IF NOT EXISTS public.revealed_test_centers (
  exam_session_id text PRIMARY KEY,
  test_center_id text NOT NULL,
  test_center_name text NOT NULL,
  address text,
  city text,
  revealed_at timestamptz NOT NULL DEFAULT now(),
  revealed_by text
);

ALTER TABLE public.revealed_test_centers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "revealed cache read" ON public.revealed_test_centers;
DROP POLICY IF EXISTS "revealed cache insert" ON public.revealed_test_centers;
DROP POLICY IF EXISTS "revealed cache update" ON public.revealed_test_centers;
DROP POLICY IF EXISTS "anyone authenticated may read" ON public.revealed_test_centers;
DROP POLICY IF EXISTS "anyone authenticated may write" ON public.revealed_test_centers;
DROP POLICY IF EXISTS "anyone authenticated may update" ON public.revealed_test_centers;

CREATE POLICY "revealed cache read"
  ON public.revealed_test_centers
  FOR SELECT
  USING (true);

CREATE POLICY "revealed cache insert"
  ON public.revealed_test_centers
  FOR INSERT
  WITH CHECK (
    length(trim(exam_session_id)) > 0
    AND length(trim(test_center_id)) > 0
    AND length(trim(test_center_name)) > 0
  );

CREATE POLICY "revealed cache update"
  ON public.revealed_test_centers
  FOR UPDATE
  USING (true)
  WITH CHECK (
    length(trim(exam_session_id)) > 0
    AND length(trim(test_center_id)) > 0
    AND length(trim(test_center_name)) > 0
  );

GRANT SELECT, INSERT, UPDATE ON public.revealed_test_centers TO anon, authenticated;
REVOKE DELETE ON public.revealed_test_centers FROM anon, authenticated;
