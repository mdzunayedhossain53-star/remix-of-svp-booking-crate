# SVP Backend (Express + Prisma + Postgres)

## What it does
- Calls SVP login -> sends OTP
- Verifies OTP -> extracts SVP token from `access_payload.access`
- Creates your own access JWT + refresh cookie session
- Stores SVP access token encrypted in DB
- Exposes proxy endpoints under `/api/svp/*` (permissions, occupations, exams, booking, etc.)

Architecture:
- frontend never calls `https://svp-international-api.pacc.sa` directly
- frontend calls your backend
- backend calls `https://svp-international-api.pacc.sa` using `SVP_BASE_URL`

## Setup
1) Copy env:
   - `cp .env.example .env`
2) Install + migrate:
   - `npm i`
   - `npx prisma generate`
   - `npx prisma migrate deploy`
3) Run:
   - `npm run dev`

Backend runs at: http://localhost:4000

## Local With Live Railway Database
If you want local backend code to run against the same live Railway Postgres database:
- In `backend/.env`, use the public proxy URL:
  - `DATABASE_URL=postgresql://postgres:your-password@switchback.proxy.rlwy.net:39012/railway`
- Keep frontend local:
  - `frontend/.env.local` -> `NEXT_PUBLIC_BACKEND_URL=http://localhost:4000`
- Keep backend CORS local:
  - `CORS_ORIGINS=http://localhost:3000`

This gives you:
- local frontend on `http://localhost:3000`
- local backend on `http://localhost:4000`
- real shared Railway database data

## Run Live (Direct)
Use these env values in `backend/.env`:
- `NODE_ENV=production`
- `APP_NAME=SVP Backend API`
- `PORT=4000` locally only. On Railway, do not hardcode port handling beyond keeping the default; Railway injects `PORT`.
- `CORS_ORIGINS=https://svp-book.vercel.app,https://svp-book-abdur-razzak-s-projects.vercel.app`
- `COOKIE_SECURE=true`
- `COOKIE_SAMESITE=none`
- `DATABASE_URL=...`
- `SVP_BASE_URL=https://svp-international-api.pacc.sa`
- `SVP_LOCALE=en`
- `SVP_FE_APP=legislator`
- `JWT_ACCESS_SECRET=...`
- `JWT_REFRESH_SECRET=...`
- `SESSION_ENC_KEY_BASE64=...`

Start in production mode:
- `npm start`

Health check:
- `GET /health` -> returns `ok`, `app`, `env`, `publicDomain`, `service`

## Railway Live Backend
Use these Railway settings for the backend service:
- Root Directory: `backend`
- Builder: `RAILPACK`
- Start Command: `bash start.sh`
- Health Check Path: `/health`

Railway-provided runtime variables are automatic. You should not add them manually:
- `RAILWAY_PUBLIC_DOMAIN=aci-api-production.up.railway.app`
- `RAILWAY_PRIVATE_DOMAIN=aci-api.railway.internal`
- `RAILWAY_TCP_APPLICATION_PORT=4000`

Required backend variables you must set manually in Railway:
- `NODE_ENV=production`
- `APP_NAME=SVP Backend API`
- `CORS_ORIGINS=https://svp-book.vercel.app,https://svp-book-abdur-razzak-s-projects.vercel.app`
- `JWT_ACCESS_SECRET=<strong-random-secret>`
- `JWT_REFRESH_SECRET=<strong-random-secret>`
- `ACCESS_TOKEN_TTL_SECONDS=900`
- `REFRESH_TOKEN_TTL_DAYS=14`
- `COOKIE_SECURE=true`
- `COOKIE_SAMESITE=none`
- `DATABASE_URL=postgresql://postgres:your-password@postgres.railway.internal:5432/railway`
- `SVP_BASE_URL=https://svp-international-api.pacc.sa`
- `SVP_LOCALE=en`
- `SVP_FE_APP=legislator`
- `SESSION_ENC_KEY_BASE64=<32-byte-base64-key>`

Database URL rule:
- Local machine uses Railway public proxy URL.
- Railway backend service uses Railway internal database URL.

Expected live health URL:
- `https://aci-api-production.up.railway.app/health`

Expected production flow:
- `https://svp-book.vercel.app` -> frontend
- `https://aci-api-production.up.railway.app` -> backend
- `https://svp-international-api.pacc.sa` -> upstream API used by backend only

## API
- POST /api/auth/login
- POST /api/auth/otp-verify
- POST /api/auth/refresh
- POST /api/auth/logout
- GET  /api/me

Proxy examples:
- GET /api/svp/permissions
- GET /api/svp/occupations
- GET /api/svp/exam-constraints
- GET /api/svp/available-dates?per_page=1000&category_id=56&start_at_date_from=2025-12-15&available_seats=greater_than::0&status=scheduled
- GET /api/svp/exam-sessions?category_id=56&city=Mymensingh&exam_date=2025-12-24
- POST /api/svp/temporary-seats   (body passes through)
- POST /api/svp/exam-reservations (body passes through)
