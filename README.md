# MIND Reporting

Trust-first internal reporting app for agency-operated client scorecards.

## What is implemented

- Google Workspace-ready authentication flow plus demo mode fallback
- Server-rendered internal web app for mission control, onboarding, uploads, scorecards, ad reports, and exceptions
- Postgres-backed service layer for clients, memberships, facts, annotations, locks, upload batches, and exceptions
- Metric dictionary and source-precedence engine
- Currency normalization with per-client reporting currency and FX rates
- Monthly scorecard generation with weekly buckets, pacing, annotations, locks, and drift detection
- Exception queue and agency mission-control summary
- Ad-level performance report definitions with multiple report types
- CSV import pipeline for Meta delivery, GHL funnel data, Close revenue, and FX rates
- Railway-oriented schema and bootstrap scripts in [`db/schema.sql`](./db/schema.sql)

## Modes

- `demo mode`: no `DATABASE_URL`; uses the existing in-memory sample dataset and offers a demo login button
- `database mode`: set `DATABASE_URL` plus Google/session env vars; uses Postgres and the real app workflows

## Local quick start

```bash
npm install
npm test
npm run dev
```

Open `http://127.0.0.1:3000`.

## Database setup

Copy `.env.example` to `.env` and set at least:

```bash
DATABASE_URL=...
SESSION_SECRET=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_CALLBACK_URL=http://127.0.0.1:3000/auth/google/callback
GOOGLE_ALLOWED_DOMAIN=bada.digital
```

Then run:

```bash
npm run db:apply-schema
npm run db:seed
```

## Railway MVP setup

1. Create a Railway project.
2. Add a Postgres service.
3. Add this repo as a Node service.
4. Generate a public domain for the app service.
5. Set these variables on the app service:
   - `DATABASE_URL=${{Postgres.DATABASE_URL}}`
   - `SESSION_SECRET=<long random string>`
   - `GOOGLE_CLIENT_ID=<google oauth client id>`
   - `GOOGLE_CLIENT_SECRET=<google oauth client secret>`
   - `GOOGLE_ALLOWED_DOMAIN=<your workspace domain>`
   - Optional: `PLATFORM_ADMIN_EMAILS=you@yourdomain.com,ops@yourdomain.com`
   - Optional: `APP_BASE_URL=https://<your-railway-domain>` if you want to override Railway's inferred public URL.
6. In Google Cloud OAuth settings, add `https://<your-railway-domain>/auth/google/callback` as an authorized redirect URI.
7. Deploy the app. Railway will run the schema setup automatically before the app starts.
8. Verify `https://<your-railway-domain>/api/health` returns `200` and shows a healthy database check.
9. Sign in with an allowed Google Workspace account. Any email listed in `PLATFORM_ADMIN_EMAILS` becomes a platform admin automatically. If none are configured, the first Google user becomes the initial platform admin.
10. Optional: run `npm run db:seed` later if you want the demo client/bootstrap data.

### Railway notes

- This repo now ships a [`railway.json`](./railway.json) that pins the build command, start command, and healthcheck path for Railway.
- Railway also runs the compiled schema script as a pre-deploy step, so you do not need a manual shell step just to initialize the database.
- The server now binds to `0.0.0.0`, which Railway expects for public networking.
- Production builds copy `public/` and `db/` into `dist/` so `npm start` can serve assets and use compiled scripts consistently.
- If Railway provides `RAILWAY_PUBLIC_DOMAIN`, the app will automatically use it to derive the default OAuth callback base URL and ignore stale `localhost` callback/base URLs left in env vars.

## Main app routes

- `/login`
- `/app/mission-control`
- `/app/clients/new`
- `/app/clients/:clientId/uploads`
- `/app/clients/:clientId/reports/:reportMonth`
- `/app/clients/:clientId/performance/meta_delivery?month=YYYY-MM`
- `/app/clients/:clientId/exceptions?month=YYYY-MM`

## JSON endpoints

- `GET /api/health`
- `GET /api/mission-control`
- `GET /api/clients`
- `GET /api/clients/:clientId/reports/:reportMonth`
- `GET /api/clients/:clientId/report-definitions`
- `GET /api/clients/:clientId/performance-reports/:reportKey?month=YYYY-MM`

## Notes

- The app keeps the original backend-first reporting engine and wraps it with storage, auth, CSV uploads, and HTML pages.
- Live API connectors are still phase 2. The first MVP uses CSV uploads as the real data path.
- Demo mode exists so the app can still be explored without a configured database.
