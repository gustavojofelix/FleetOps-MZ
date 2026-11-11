# FleetOps MZ

Fleet, road-freight and trip-profitability management for transport companies in Mozambique
(Port of Beira and the Beira Corridor). Angular frontend on a Supabase backend (Postgres with
Row Level Security, Auth and Storage), multi-tenant: each company only ever sees its own data.

## Quick start

```bash
npm install
npm start            # http://localhost:4200 — sign in or create an account
npm test             # Vitest unit tests (npm run test:ci for a single run)
npm run build        # production build in dist/fleetops-mz/browser
```

Requirements: Node 20.19+, 22.12+ or 24 (developed with Node 24 / Angular 21.2). The app talks to
the Supabase project configured in `src/app/core/supabase/supabase-client.ts` (URL + public anon key).

Database changes are versioned in `supabase/migrations` and applied with the Supabase CLI:

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push --remote      # CLI v3: without --remote it targets a local database
```

## What's inside

| Area | Modules |
|---|---|
| Overview | Executive dashboard, fleet map (positions are simulated until telematics are connected) |
| Fleet operations | Vehicles, Drivers, Trailers, Trips (create / edit / detail / timeline), Dispatch board, Customers |
| Fleet costs | Fuel (consistency checks), Expenses (approval by owner / admin / finance), Maintenance work orders, Trip profitability, Financial reports (CSV export) |
| Administration | Documents (expiry tracking, file storage), Notifications, Users & permissions (invitations, roles), Company settings |

Cross-cutting: sign-in and company onboarding (optionally with a complete demo scenario), role-based actions, global search (Ctrl/⌘ K),
light/dark/system themes, Portuguese (Mozambique) and English, locale-aware formatting,
multi-currency (MZN, USD, ZAR, historical ZWL) with indicative exchange rates, responsive layouts.

## Architecture

```
src/app/core       models · data-access contracts · Supabase repositories · domain rules · i18n · formatting · state
src/app/shared     UI components (charts, modal/drawer, badges, *appCan…) and utilities
src/app/layout     application shell, sidebar, top bar, global search
src/app/features   one lazy-loaded folder per module (+ auth: sign-in and onboarding)
src/styles         design tokens (light/dark) and the global CSS vocabulary
supabase/          CLI config and SQL migrations (schema, RLS, triggers, RPCs, storage policies)
tools/             demo-data generator (tools/demo-data, used by tests and the demo seed), demo-video recorder
docs/              backend notes and frontend conventions
```

- Pages depend on **abstract repositories** (`core/data-access/repositories.ts`); `provideBackend()`
  (`core/backend/backend.ts`) binds them to the Supabase implementations in `core/supabase`.
- **Security lives in the database**: every table has RLS by organization and role; multi-record rules
  (trip status ↔ vehicle/driver/trailer status, expense approval, invitations) are triggers or RPCs.
  The UI hides actions a role cannot perform (`PermissionService`, `*appCan`) as a convenience only.
- Financial and operational rules are pure functions in `core/domain` with unit tests.
- Every user-facing string lives in `core/i18n/resources/<language>/<feature>.ts`; English is
  type-checked against the Portuguese source so missing keys fail compilation.

Details: [docs/BACKEND_INTEGRATION.md](docs/BACKEND_INTEGRATION.md) · rules for UI work:
[docs/FRONTEND_CONVENTIONS.md](docs/FRONTEND_CONVENTIONS.md).

## Not available yet

- Invitation and digest e-mails are not sent: an invited person creates an account with the invited
  address and the invitation is accepted automatically on sign-in.
- Exchange rates are indicative values from the `exchange_rates` table (no live market feed).
- Outstanding customer balances need an invoicing module.
- Fleet-map positions are simulated from active trips (no GPS / telematics feed yet).

## Contribution margin

`Contribution margin = trip revenue − recorded direct trip costs` (fuel and non-rejected expenses linked
to the trip), `margin % = margin / revenue × 100` (undefined when revenue is zero). Maintenance is shown
separately as an *estimated allocation*. Contribution margin is **not** net profit: salaries, taxes,
depreciation, financing and overheads are not included.
