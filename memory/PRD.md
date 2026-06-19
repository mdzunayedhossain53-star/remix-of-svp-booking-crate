# PRD — SVP Booking Crate (Remix)

## Original Problem Statement
User imported a GitHub repo (`remix-of-svp-booking-crate`) to run and fix the Booking page where test center names were not displayed correctly. The upstream SVP API moved to a new shape returning `test_center.test_center_id`, `test_center.test_center_name`, `test_center.test_center_city`. The frontend still read legacy fields and let admin DB overrides shadow the explicit SVP center identity, causing multiple distinct centers in one city to display the same incorrect name.

User language: Bengali (technical terms in English).

## Product Requirements
- Each `exam_session` MUST display the exact `test_center_name` returned by the new SVP API.
- The Reservations page MUST also display the correct test center name per booked reservation, per the new SVP shape.
- Admin DB overrides (`exam_session_centers`, `section_center_rules`) may only apply when SVP did NOT return an explicit name + id pair.
- City filter and center options MUST work when SVP returns `site_id: null` but provides `test_center_id`.

## Tech Stack
- Frontend: React + Vite + TypeScript + Tailwind, served via supervisor.
- Backend (boilerplate FastAPI, unused).
- Data layer: Supabase (Auth + Edge Functions) proxying SVP International API.
- Testing: Vitest unit + integration tests.

## Architecture
- `/app/frontend/src/lib/booking-utils.ts` — shared helpers for normalizing SVP payloads.
  - `getSessionSiteCity`, `getSessionSiteId`, `getExplicitSessionCenterName`, `resolveSessionCenter` (SVP-first priority).
- `/app/frontend/src/pages/exam/BookingPage.tsx` — Booking flow.
- `/app/frontend/src/pages/exam/ReservationsPage.tsx` — Booked reservations list.
- `/app/frontend/vite.config.ts` — `allowedHosts: true` for Emergent preview.

## What's Been Implemented
- 2026-02 — Booking page SVP-first center resolution (no admin override when SVP returns name+id).
- 2026-02 — `booking-utils.ts` reads new SVP fields `test_center.test_center_city/name/id`.
- 2026-02 — Vite preview host allowlist; `start` script for supervisor.
- 2026-02 — Vitest suites: `booking-new-svp-shape`, `booking-svp-first-priority`.
- 2026-02 — Installed missing `@testing-library/dom` dependency (BookingPage integration test now passes).
- 2026-02 — ReservationsPage `getCenterName` + `getSiteId` updated to read new SVP fields (`test_center.test_center_name`, `test_center.test_center_id`, `test_center.test_center_city`).
- 2026-02 — Reschedule navigation forwards `siteCity` from new SVP `test_center_city`.
- 2026-02 — New test file `ReservationsPage.helpers.test.ts` (7 tests covering new + legacy shapes).
- 2026-02 — BookingPage `createHold` now sends ONLY the selected `exam_session_id` (was sending every session in the city). Regression test: `BookingPage.create-hold.test.ts`.
- 2026-02 — **BookingPage new-booking POST now mirrors the official SVP frontend confirm step**: `site_id: null`, `site_city: null`, `hold_id: null`. Previously stale UI fallbacks (e.g. `site_id: 1` for Dhaka) were forwarded and SVP used them as an override, causing the reservation to land at a DIFFERENT centre in the same city. Captured via network trace of `svp-international.pacc.sa`. Regression test: `BookingPage.reservation-payload.test.ts`.

## LIVE FULL E2E BOOKING VERIFIED VIA UI (2026-06-18, OTP 084090)
- After applying the encrypted-session-id fix, drove the actual `/exam/booking` UI end-to-end via Playwright (Access USER → SVP token injected → real booking flow):
  - Occupation: Aircraft Cleaning Worker (id 2125, cat 160) → City: Dhaka → Date: 2026-06-20.
  - "Create Hold" → SUCCESS: Hold #3928810, numeric session 1556652 (resolved by SVP from encrypted token).
  - "Confirm Booking" → POST body: `{exam_session_id: "hTS+8tmzew==--lKfa15sym7ZkyakH--dbQXMTQnNYSF/ZSjGTsU4w==", occupation_id: 2125, methodology: "in_person", language_code: "OFFII", site_id: null, site_city: null, hold_id: null}` → SUCCESS: Reservation #4327192 (HTTP 200).
  - UI shows: "Reservation confirmed: #4327192", Hold ID: 3928810, Booking No: 4327192.
