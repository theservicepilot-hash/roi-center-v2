# ROI Center

Standalone **GoHighLevel Marketplace** app: location-scoped Meta + Google ads spend and CRM opportunity ROAS.

**Stack:** Next.js (App Router) on Vercel · Supabase (Postgres + RLS) · **built-in DB job queue** + Vercel Cron (no Inngest / Redis / Celery)

Frozen reference (do not modify): `service-pilot-suite` ROI module.

---

## One-command local setup

```bash
cp .env.example .env.local
# Fill Supabase + GHL + SESSION_SECRET + TOKEN_ENCRYPTION_KEY
npm install
npm run dev
```

Apply both SQL migrations in Supabase SQL editor:

1. `supabase/migrations/001_initial.sql`
2. `supabase/migrations/002_background_jobs.sql`

Open [http://localhost:3000](http://localhost:3000).

---

## Environment

See [`.env.example`](.env.example).

| Var | Where | Notes |
|-----|--------|--------|
| `NEXT_PUBLIC_SUPABASE_*` | Client + server | Anon key only in browser |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server only** | All GHL writes / sync |
| `SESSION_SECRET` | Server | JWT signing |
| `TOKEN_ENCRYPTION_KEY` | Server | AES-GCM for GHL tokens at rest |
| `GHL_*` | Server | Marketplace OAuth + API |
| `CRON_SECRET` | Server | Protects `/api/cron/*` on Vercel (`openssl rand -hex 32`) |

Never put `SUPABASE_SERVICE_ROLE_KEY` or `GHL_CLIENT_SECRET` in client bundles.

---

## Background jobs (no external worker)

Jobs live in Supabase table `background_jobs`.

| Trigger | What happens |
|---------|----------------|
| INSTALL / OAuth | Enqueue Meta + Google 365d onboard → process via `after()` + cron |
| UI Sync (default) | Runs **inline** in the request (no queue needed) |
| UI Sync `async: true` | Enqueued → drained by cron / `after()` |
| Vercel Cron `*/5` | `/api/cron/process-jobs` drains queue |
| Vercel Cron `*/10h` | Token refresh + recent ads refresh |

Local drain (optional):
```bash
curl http://localhost:3000/api/cron/process-jobs
```

---

## Architecture

```
Browser → Next.js /roi → /api/roi/* → Supabase + GHL
INSTALL → background_jobs → after()/cron → Meta/Google backfill
```

### Folder map

```
src/app/roi/                 Dashboard UI
src/app/api/auth/crm/        OAuth + auto-login + oauth-session
src/app/api/webhooks/ghl/    INSTALL / UNINSTALL / Opportunity*
src/app/api/roi/{meta,google,crm}/
src/app/api/cron/            Vercel Cron (tokens, ads, job drain)
src/lib/ghl/                 GHL HTTP clients + OAuth + token refresh
src/lib/roi/                 Meta / Google / CRM sync
src/lib/jobs/                DB queue + runner
src/lib/tenancy/             Agency/Location provisioning
supabase/migrations/         Schema + RLS + jobs
```

---

## GHL Marketplace wiring

1. **Redirect URL:** `https://YOUR_DOMAIN/api/auth/crm/callback`  
   (must not contain `ghl` — Marketplace rejects it)
2. **Webhook URL:** `https://YOUR_DOMAIN/api/webhooks/ghl`  
   Enable INSTALL, UNINSTALL, Opportunity*
3. Scopes: `adPublishing.readonly` (+ write if needed), `opportunities.readonly`, `pipelines.readonly`, `locations.readonly`, `users.readonly`
4. Custom menu:

```
https://YOUR_DOMAIN/roi?embed=1&email={{user.email}}&location_id={{location.id}}
```

---

## Vercel deploy

1. Import repo → Next.js
2. Set env vars from `.env.example` (include `CRON_SECRET`)
3. Deploy — `vercel.json` registers crons automatically
4. Point GHL redirect + webhook at production domain

---

## Permissions

| Permission | Can |
|------------|-----|
| `report.view` | Summaries, charts, campaigns, CRM read |
| `report.manage` | Sync ads, save CRM pipeline, sync opportunities |

---

## E2E smoke checklist

1. Install / OAuth → location + tokens in Supabase
2. Check `background_jobs` for `meta.onboard` / `google.onboard` → `success` (or hit `/api/cron/process-jobs`)
3. Open `/roi` → Sync both → spend KPIs
4. CRM pipeline → Save & sync → ROAS cards
5. Opportunity webhook updates cache

---

## Scripts

```bash
npm run dev
npm run build
npm run typecheck
```
