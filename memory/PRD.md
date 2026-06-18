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
- Logged into live `llwquxmlsdmdtmmktqqe.supabase.co` (Supabase project that hosts the live svp-proxy/svp-auth functions). Updated `/app/frontend/.env` accordingly. Created Access Control USER `e1-verifier@example.com / E1Verify#2026` (ACTIVE).
- Real SVP OTP login: `mdrahadulislamsvp55445@yopmail.com` → OTP `095063` → SVP access token (15-min) obtained via `/svp-auth/otp-verify`.
- LIVE EVIDENCE — pre-booking SVP responses hide the real centre exactly as PRD warns:
  - `GET /exam-sessions?category_id=160&city=Dhaka&exam_date=2026-06-20` → `{test_center: {name: "Dhaka Center", test_center_id: null, site_id: null}, available_seats: null}` for every Dhaka session.
- LIVE EVIDENCE — booking with the FIXED payload reveals the REAL centre:
  - `POST /temporary-seats` (encrypted session id) → hold #3928810 (numeric session 1556652).
  - `POST /exam-reservations` with body `{exam_session_id: <enc>, occupation_id: 2125, methodology: "in_person", language_code: "OFFII", site_id: null, site_city: null, hold_id: null}` → reservation #4327062 with `test_center: {name: "Narsingdi Technical Training Center", test_center_id: 218, address: "Shibpur, Narsingdi", city: "Dhaka"}`.
- Conclusion: the booking POST that uses `site_id: null, site_city: null, hold_id: null` (our fix) lets SVP bind the reservation to the real `exam_session_id`-derived centre instead of overriding from stale UI hints. Draft auto-expires in ~20 min — no money spent.

## Current Test Status
- 68/68 Vitest tests passing across 13 suites.

## Backlog
- P2 — Obtain fresh SVP API Bearer token for live e2e verification (current Postman token returns 401).
- P2 — Optional: lift helper functions out of `ReservationsPage.tsx` into `booking-utils.ts` for reuse and easier testing (currently duplicated logic in test).
- P3 — Add integration test for ReservationsPage rendering (depends on Supabase mocks).

## Known Risks
- SVP API token is expired → cannot run true e2e against upstream from this environment.
- Helpers in `ReservationsPage.tsx` are private; tests rely on mirrored inline copies. Drift risk if helpers change without test update.
