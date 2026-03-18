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
4. Set the environment variables from `.env.example`.
5. Run `npm run db:apply-schema`.
6. Run `npm run db:seed`.
7. Deploy the app.
8. Sign in with the seeded admin email and start onboarding a real client.

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
