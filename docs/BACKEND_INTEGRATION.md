# Backend (Supabase)

The app runs on Supabase: Postgres with Row Level Security, Auth and Storage. Pages depend only on
the contracts in `src/app/core/data-access/repositories.ts`; `provideBackend()`
(`src/app/core/backend/backend.ts`) binds them to the classes in `src/app/core/supabase`.

## Migrations (`supabase/migrations`)

| Migration | Contents |
|---|---|
| `…090000_tenancy_and_vehicles` | `organizations`, `organization_members`, `private.is_member/has_role`, `create_organization()`, `vehicles` + `vehicle_status_changes`, `change_vehicle_status()` |
| `…120000_master_data` | `drivers`, `trailers`, `customers`, `routes`; tenant-safe composite foreign keys; `private.apply_tenant_policies()` |
| `…150000_trips` | `trips`, `trip_events`; transition check; trigger deriving vehicle / driver / trailer status from active trips; `create_trip()`, `change_trip_status()` |
| `…180000_costs` | `fuel_records`, `expenses` (approval guarded by role, stamped), `maintenance_records`, `exchange_rates` |
| `…210000_documents_files_notifications` | `documents`, bucket `files` + storage policies, `notifications`, `notification_reads`, `notifications_feed` view, `refresh_my_notifications()` |
| `20261112090000_invitations_and_logo` | `claim_invitations()`, company logo in storage |

Rules for new migrations:

- Never edit a migration that has been applied; add a new one (`create or replace` for functions).
- Every tenant table: `organization_id`, `unique (organization_id, id)`, composite foreign keys to other
  tenant tables, and `select private.apply_tenant_policies('<table>', array[<write roles>])`.
- `SECURITY DEFINER` functions live in schema `private` (not exposed by the API) or check membership
  themselves, and always `set search_path = ''`.
- Test RLS before pushing: the PGlite harness used so far runs each migration with a stubbed `auth`
  and `storage` schema and checks cross-tenant and per-role access.

## Roles and permissions

`core/domain/permissions.ts` maps roles to permissions for the UI. The database enforces the same:

| Data | Write roles |
|---|---|
| vehicles, drivers, trailers, maintenance | owner, admin, fleet_manager |
| trips, trip events, routes | owner, admin, fleet_manager, dispatcher |
| customers | everyone except viewer |
| fuel, expenses | owner, admin, fleet_manager, finance — approving / rejecting: owner, admin, finance |
| documents | owner, admin, fleet_manager |
| members, company settings, logo | owner, admin |

Every active member reads all data of their organization.

## Storage

Private bucket `files`: `{organization_id}/{documents|fuel|expenses|company}/{record_id}/{file}`.
Records keep the file name; `FileStorage` uploads, removes and opens files with signed URLs.

## Notifications

`refresh_my_notifications()` (called when a member opens the app) and, if the `pg_cron` extension
is enabled, a daily job generate one notification per fact (delays, expiring documents and licences,
maintenance due/overdue, pending expenses, impossible fuel readings), honouring the company settings.
Read state is per user (`notification_reads`).

## Still to do

- E-mail: invitations and digests (Supabase Auth invites or a transactional e-mail provider).
- Exchange rates: a market-rate source writing to `exchange_rates`.
- Telematics: real vehicle positions for the fleet map.
- Aggregates: the dashboard, reports and global search still load every collection of the organization
  into the browser (`EntityDirectory`, `FleetAnalytics`). Move them to SQL views / RPCs before
  organizations grow to years of data.
- Audit log of changes (`audit_log` via triggers).
