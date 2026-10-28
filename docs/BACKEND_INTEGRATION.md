# Backend integration plan (Supabase)

The frontend was structured so the mock layer can be replaced without rewriting pages.
This note lists what is mocked today and what the backend must provide.

## Swap point

`src/app/app.config.ts` calls `provideMockDataAccess()` (`core/data-access/provide-data-access.ts`),
which binds each abstract repository to a `Mock*Service`. Create `provideSupabaseDataAccess()` binding
the same tokens to Supabase-backed classes that implement the same contracts:

| Contract | Notes for the Supabase implementation |
|---|---|
| `VehicleRepository`, `DriverRepository`, `TrailerRepository`, `CustomerRepository` | Tables per entity; `list()` maps `ListQuery` (search, filters, sort, page/pageSize) to PostgREST filters + `range()` with `count: 'exact'`. |
| `TripRepository` | `trips` + `trip_events` (timeline as its own table). `changeStatus()` → RPC. |
| `FuelRepository`, `ExpenseRepository`, `MaintenanceRepository`, `DocumentRepository` | Money stored as `amount numeric(14,2)` + `currency char(3)`; never convert on write. |
| `NotificationRepository` | Per-user read state (`notification_reads`), realtime channel for new items. |
| `UserRepository` | `organization_members` joined with `auth.users`; `currentUserId()` from the session. |
| `OrganizationRepository` | `organizations` row of the active tenant. |
| `RouteRepository` | Reference table per organization. |

`changes` signals can be driven by Supabase Realtime subscriptions (bump on insert/update/delete).

## Multi-tenancy and security

- Every tenant table carries `organization_id` (already present on all models: `TenantScoped`).
- Membership + role in `organization_members (organization_id, user_id, role)`; roles match `UserRole`.
- **Row Level Security** on every table: `organization_id in (select organization_id from organization_members where user_id = auth.uid())`,
  plus role-based policies for writes (e.g. only `finance`/`admin`/`owner` approve expenses).
- The demo role → permission matrix in the Users module documents intent only; enforcement must live in RLS/RPCs.
- Privileged multi-record operations become `security definer` RPCs executed transactionally:
  `TripWorkflowService` (status + vehicle/driver/trailer status), `VehiclesFacade` (symmetric assignments),
  maintenance start/complete (vehicle status), expense approval.
- Audit trail: `audit_log (organization_id, actor, entity, entity_id, action, diff, created_at)` via triggers.
- Server-side validation mirrors `core/domain/trip-rules.ts` (assignment conflicts, licence expiry, ISO 6346 container numbers).

## Storage

Receipts, documents and logos → Supabase Storage buckets per organization (`{org_id}/documents/...`),
private, signed URLs; the models already reserve `receiptFileName` / `fileName` / `fileSizeKb` for the object key.

## Currency

Replace `SIMULATED_RATES_TO_MZN` with a dated `exchange_rates` table (source, effective date). Store the
rate used on aggregation/report snapshots if historical reproducibility is needed. The UI already
distinguishes original amount, reporting amount and rate.

## Other mocked behaviour to replace

- `ClockService` demo date → real time (keep the service as the single source of "now").
- Authentication (top-bar profile menu "Sign out" is a demo toast) → Supabase Auth, route guards.
- Notifications generation (expiring documents, overdue maintenance, delays, fuel anomalies) → scheduled
  database jobs (pg_cron / Edge Functions) writing to `notifications`.
- Invitations and email digests → Supabase Auth invites + transactional email.
- Dashboard fleet map (`features/dashboard/fleet-map`) simulates positions from active trips with
  `core/domain/fleet-tracking.ts` → feed real GPS/telematics positions (e.g. a `vehicle_positions` table with
  Supabase Realtime) and keep the corridor geometry only for drawing planned routes.
- Demo data reset → remove (keep only for a sandbox tenant).
