-- FleetOps MZ — migration 1: multi-tenancy foundation + vehicles.
--
-- Model: every tenant table carries organization_id. Access is granted through
-- organization_members (user ↔ organization ↔ role). Row Level Security is enabled on every
-- table; the helpers in schema `private` (not exposed by the API) decide membership and role.
--
-- Role → permission intent (mirrors src/app/features/users/role-permissions.ts):
--   read anything in the org .......... any active member
--   fleet.manage (vehicles) ........... owner, admin, fleet_manager
--   users.manage / settings.manage .... owner, admin

-- ---------------------------------------------------------------------------------------------
-- Private helpers
-- ---------------------------------------------------------------------------------------------
create schema if not exists private;
grant usage on schema private to authenticated;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Organizations
-- ---------------------------------------------------------------------------------------------
create table public.organizations (
  id                    uuid primary key default gen_random_uuid(),
  display_name          text not null check (length(trim(display_name)) > 0),
  legal_name            text not null default '',
  tax_id                text not null default '',          -- NUIT
  email                 text not null default '',
  phone                 text not null default '',
  address               text not null default '',
  city                  text not null default '',
  country               char(2) not null default 'MZ',
  reporting_currency    char(3) not null default 'MZN' check (reporting_currency in ('MZN', 'USD', 'ZAR', 'ZWL')),
  default_language      text not null default 'pt-MZ',
  time_zone             text not null default 'Africa/Maputo',
  date_format           text not null default 'dd/MM/yyyy' check (date_format in ('dd/MM/yyyy', 'yyyy-MM-dd', 'MM/dd/yyyy')),
  distance_unit         text not null default 'km' check (distance_unit in ('km', 'mi')),
  volume_unit           text not null default 'l' check (volume_unit in ('l', 'gal')),
  notification_settings jsonb not null default '{
    "maintenanceDueDays": 14,
    "documentExpiryDays": 30,
    "tripDelayAlerts": true,
    "fuelAnomalyAlerts": true,
    "expenseApprovalAlerts": true,
    "emailDigest": false
  }'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------------------------
-- Organization members (= AppUser in the frontend)
-- ---------------------------------------------------------------------------------------------
create table public.organization_members (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  user_id          uuid references auth.users (id) on delete set null,   -- null while invited
  full_name        text not null default '',
  email            text not null,
  phone            text not null default '',
  job_title        text not null default '',
  role             text not null check (role in ('owner', 'admin', 'fleet_manager', 'dispatcher', 'finance', 'viewer')),
  status           text not null default 'invited' check (status in ('active', 'inactive', 'invited')),
  invited_at       timestamptz,
  last_active_at   timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organization_id, user_id),
  unique (organization_id, email)
);

create index organization_members_user_id_idx on public.organization_members (user_id);
-- A single owner per organization.
create unique index organization_members_one_owner_idx
  on public.organization_members (organization_id) where role = 'owner';

create trigger organization_members_set_updated_at
  before update on public.organization_members
  for each row execute function private.set_updated_at();

-- Membership checks. SECURITY DEFINER so they can read organization_members without
-- recursing into its own RLS policies; `search_path = ''` prevents search-path hijacking.
create or replace function private.has_role(org uuid, roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = org
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role = any (roles)
  );
$$;