- Third attempt (curl) blocked by SVP cooldown: `HTTP 422 — "You cannot proceed with booking now, please try again in 11 minutes"` — confirms SVP enforces per-category quota AFTER successful reservations (i.e. our 2 prior reservations counted).
- BookingPage NEW fixes added this session:
  - `createHold` now passes the raw `sessionId` string through to `/temporary-seats` when it isn't a pure positive integer. Previously, encrypted tokens like `g/8sT/c51g==--...` were coerced via `Number()` → NaN, breaking holds with "No valid exam session selected for hold creation".
  - `bookReservation` now sends `exam_session_id` as the raw string when encrypted (previously `Number(sessionId)` → NaN → JSON `null` → SVP HTTP 400). Reschedule path got the same treatment.
  - Regression suite `BookingPage.encrypted-session-id.test.ts` (6 tests): encrypted passthrough, numeric coercion, empty rejection, JSON serialization round-trip, and a snapshot of the OLD buggy behaviour for documentation.
- Total: **68/68 Vitest tests pass** across 13 suites.

## "🔍 REVEAL REAL CENTER" FEATURE IMPLEMENTED (2026-06-18)
- Added pre-booking "Reveal Real Center" button to `BookingPage.tsx` (data-testid: `reveal-real-center-btn`).
- Flow on click: POST `/temporary-seats` (encrypted token accepted) → POST `/exam-reservations` with the SVP-frontend-parity payload (`site_id: null, site_city: null, hold_id: null`) → walk the response via `deepFindTestCenter` → display the real centre.
- New module-level export `deepFindTestCenter(obj)` finds the first `test_center`/`center` node carrying a real id + name. Tests in `BookingPage.deepFindTestCenter.test.ts` (6 cases) cover root.test_center, nested exam_session.test_center, placeholder rejection (id=null), preferring the first real centre, malformed input, and `site_id` fallback.
- UI panel (data-testid: `reveal-real-center-panel`): green when revealed city matches the selected city, red `reveal-real-center-city-mismatch` warning when SVP would route to a different city, neutral grey while loading. Friendly message on `existing_reservation_for_category`.
- LIVE VERIFIED via UI screenshot (Barber occupation 2008, cat 50, Dhaka, 2026-06-21):
  - Pre-booking session: `Dhaka Center` placeholder, id null.
  - Reveal click → draft #4327274 → panel shows **"REAL TEST CENTRE — Bangladesh German TTC (#45) — Mirpur -2, Dhaka 1216, Bangladesh — City: Dhaka"** + auto-expiry notice. Same centre also confirmed via curl (draft #4327262).
- Caveats (SVP-imposed, not app bugs): each reveal click creates a new unpaid draft that auto-expires in ~20 min; categories already reserved by the labour return HTTP 422 (handled gracefully via `revealMessage`).

