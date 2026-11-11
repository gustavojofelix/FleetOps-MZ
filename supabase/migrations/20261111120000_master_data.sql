-- FleetOps MZ — migration 2: master data (drivers, trailers, customers, routes) and
-- tenant-safe links between vehicles, drivers and trailers.

-- ---------------------------------------------------------------------------------------------
-- Reusable RLS: any active member reads; `write_roles` insert/update/delete.
-- ---------------------------------------------------------------------------------------------
create or replace function private.apply_tenant_policies(p_table text, p_write_roles text[])
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_roles text := quote_literal(p_write_roles::text) || '::text[]';
begin
  execute format('alter table public.%I enable row level security', p_table);
  execute format('revoke all on public.%I from anon', p_table);
  execute format(
    'create policy %I on public.%I for select to authenticated using ((select private.is_member(organization_id)))',
    p_table || '_select', p_table);
  execute format(
    'create policy %I on public.%I for insert to authenticated with check ((select private.has_role(organization_id, %s)))',
    p_table || '_insert', p_table, v_roles);
  execute format(
    'create policy %I on public.%I for update to authenticated using ((select private.has_role(organization_id, %s))) with check ((select private.has_role(organization_id, %s)))',
    p_table || '_update', p_table, v_roles, v_roles);
  execute format(
    'create policy %I on public.%I for delete to authenticated using ((select private.has_role(organization_id, %s)))',
    p_table || '_delete', p_table, v_roles);
end;
$$;

-- Composite keys let child tables reference (organization_id, id), so a row can only point to
-- records of its own organization.
alter table public.vehicles add constraint vehicles_org_id_key unique (organization_id, id);

-- ---------------------------------------------------------------------------------------------
-- Drivers
-- ---------------------------------------------------------------------------------------------
create table public.drivers (
  id                       uuid primary key default gen_random_uuid(),
  organization_id          uuid not null references public.organizations (id) on delete cascade,
  employee_number          text not null default '',
  first_name               text not null check (length(trim(first_name)) > 0),
  last_name                text not null default '',
  phone                    text not null default '',
  email                    text not null default '',
  city                     text not null default '',
  national_id              text not null default '',
  licence_number           text not null default '',
  licence_category         text not null default 'C+E' check (licence_category in ('B', 'C1', 'C', 'C+E')),
  licence_expiry           date,
  cross_border_authorized  boolean not null default false,
  hire_date                date,
  status                   text not null default 'active' check (status in ('active', 'on_trip', 'on_leave', 'inactive')),
  assigned_vehicle_id      uuid,
  emergency_contact_name   text not null default '',
  emergency_contact_phone  text not null default '',
  -- DriverIncident[]: small, always edited as a whole list by the UI.
  incidents                jsonb not null default '[]'::jsonb check (jsonb_typeof(incidents) = 'array'),
  notes                    text not null default '',
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, assigned_vehicle_id)
    references public.vehicles (organization_id, id) on delete set null (assigned_vehicle_id)
);
create index drivers_organization_id_idx on public.drivers (organization_id);
create unique index drivers_employee_number_idx on public.drivers (organization_id, employee_number) where employee_number <> '';
create trigger drivers_set_updated_at before update on public.drivers
  for each row execute function private.set_updated_at();
select private.apply_tenant_policies('drivers', array['owner', 'admin', 'fleet_manager']);

-- ---------------------------------------------------------------------------------------------
-- Trailers
-- ---------------------------------------------------------------------------------------------
create table public.trailers (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references public.organizations (id) on delete cascade,
  plate_number           text not null check (length(trim(plate_number)) > 0),
  fleet_number           text not null default '',
  make                   text not null default '',
  year                   smallint check (year between 1950 and 2100),
  type                   text not null check (type in ('flatbed', 'skeletal', 'tautliner', 'tanker', 'refrigerated', 'lowbed', 'tipper')),
  axles                  smallint not null default 3 check (axles between 1 and 12),
  capacity_tonnes        numeric(6, 1) not null default 0 check (capacity_tonnes >= 0),
  capacity_litres        integer check (capacity_litres >= 0),
  status                 text not null default 'available' check (status in ('available', 'in_use', 'maintenance', 'inactive')),
  assigned_vehicle_id    uuid,
  last_inspection_date   date,
  inspection_expiry      date,
  notes                  text not null default '',
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, plate_number),
  foreign key (organization_id, assigned_vehicle_id)
    references public.vehicles (organization_id, id) on delete set null (assigned_vehicle_id)
);
create index trailers_organization_id_idx on public.trailers (organization_id);
create trigger trailers_set_updated_at before update on public.trailers
  for each row execute function private.set_updated_at();
