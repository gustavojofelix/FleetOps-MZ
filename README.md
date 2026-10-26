# FleetOps MZ

Fleet, road-freight and trip-profitability management for transport companies in Mozambique
(Port of Beira and the Beira Corridor). **This repository contains the UI/UX phase only**: a complete,
navigable Angular frontend running on deterministic, fictional demo data. There is no backend,
authentication or external API yet.

## Quick start

```bash
npm install
npm start            # http://localhost:4200
npm test             # Vitest unit tests (ng test --watch=false for a single run)
npm run build        # production build in dist/fleetops-mz
node tools/generate-mock-data.mjs   # regenerate the demo fixtures (deterministic)
```

Requirements: Node 20.19+, 22.12+ or 24 (developed with Node 24 / Angular 21.2).

## What's inside

| Area | Modules |
|---|---|
| Overview | Executive dashboard |
| Fleet operations | Vehicles, Drivers, Trailers, Trips (create / edit / detail / timeline), Dispatch board, Customers |
| Fleet costs | Fuel management (consistency checks), Expenses (demo approvals), Maintenance (work orders), Trip profitability, Financial reports (CSV export) |
| Administration | Documents (expiry tracking, simulated upload), Notifications, Users & permissions (demo roles), Company settings |

Cross-cutting: collapsible sidebar + mobile drawer, global search (Ctrl/⌘ K), light/dark/system themes,
Portuguese (Mozambique) and English with live switching, locale-aware formatting, multi-currency
(MZN, USD, ZAR, historical ZWL) with clearly labelled **simulated** conversions, responsive layouts from
360 px to wide desktops, keyboard-accessible components.

## Architecture

```
src/app/core       models · data-access contracts · mock repositories · domain rules · i18n · formatting · state
src/app/shared     UI components (charts, modal/drawer, badges, tables helpers…) and utilities
src/app/layout     application shell, sidebar, top bar, global search
src/app/features   one lazy-loaded folder per module
src/styles         design tokens (light/dark) and the global CSS vocabulary
tools/             deterministic fixture generator
docs/              conventions and backend integration notes
```

- Pages depend on **abstract repositories** (`core/data-access/repositories.ts`) bound to mock
  implementations in `provideMockDataAccess()`. A Supabase implementation can be provided instead
  without touching the UI — see [docs/BACKEND_INTEGRATION.md](docs/BACKEND_INTEGRATION.md).
- Financial and operational rules are pure functions in `core/domain` with unit tests
  (contribution margin, fuel consistency, assignment validation, expiry, maintenance status).
- Every user-facing string lives in `core/i18n/resources/<language>/<feature>.ts`; English is
  type-checked against the Portuguese source so missing keys fail compilation.

Development rules: [docs/FRONTEND_CONVENTIONS.md](docs/FRONTEND_CONVENTIONS.md).

## Demo data and what is mocked

- All companies, people, plates, phone numbers, documents and amounts are **fictional**.
- "Today" is pinned to **24 Oct 2026** (`ClockService`) so statuses such as *expiring* or *overdue*
  stay reproducible. Replace with the real clock when the backend arrives.
- Create / edit / delete operations persist to `localStorage` in this browser only. Use
  *Profile menu → Reset demo data* (or Settings → Demo data) to restore the original fixtures.
- Exchange rates are fixed demo values (`core/formatting/currency.ts`) and are always labelled as simulated.
- File uploads (receipts, documents, logo) are simulated: only the file name is kept locally.
- Users, roles and permissions are demonstration data; **no access control is enforced** in the browser.
- Notifications are fixtures; email digests and invitations are not sent.

## Contribution margin

`Contribution margin = trip revenue − recorded direct trip costs` (fuel and non-rejected expenses linked
to the trip), `margin % = margin / revenue × 100` (undefined when revenue is zero). Maintenance is shown
separately as an *estimated allocation*. Contribution margin is **not** net profit: salaries, taxes,
depreciation, financing and overheads are not included.
