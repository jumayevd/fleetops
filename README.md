# FleetOps — Logistics Platform

One control tower for a trucking / logistics company: dispatch, live tracking, fleet, drivers, customers, documents, billing, Telegram alerts and reporting, with role-based access for every team.

## Live

- Production: **https://fleetops-ochre.vercel.app** (Vercel project `fleetops`, region `fra1`)
- Deploys: every push to `main` deploys to production automatically (GitHub ↔ Vercel). Other branches get preview deployments, but those need their own env vars before they work
- Demo-company logins and their shared password are in `DEMO-CREDENTIALS.local.txt`. That file is git-ignored and never deployed. Change passwords under **My account** after signing in.

| Role          | Email                   | What they see |
|---------------|-------------------------|---------------|
| Owner         | owner@demo.local        | Everything, including managing other owners |
| Admin         | admin@demo.local        | Everything except owner accounts |
| Dispatcher    | dispatch@demo.local     | Loads, dispatch board, tracking, fleet/driver lookup, customers |
| Fleet manager | fleet@demo.local        | Fleet, maintenance, drivers, tracking, reports |
| Accountant    | accounting@demo.local   | Finance, invoices, customers, reports |
| Driver        | driver@demo.local       | Mobile driver portal (their own loads only) |

## Local development

```bash
npm install
vercel link        # once: pick the "fleetops" project
npm run setup      # pulls env vars into .env.local and runs migrations
npm run dev        # http://localhost:3000
```

> ⚠️ **Local dev uses the production Neon database.** The Vercel integration shares one database across all environments.
> The seed wipes everything, so it refuses to run unless `CONFIRM_SEED=yes` is set. For safe experiments, create a
> **branch** in the Neon console and put its connection strings in `.env.local` as `DATABASE_URL` / `DATABASE_URL_UNPOOLED`.

| Command | What it does |
|---|---|
| `npm run db:migrate` | Apply pending migrations from `prisma/migrations` |
| `CONFIRM_SEED=yes npm run db:seed` | **Wipe** the database and reload demo data. Set `DEMO_PASSWORD` to choose the password (default `demo1234`) |
| `npx dotenv -e .env.local -- prisma migrate dev --name <change>` | Create a migration after editing the schema (do this against a Neon branch) |

`DEMO_MODE="true"` shows one-click demo logins on the login page. Use it only with demo data that has the `demo1234` password, and never in production.

## Modules

| Module | Highlights |
|---|---|
| **Dashboard** | KPIs (in transit, unassigned, fleet utilization, month-to-date revenue, receivables), live fleet map, exception alerts, upcoming pickups, activity feed |
| **Loads & Dispatch** | Table and kanban board, case-insensitive search, booking form with auto distance and a suggested rate, assignment with double-booking protection, status workflow, timeline (notes, check calls, issues), per-load margin |
| **Live Tracking** | Control-tower map with every truck, route lines, progress, ETA, late warnings, and filters for moving/idle/in service. Refreshes every 10 s |
| **Fleet & Maintenance** | Trucks and trailers, compliance expiries, service intervals, work orders (a truck in the shop is blocked from dispatch), fuel logs, per-truck P&L |
| **Drivers** | Availability, license/medical expiry, performance, optional app login |
| **Customers** | Contacts, terms, credit limit against open A/R, load and invoice history |
| **Documents** | BOL, POD, CMR, customs papers, photos and invoices on loads; registration, insurance and inspection papers on trucks; licenses and medical certificates on drivers; contracts on customers. Files are private (streamed only after a permission check). Phone photos are compressed before upload, and expiry dates feed the alert list |
| **Telegram alerts** | Each user links their own Telegram, and a company group chat is optional. Alerts cover driver issues, pickups and deliveries, new trips (sent to the driver), uploaded PODs, payments, trucks going into or out of the shop, and a daily 08:00 brief. The bot also answers `/status` |
| **Finance** | Ready-to-invoice queue, invoices (draft → sent → paid/void), printable invoice / PDF, A/R aging, DSO, margin by month |
| **Reports** | Revenue vs. cost, on-time trend, top customers, equipment mix, lane profitability, truck and driver performance |
| **Admin** | Users and roles, password reset, deactivation, permission matrix, Telegram setup, append-only audit log |
| **Driver portal** | Mobile-first: current trip, navigation links, start trip, POD photo from the camera, check-ins and issue reports, GPS sharing, fuel logging, earnings |