select private.apply_tenant_policies('trailers', array['owner', 'admin', 'fleet_manager']);

-- Vehicle → driver / trailer links (columns created in migration 1).
alter table public.vehicles
  add constraint vehicles_assigned_driver_fk foreign key (organization_id, assigned_driver_id)
    references public.drivers (organization_id, id) on delete set null (assigned_driver_id),
  add constraint vehicles_linked_trailer_fk foreign key (organization_id, linked_trailer_id)
    references public.trailers (organization_id, id) on delete set null (linked_trailer_id);

-- ---------------------------------------------------------------------------------------------
-- Customers
-- ---------------------------------------------------------------------------------------------
create table public.customers (
  id                           uuid primary key default gen_random_uuid(),
  organization_id              uuid not null references public.organizations (id) on delete cascade,
  code                         text not null default '',
  name                         text not null check (length(trim(name)) > 0),
  legal_name                   text not null default '',
  tax_id                       text not null default '',
  segment                      text not null check (segment in ('mining', 'agriculture', 'construction', 'fuel', 'retail', 'freight_forwarding', 'manufacturing')),
  status                       text not null default 'active' check (status in ('active', 'inactive')),
  contact_name                 text not null default '',
  contact_role                 text not null default '',
  email                        text not null default '',
  phone                        text not null default '',
  city                         text not null default '',
  country                      char(2) not null default 'MZ',
  billing_address              text not null default '',
  billing_email                text not null default '',
  payment_terms_days           smallint not null default 30 check (payment_terms_days between 0 and 365),
  preferred_currency           char(3) not null default 'MZN' check (preferred_currency in ('MZN', 'USD', 'ZAR', 'ZWL')),
  credit_limit_amount          numeric(14, 2) not null default 0 check (credit_limit_amount >= 0),
  credit_limit_currency        char(3) not null default 'MZN' check (credit_limit_currency in ('MZN', 'USD', 'ZAR', 'ZWL')),
  outstanding_balance_amount   numeric(14, 2) not null default 0,
  outstanding_balance_currency char(3) not null default 'MZN' check (outstanding_balance_currency in ('MZN', 'USD', 'ZAR', 'ZWL')),
  notes                        text not null default '',
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now(),
  unique (organization_id, id)
);
create index customers_organization_id_idx on public.customers (organization_id);
create unique index customers_code_idx on public.customers (organization_id, code) where code <> '';
create trigger customers_set_updated_at before update on public.customers
  for each row execute function private.set_updated_at();
-- Customers are maintained by everyone who works with them (all roles except viewer).
select private.apply_tenant_policies('customers', array['owner', 'admin', 'fleet_manager', 'dispatcher', 'finance']);

-- ---------------------------------------------------------------------------------------------
-- Routes (frequently operated corridors; reference data per organization)
-- ---------------------------------------------------------------------------------------------
create table public.routes (
  id                      uuid primary key default gen_random_uuid(),
  organization_id         uuid not null references public.organizations (id) on delete cascade,
  origin                  jsonb not null,        -- TripLocation {city, country, site}
  destination             jsonb not null,
  distance_km             integer not null check (distance_km > 0),
  typical_duration_hours  numeric(5, 1) not null check (typical_duration_hours > 0),
  cross_border            boolean not null default false,
  border_post             text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (organization_id, id)
);
create index routes_organization_id_idx on public.routes (organization_id);
create trigger routes_set_updated_at before update on public.routes
  for each row execute function private.set_updated_at();
select private.apply_tenant_policies('routes', array['owner', 'admin', 'fleet_manager', 'dispatcher']);

-- Migration helper only: never callable through the API.
revoke all on function private.apply_tenant_policies(text, text[]) from public;