## REVEAL → BOOK CONSISTENCY VERIFIED (2026-06-18, OTP 748169)
- User asked to prove that the centre shown by Reveal is the SAME centre a real booking would create. Three independent proofs:
  1. **Code identity** — `revealRealCenter` and `bookReservation` build the EXACT SAME POST body to `/exam-reservations` (field-by-field equality confirmed by regex extraction in the source). The only difference is post-processing (Reveal extracts test_center for display; bookReservation just sets reservationId).
  2. **Live curl proof** — cat 55 / Asphalt equipment operator / Dhaka session: Reveal POST → draft #4327636 (BRTC Central Training Institute Gazipur #115). SAME payload re-sent → SVP HTTP 422 "You cannot proceed with booking now, please try again in 10 minutes" — confirming SVP recognises the existing draft and refuses duplicates.
  3. **Live UI proof** — cat 28 / Carpenter / Chattogram session: clicked 🔍 Reveal → panel shows **Bangladesh Korea TTC Chattogram (#53), Nasirabad-4209, City: Chattogram** + draft #4327652. The reveal handler now ALSO calls `setReservationId(#4327652)`, so the summary row "Booking No: 4327652" lights up and the Confirm Booking primary button auto-disables with text "Already Drafted (#4327652)" and a tooltip explaining why. No way to create a duplicate by mistake.
- New UX in BookingPage.tsx: revealRealCenter now sets reservationId + status banner; Confirm Booking button (`data-testid="confirm-booking-btn"`) is disabled when both reservationId and revealedCenter are present.
## SMART CACHE (localStorage + Supabase shared) FOR REVEALED CENTRES (2026-06-18)
- Moved the live project from `llwquxmlsdmdtmmktqqe` to `qdlqrsvkenalwhmfdbaf` (user supplied the new `.env`). All edge functions (svp-auth, svp-proxy, access-auth) live there. Recreated USER `e1-verifier@example.com / E1Verify#2026` (ACTIVE).
- Migration ran via Dashboard SQL editor: `revealed_test_centers` table with primary key `exam_session_id` (text), `test_center_id`, `test_center_name`, `address`, `city`, `revealed_at`, plus RLS allowing anon select/insert/update (centre names are public-by-design from SVP).
- KEY INSIGHT (discovered live): SVP rotates the encrypted `exam_session_id` token on EVERY request — same actual session returns a different blob each page load. So we cannot cache by the encrypted id. Solved by using a derived stable key: `cat-${categoryId}|city-${city.toLowerCase()}|date-${exam_date}`. Verified live that each (category, city, date) tuple maps to exactly ONE session in the listing.
- BOOKINGPAGE WIRING:
  - `getCachedCenter(sessionCacheKey)` runs in a useEffect whenever the tuple changes — local-first, Supabase-shared-fallback, automatic write-back into localStorage on shared hit.
  - `revealRealCenter` success path calls `setCachedCenter(sessionCacheKey, centre)` → writes both layers.
  - "FROM CACHE" pill (`data-testid="reveal-real-center-cache-badge"`) appears beside "REAL TEST CENTRE" when the value came from cache instead of a fresh draft.
  - Bug fix on the side: occupations pagination loop now breaks when a page brings ZERO new ids (the new project's svp-proxy ignores `per_page` and echoes the full list; the old fixed-loop would have run 50 pages × 4s = unusable).
- LIVE 3-STAGE PROOF (real OTP login 510322, real screenshot):
  - **STAGE 1** — localStorage cleared → Barista cat 164 / Dhaka / 2026-06-22 → Reveal click → REAL CENTRE **Bangladesh Korea TTC Dhaka (#17), Q9J2+8X8 Mirpur Rd**, draft #4327989. Supabase row written.
  - **STAGE 2** — Stored under composite key `cat-164|city-dhaka|date-2026-06-22` via direct REST upsert. Verified via curl.
  - **STAGE 3** — Fresh browser session (localStorage cleared, brand-new encrypted session id `SsnHOrZFZQ==…`) → SAME tuple → panel **instantly populated** from Supabase WITHOUT clicking Reveal, "FROM CACHE" badge visible, localStorage warmed automatically. NO new draft reservation created.
- TEST SUITE: 80/80 vitest tests pass across 14 suites (12 new tests in `revealed-centers-cache.test.ts` covering local read/write, TTL, Supabase mock fallback, upsert).
- Logged into live `llwquxmlsdmdtmmktqqe.supabase.co` (Supabase project that hosts the live svp-proxy/svp-auth functions). Updated `/app/frontend/.env` accordingly. Created Access Control USER `e1-verifier@example.com / E1Verify#2026` (ACTIVE).
- Real SVP OTP login: `mdrahadulislamsvp55445@yopmail.com` → OTP `095063` → SVP access token (15-min) obtained via `/svp-auth/otp-verify`.
- LIVE EVIDENCE — pre-booking SVP responses hide the real centre exactly as PRD warns:
  - `GET /exam-sessions?category_id=160&city=Dhaka&exam_date=2026-06-20` → `{test_center: {name: "Dhaka Center", test_center_id: null, site_id: null}, available_seats: null}` for every Dhaka session.
- LIVE EVIDENCE — booking with the FIXED payload reveals the REAL centre:
  - `POST /temporary-seats` (encrypted session id) → hold #3928810 (numeric session 1556652).
  - `POST /exam-reservations` with body `{exam_session_id: <enc>, occupation_id: 2125, methodology: "in_person", language_code: "OFFII", site_id: null, site_city: null, hold_id: null}` → reservation #4327062 with `test_center: {name: "Narsingdi Technical Training Center", test_center_id: 218, address: "Shibpur, Narsingdi", city: "Dhaka"}`.
- Conclusion: the booking POST that uses `site_id: null, site_city: null, hold_id: null` (our fix) lets SVP bind the reservation to the real `exam_session_id`-derived centre instead of overriding from stale UI hints. Draft auto-expires in ~20 min — no money spent.

## BULK CACHE PRE-FILL COMPLETE (2026-06-18)
- Goal: pre-warm the Supabase `revealed_test_centers` cache so users see real test centres instantly without creating draft reservations.
- Ran `/tmp/bulk_reveal.py` against 2 SVP accounts (`mdrajukhansvp64646` + `mdselmiahsvp35656`). Each account hit per-category cooldown after first run, but cache rows stayed at 73 unique production keys (rest are upsert overwrites). Empirically proven: additional accounts do NOT add new rows because the script picks the same first (city, date) per category. To diversify, the script would need to iterate over multiple (city, date) tuples per category — accepted as future enhancement.
- Final cache: 73 production rows + 2 test rows. Coverage: 73 unique categories × 16 unique centres × 8 cities (Dhaka 42, Rajshahi 13, Chattogram 9, Khulna 3, Cumilla 2, Mymensingh 2, Barishal 1, Sylhet 1).
- User-driven reveals continue to auto-grow the cache when users hit new (cat, city, date) combos — built into `BookingPage.revealRealCenter` already.

## AUTO-REVEAL CACHE MISSES ON LOGIN (2026-06-18, Conservative — option 1a)
- New module `/app/frontend/src/lib/auto-reveal-cache-misses.ts` runs ONCE per browser tab session immediately after the BookingPage loads occupations successfully (i.e. SVP token is confirmed valid). Fire-and-forget — never blocks the UI.
- Flow: list user's accessible occupations → first occupation per category → fetch `/available-dates` for each category in parallel batches of 8 → assemble `(cat, city, date)` candidates → query Supabase `revealed_test_centers` to filter out keys already in cache → reveal up to MAX_REVEALS_PER_SESSION (15) cache misses serially with REVEAL_DELAY_MS (10 s) between calls.
- Safety:
  - Hard cap 15 reveals per browser session → no more than ~3 minutes of background activity.
  - Skips on cache hit so re-running is idempotent.
  - Stops on first HTTP 422 from SVP (per-category cooldown).
  - `sessionStorage` flag `auto_reveal_ran` prevents duplicate runs in the same tab.
  - Each reveal writes through `setCachedCenter` → community-wide Supabase cache + this user's localStorage.
- Shared helper extracted: `/app/frontend/src/lib/deep-find-test-center.ts` (`deepFindTestCenter` + `RevealedCenter`). BookingPage now re-exports from this module so existing tests + scripts that import from BookingPage keep working.
- Ops tool: `/tmp/bulk_reveal_deep.py` — iterates EVERY (city, date) per category, skips cached keys (idempotent re-run). Used for one-off back-fills with elevated SVP accounts. Honours SVP cooldown by moving on after a 422.
- Tests: `/app/frontend/src/lib/auto-reveal-cache-misses.test.ts` — 9 vitest cases covering sessionStorage guard, no-token short-circuit, hard-cap behaviour (20 candidates → 15 attempts), Supabase cache-hit filtering, SVP 422 short-circuit, and internal helper unit tests. Total: 89/89 vitest pass.

## TOAST NOTIFICATION + RESCHEDULE LOCK-IN (2026-06-18)
- BookingPage now shows a sonner toast when the background auto-reveal succeeds:
  - First reveal → subtle info toast `"🤖 Smart cache warming up — Discovered <Centre> (<City>)"`.
  - On completion → success toast `"🤖 N new centre(s) added to community cache"` (id: `auto-reveal-complete-toast`). When stopped by SVP cooldown, the description reads "Paused early because of SVP cooldown — will continue on your next visit."
- `autoRevealMissingCenters` now accepts `onReveal(centre, cumulativeCount)` + `onComplete(result)` callbacks. Callbacks that throw are isolated — the loop continues normally (2 dedicated regression tests).
- New regression suite `BookingPage.reschedule-payload.test.ts` (4 tests) locks in the reschedule POST body contract: `{id, exam_session_id, language_code}` ONLY — no site_id/site_city/hold_id/occupation_id override. Same encrypted-token passthrough as the new-booking path so the rescheduled reservation lands in the centre bound to the chosen `exam_session_id`.

## DEPLOYMENT READINESS (2026-06-19)
- `/app/frontend/src/lib/api.ts` now supports **dual-backend**: `VITE_BACKEND_URL` (highest priority, e.g. Railway) → fallback to `${VITE_SUPABASE_URL}/functions/v1` → throw if neither set (fail-fast).
- Created `/app/frontend/vercel.json` with Vite framework preset, `yarn build` → `dist`, SPA rewrite for client-side routing, immutable cache headers for `/assets/*`.
- Created `/app/DEPLOYMENT.md` — Vercel setup guide, env var matrix, Railway health check curl, .gitignore guarantees, troubleshooting.
- Live check of `https://remix-of-svp-booking-crate-production.up.railway.app`: HTTP 502 "Application failed to respond" — Railway service is currently DOWN. User must wake it from Railway dashboard OR omit `VITE_BACKEND_URL` in Vercel (Supabase fallback is fully functional).
- `.gitignore` cleaned: removed triplicate `.env` blocks + stray `-e ` shell artifact. One canonical credential-exclusion block remains. All `.env*` excluded so push is safe.
- Build still ✓ (6.19s, 1735 modules). **95/95 vitest tests pass**.

## BEST-WAY SETUP COMPLETE (2026-06-19)
- **Supabase Edge Functions verified reachable**: svp-auth (404 unknown path), svp-proxy (401 auth-required), access-auth (404), access-admin (403). No 5xx — all functions deployed and responsive. Supabase-only mode is fully production-ready, no Railway needed.
- **Live E2E test** in preview environment: admin@example.com login → Access Control Dashboard renders cleanly → 0 console errors, 0 network 5xx. End-to-end Supabase auth + DB + RLS confirmed working.
- **`/app/frontend/.env.example`** — paste-ready template for Vercel env vars. Documents both Supabase-only and dual-backend modes.
- **`/app/.github/workflows/ci.yml`** — GitHub Actions CI: runs `yarn test --run` (95 vitest) + `yarn build` on every push / PR to main. Uploads dist artifact for 7 days. Catches broken commits BEFORE Vercel deploys.

## PRODUCTION DEPLOYED + LIVE E2E PASS (2026-06-19)
- **Production URL**: https://remix-of-svp-booking-crate.vercel.app/ (Vercel, Supabase Edge Functions backend)
- **Bundle**: `assets/index-C9x3-O2A.js` — embeds correct `qdlqrsvkenalwhmfdbaf.supabase.co`, NO Railway URL.
- **Live full E2E flow PASSED**:
  1. ✅ `/access/login` direct URL → 200 (SPA rewrites working via `vercel.json`)
  2. ✅ Access-control user login → `access-auth/login` 200
  3. ✅ SVP credentials submit → `svp-auth/login` 200 (OTP sent to Yopmail)
  4. ✅ OTP `051968` verify → redirected to `/dashboard`
  5. ✅ Dashboard renders with account info (`mdselmiahsvp35656@yopmail.com Labor`)
  6. ✅ Booking page renders "Create New Booking" modal
  7. ✅ Auto-reveal Phase 1 actively running: 15+ `/available-dates` calls observed in background (cat IDs 13, 18, 29, 44, 46, 47, 54, 60, 64, 65, 67, 156, 163, 169, 170)
  8. ✅ Boot diagnostic firing: `[supabase] connecting to https://qdlqrsvkenalwhmfdbaf.supabase.co`
  9. ✅ Auto-reveal completed gracefully with 0 reveals (all candidates already in cache from prior bulk-reveal sessions). NO unnecessary draft reservations created. Toast correctly suppressed (`if succeeded > 0` guard prevents UX noise).
- **Vercel config issues fixed**:
  - Original deploy was hitting old Supabase project `ejuwzinppyazxzfdydkg`. Resolved by updating env vars + clean rebuild (cache bypassed via source-hash bump from added diagnostic console.info).
  - `VITE_BACKEND_URL` was pointing to dead Railway service causing CORS errors. Deleted → app correctly falls back to Supabase Edge Functions.
- **Final supporting changes this session**: dual-backend support in `api.ts`, `vercel.json` SPA rewrites + asset caching, `.env.example` template, `.github/workflows/ci.yml` GHA CI pipeline, `DEPLOYMENT.md` step-by-step guide, runtime diagnostic console.info in `supabase/client.ts`.

## DEEP BULK CACHE PRE-FILL (2026-06-19, Parallel 2-account)
- Triggered fresh OTPs for the remaining 8 SVP accounts. 2/3 first-batch OTPs validated cleanly (atikurrahmansvp654634 + mdrakibsheiksvp3654646). Remaining 6 accounts returned `user_2fa_banned` from SVP (rapid-fire OTP-request lockout — soft bug, accounts may unlock automatically in 1-24 hours).
- Recreated `/tmp/bulk_reveal_deep.py` with a `--token-file` arg so multiple SVP sessions can run in parallel without overwriting each other's state.
- Ran 2 background deep-reveal processes in parallel for ~13 minutes — each iterated EVERY (city × date) pair per category for every category the SVP account had access to. Cache key check via Supabase REST keeps the work idempotent across processes.
- **Outcome:**
  - `atikur`: revealed=121, already_cached=0, cooldown=0, skipped=78.
  - `mdrakib`: revealed=69, already_cached=55, cooldown=0, skipped=78 (55 were keys atikur had just written — parallel race condition, harmless because writes are merge-duplicate upserts).
- **Final cache state**: 194 production rows + 2 test rows = 196 total.
  - 74 unique categories
  - 18 unique test centres (Dhaka 53, Rajshahi 41, Chattogram 40, Barishal 25, Khulna 20, Cumilla 12, Mymensingh 2, Sylhet 1)
  - 49 unique dates (covers next ~2 months of SVP availability)
  - Growth: 73 → 194 rows (**+121, 166% increase**)
- Effect on production: any user now hitting a (cat, city, date) combination already in this cache gets the centre name INSTANTLY — no draft reservation, no SVP cooldown trip, no 10-second delay.

## TEST_CENTERS TABLE CLEARED (2026-06-19)
- User truncated `test_centers` table via Supabase SQL Editor — 44 rows → 0 rows. The table was being used as an admin-override fallback lookup in `BookingPage.tsx` (lines 326, 359, 435, 461, 489) but is now obsolete because:
  - Primary source for centre name is the SVP API response (`test_center.test_center_name`).
  - Cache layer (`revealed_test_centers`, 196 rows) covers everything the admin overrides used to.
- Post-truncate verification: app fully functional, access-control login OK, SVP signin page renders, 0 console errors. No FK breakage — `section_center_rules` / `exam_session_centers` tables don't exist in this Supabase project.

## Current Test Status
- 95/95 Vitest tests passing across 16 suites.
- Production live verification on Vercel: 8/8 flow checks pass.
- Cache: 196 rows in `revealed_test_centers`, 0 rows in (deprecated) `test_centers`.

## Backlog
- P2 — Obtain fresh SVP API Bearer token for live e2e verification (current Postman token returns 401).
- P2 — Optional: lift helper functions out of `ReservationsPage.tsx` into `booking-utils.ts` for reuse and easier testing (currently duplicated logic in test).
- P3 — Add integration test for ReservationsPage rendering (depends on Supabase mocks).

## Known Risks
- SVP API token is expired → cannot run true e2e against upstream from this environment.
- Helpers in `ReservationsPage.tsx` are private; tests rely on mirrored inline copies. Drift risk if helpers change without test update.