### Load lifecycle

```
PLANNED ──assign──▶ ASSIGNED ──pickup──▶ IN_TRANSIT ──POD──▶ DELIVERED ──bill──▶ INVOICED
   ▲                   │
   └────unassign───────┘          (PLANNED / ASSIGNED can be CANCELLED)
```

The rules live in `src/lib/workflow.ts`.

## Telegram setup

1. In Telegram, message **@BotFather**, send `/newbot`, and copy the token it gives you.
2. Add it to Vercel, then redeploy:
   ```bash
   vercel env add TELEGRAM_BOT_TOKEN production --sensitive
   vercel deploy --prod
   ```
3. Sign in as Owner or Admin, open **Admin → Telegram Alerts**, and click **Connect webhook**.
4. Each person opens **My account → Connect Telegram** and presses **Start** in the bot.
5. Optional: add the bot to a company group, click **Generate connect code** on the admin page, and send `/connect <code>` in the group.

| Event | Who gets it |
|---|---|
| 🚨 Driver reports an issue | Owner, admins, dispatchers, group |
| 🚚 ✅ ❌ Pickup / delivery / cancellation | Ops team and the load's dispatcher, group (+ accountants on delivery, driver on cancellation) |
| 📋 New trip assigned | The driver |
| 📎 POD / CMR / customs uploaded | Ops team (+ accountants for PODs) |
| 💰 Invoice paid | Owner, accountants |
| 🔧 Truck into / out of the shop | Fleet managers, ops team |
| ☀️ Daily brief (08:00 Tashkent) | Owner, admins, dispatchers, fleet managers, group |

## Architecture

- **Next.js 16 (App Router)**: Server Components, Server Actions for mutations, route handlers under `src/app/api`
- **Prisma + Neon Postgres**: schema in `prisma/schema.prisma`; migrations in `prisma/migrations` are applied on every Vercel build (`prisma migrate deploy`)
- **Vercel Blob (private)** for documents (`src/lib/storage.ts`). Without `BLOB_READ_WRITE_TOKEN` it falls back to a local `./storage` folder
- **Telegram Bot API**: client in `src/lib/telegram.ts`, routing rules in `src/lib/notify.ts`. Sends run in `after()`, so a slow or failing Telegram API never blocks a user's action. The webhook is verified with a secret derived from `AUTH_SECRET`
- **Vercel Cron** (`vercel.json`): `/api/cron/daily-digest` runs at 03:00 UTC, protected by `CRON_SECRET`
- **Auth**: bcrypt and a signed JWT in an httpOnly cookie (`src/lib/auth.ts`); a permission matrix in `src/lib/permissions.ts`
- **Maps**: Leaflet + OpenStreetMap (set `NEXT_PUBLIC_MAP_TILE_URL` for a commercial provider). **Charts**: Recharts

### Telemetry

Until GPS/ELD hardware is connected, trucks on in-transit loads are simulated along their route (`src/lib/telemetry.ts`). A real ping from the driver app, or from any device posting to `POST /api/telemetry/ping`, overrides the simulation for 5 minutes.

## Environment variables

| Name | Source |
|---|---|
| `DATABASE_URL`, `DATABASE_URL_UNPOOLED` | Neon integration (automatic) |
| `BLOB_READ_WRITE_TOKEN` | Blob store `fleetops-docs` (automatic) |
| `AUTH_SECRET` | Random 32-byte hex: signs sessions and derives the Telegram webhook secret |
| `CRON_SECRET` | Random; Vercel Cron sends it as a Bearer token |
| `DEMO_MODE` | `false` in production |
| `TELEGRAM_BOT_TOKEN` | From @BotFather. Optional: alerts are off without it |
| `APP_URL` | Optional base URL for links in alerts (defaults to the production domain) |
| `NEXT_PUBLIC_MAP_TILE_URL` | Optional commercial map tiles |

## Roadmap ideas

- Multi-stop loads and load consolidation
- Real routing and ETA (OSRM / GraphHopper / Google Routes)
- Driver settlements / payroll export, fuel card import
- Customer portal (tracking link, quotes, invoices)
- SMS/email alert channels and per-user alert preferences by event type
- Hours-of-service / rest-time tracking
- Multi-currency (UZS/USD/KZT) and 1C accounting export
