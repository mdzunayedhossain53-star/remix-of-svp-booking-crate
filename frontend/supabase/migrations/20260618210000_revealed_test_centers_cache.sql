-- 2026-06-18 — `revealed_test_centers` shared cache for the "🔍 Reveal Real
-- Center" feature in BookingPage.tsx.
--
-- SVP hides the real test_center identity from pre-booking responses.
-- The only way to read it pre-payment is to POST /exam-reservations
-- (creates an unpaid draft that auto-expires in ~20 min). Once we've
-- paid that cost ONCE for a given exam_session_id, we cache the
-- (exam_session_id → centre) pair so future visits — by ANY user — see
-- the real centre instantly without creating another draft.
--
-- This SQL must be run against the production Supabase project
--    https://qdlqrsvkenalwhmfdbaf.supabase.co
-- via the Dashboard SQL editor or `supabase db push` once.

create table if not exists public.revealed_test_centers (
  exam_session_id     text primary key,
  test_center_id      text not null,
  test_center_name    text not null,
  address             text,
  city                text,
  revealed_at         timestamptz not null default now(),
  -- Optional: who triggered the reveal (helps later debugging /
  -- attribution); FK left loose because SVP user ids aren't ours.
  revealed_by         text
);

comment on table public.revealed_test_centers is
  'Cache of (SVP exam_session_id -> real test centre) pairs revealed via draft reservations. Read by BookingPage.tsx (lib/revealed-centers-cache.ts).';

create index if not exists revealed_test_centers_city_idx
  on public.revealed_test_centers (city);

create index if not exists revealed_test_centers_revealed_at_idx
  on public.revealed_test_centers (revealed_at desc);

-- RLS — frontend uses the anon key. Allow ANY authenticated request to
-- both read the cache (community-wide visibility) and insert/update
-- (so reveals populate the cache for everyone). The cache only ever
-- holds public-by-design centre names + ids that SVP itself returns to
-- every authenticated booker, so there is no PII risk.
alter table public.revealed_test_centers enable row level security;

drop policy if exists "anyone authenticated may read" on public.revealed_test_centers;
create policy "anyone authenticated may read"
  on public.revealed_test_centers
  for select
  using (true);

drop policy if exists "anyone authenticated may write" on public.revealed_test_centers;
create policy "anyone authenticated may write"
  on public.revealed_test_centers
  for insert
  with check (true);

drop policy if exists "anyone authenticated may update" on public.revealed_test_centers;
create policy "anyone authenticated may update"
  on public.revealed_test_centers
  for update
  using (true)
  with check (true);