create or replace function private.is_member(org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_role(org, array['owner', 'admin', 'fleet_manager', 'dispatcher', 'finance', 'viewer']);
$$;

revoke all on function private.has_role(uuid, text[]) from public;
revoke all on function private.is_member(uuid) from public;
grant execute on function private.has_role(uuid, text[]) to authenticated;
grant execute on function private.is_member(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Onboarding: the signed-in user creates an organization and becomes its owner (one transaction).
-- ---------------------------------------------------------------------------------------------
create or replace function public.create_organization(p_display_name text, p_full_name text default '')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user  uuid := (select auth.uid());
  v_email text;
  v_org   uuid;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select email into v_email from auth.users where id = v_user;

  insert into public.organizations (display_name, legal_name)
  values (p_display_name, p_display_name)
  returning id into v_org;

  insert into public.organization_members (organization_id, user_id, full_name, email, role, status, last_active_at)
  values (v_org, v_user, coalesce(p_full_name, ''), coalesce(v_email, ''), 'owner', 'active', now());

  return v_org;
end;
$$;

revoke all on function public.create_organization(text, text) from public, anon;
grant execute on function public.create_organization(text, text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Vehicles
-- ---------------------------------------------------------------------------------------------
create table public.vehicles (
  id                            uuid primary key default gen_random_uuid(),
  organization_id               uuid not null references public.organizations (id) on delete cascade,
  plate_number                  text not null check (length(trim(plate_number)) > 0),
  fleet_number                  text not null default '',
  make                          text not null default '',
  model                         text not null default '',
  year                          smallint check (year between 1950 and 2100),
  type                          text not null check (type in ('truck_tractor', 'rigid_truck', 'tanker', 'tipper', 'light_vehicle')),
  status                        text not null default 'available' check (status in ('available', 'in_transit', 'maintenance', 'inactive')),
  fuel_type                     text not null default 'diesel' check (fuel_type in ('diesel', 'petrol')),
  vin                           text not null default '',
  odometer_km                   integer not null default 0 check (odometer_km >= 0),
  tank_capacity_l               numeric(8, 1) not null default 0 check (tank_capacity_l >= 0),
  expected_consumption_l100km   numeric(5, 1) not null default 0 check (expected_consumption_l100km >= 0),
  payload_tonnes                numeric(6, 1) not null default 0 check (payload_tonnes >= 0),
  -- Foreign keys to drivers / trailers are added by the migration that creates those tables.
  assigned_driver_id            uuid,
  linked_trailer_id             uuid,
  acquisition_date              date,
  notes                         text not null default '',
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now(),
  unique (organization_id, plate_number)
);

create index vehicles_organization_id_idx on public.vehicles (organization_id);
create unique index vehicles_fleet_number_idx
  on public.vehicles (organization_id, fleet_number) where fleet_number <> '';

create trigger vehicles_set_updated_at
  before update on public.vehicles
  for each row execute function private.set_updated_at();

-- Status history (VehicleStatusChange[] in the frontend), embedded with
-- `select('*, vehicle_status_changes(*)')`.
create table public.vehicle_status_changes (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  vehicle_id       uuid not null references public.vehicles (id) on delete cascade,
  changed_on       date not null default current_date,
  from_status      text not null,
  to_status        text not null,
  reason           text not null default '',
  changed_by       uuid default auth.uid() references auth.users (id) on delete set null,
  created_at       timestamptz not null default now()
);

create index vehicle_status_changes_vehicle_idx on public.vehicle_status_changes (vehicle_id, created_at);

-- VehicleRepository.changeStatus(): status + history row in one transaction.
-- SECURITY INVOKER: the caller's RLS policies still apply to both writes.
create or replace function public.change_vehicle_status(p_vehicle_id uuid, p_status text, p_reason text default '')
returns public.vehicles
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_before public.vehicles;
  v_after  public.vehicles;
begin
  select * into v_before from public.vehicles where id = p_vehicle_id for update;
  if not found then
    raise exception 'vehicle % not found', p_vehicle_id using errcode = 'P0002';
  end if;
  if v_before.status = p_status then
    return v_before;
  end if;

  update public.vehicles set status = p_status where id = p_vehicle_id returning * into v_after;

  insert into public.vehicle_status_changes (organization_id, vehicle_id, from_status, to_status, reason)
  values (v_before.organization_id, p_vehicle_id, v_before.status, p_status, coalesce(p_reason, ''));

  return v_after;
end;
$$;

revoke all on function public.change_vehicle_status(uuid, text, text) from public, anon;
grant execute on function public.change_vehicle_status(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------------------------
alter table public.organizations          enable row level security;
alter table public.organization_members   enable row level security;
alter table public.vehicles               enable row level security;
alter table public.vehicle_status_changes enable row level security;

-- The anonymous role never touches tenant data.
revoke all on public.organizations, public.organization_members, public.vehicles, public.vehicle_status_changes from anon;

-- organizations: members read; owner/admin update. Creation only via create_organization().
create policy organizations_select on public.organizations
  for select to authenticated
  using ((select private.is_member(id)));

create policy organizations_update on public.organizations
  for update to authenticated
  using ((select private.has_role(id, array['owner', 'admin'])))
  with check ((select private.has_role(id, array['owner', 'admin'])));

-- organization_members: members see their colleagues; owner/admin manage everyone but the owner.
create policy members_select on public.organization_members
  for select to authenticated
  using ((select private.is_member(organization_id)));

create policy members_insert on public.organization_members
  for insert to authenticated
  with check (role <> 'owner' and (select private.has_role(organization_id, array['owner', 'admin'])));

create policy members_update on public.organization_members
  for update to authenticated
  using (role <> 'owner' and (select private.has_role(organization_id, array['owner', 'admin'])))
  with check (role <> 'owner' and (select private.has_role(organization_id, array['owner', 'admin'])));

create policy members_delete on public.organization_members
  for delete to authenticated
  using (role <> 'owner' and (select private.has_role(organization_id, array['owner', 'admin'])));

-- vehicles: members read; fleet managers write.
create policy vehicles_select on public.vehicles
  for select to authenticated
  using ((select private.is_member(organization_id)));

create policy vehicles_insert on public.vehicles
  for insert to authenticated
  with check ((select private.has_role(organization_id, array['owner', 'admin', 'fleet_manager'])));

create policy vehicles_update on public.vehicles
  for update to authenticated
  using ((select private.has_role(organization_id, array['owner', 'admin', 'fleet_manager'])))
  with check ((select private.has_role(organization_id, array['owner', 'admin', 'fleet_manager'])));

create policy vehicles_delete on public.vehicles
  for delete to authenticated
  using ((select private.has_role(organization_id, array['owner', 'admin', 'fleet_manager'])));

-- vehicle_status_changes: append-only history.
create policy vehicle_status_changes_select on public.vehicle_status_changes
  for select to authenticated
  using ((select private.is_member(organization_id)));

create policy vehicle_status_changes_insert on public.vehicle_status_changes
  for insert to authenticated
  with check (
    (select private.has_role(organization_id, array['owner', 'admin', 'fleet_manager']))
    -- The vehicle must belong to the same organization as the history row.
    and exists (
      select 1 from public.vehicles v
      where v.id = vehicle_id and v.organization_id = vehicle_status_changes.organization_id
    )
  );
