
DROP POLICY IF EXISTS "cache insert validated" ON public.revealed_test_centers;
DROP POLICY IF EXISTS "cache update validated" ON public.revealed_test_centers;

DROP POLICY IF EXISTS "Anyone can read exam session centers" ON public.exam_session_centers;
DROP POLICY IF EXISTS "Anyone can read section rules" ON public.section_center_rules;
DROP POLICY IF EXISTS "Anyone can read session center cache" ON public.session_center_cache;
DROP POLICY IF EXISTS "Anyone can read test centers" ON public.test_centers;

REVOKE SELECT, INSERT, UPDATE, DELETE ON public.exam_session_centers FROM anon, authenticated;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.section_center_rules FROM anon, authenticated;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.session_center_cache FROM anon, authenticated;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.test_centers FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.revealed_test_centers FROM anon, authenticated;
