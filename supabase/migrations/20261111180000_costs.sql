-- FleetOps MZ — migration 4: fuel, expenses (with role-restricted approval), maintenance
-- work orders and dated exchange rates.
--
-- Money is stored in its original currency (amount + currency) and never converted on write.

-- organization_members is referenced by expenses (submitted by).
alter table public.organization_members add constraint organization_members_org_id_key unique (organization_id, id);

-- ---------------------------------------------------------------------------------------------
-- Fuel records
-- ---------------------------------------------------------------------------------------------
create table public.fuel_records (
  id                       uuid primary key default gen_random_uuid(),
  organization_id          uuid not null references public.organizations (id) on delete cascade,
  reference                text not null default '',
  "timestamp"              timestamptz not null,
  vehicle_id               uuid not null,
  driver_id                uuid,
  trip_id                  uuid,
  odometer_km              integer not null check (odometer_km >= 0),
  litres                   numeric(8, 2) not null check (litres > 0),
  price_per_litre_amount   numeric(10, 3) not null check (price_per_litre_amount >= 0),
  price_per_litre_currency char(3) not null check (price_per_litre_currency in ('MZN', 'USD', 'ZAR', 'ZWL')),
  total_amount_amount      numeric(14, 2) not null check (total_amount_amount >= 0),
  total_amount_currency    char(3) not null check (total_amount_currency in ('MZN', 'USD', 'ZAR', 'ZWL')),
  full_tank                boolean not null default true,
  station                  text not null default '',
  location                 text not null default '',
  receipt_file_name        text,
  notes                    text not null default '',
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, vehicle_id) references public.vehicles (organization_id, id) on delete restrict,
  foreign key (organization_id, driver_id)  references public.drivers  (organization_id, id) on delete set null (driver_id),
  foreign key (organization_id, trip_id)    references public.trips    (organization_id, id) on delete set null (trip_id)
);
create index fuel_records_org_time_idx on public.fuel_records (organization_id, "timestamp" desc);
create index fuel_records_vehicle_idx on public.fuel_records (vehicle_id, "timestamp");
create index fuel_records_trip_idx on public.fuel_records (trip_id);
create trigger fuel_records_set_updated_at before update on public.fuel_records
  for each row execute function private.set_updated_at();
select private.apply_tenant_policies('fuel_records', array['owner', 'admin', 'fleet_manager', 'finance']);

-- ---------------------------------------------------------------------------------------------
-- Expenses
-- ---------------------------------------------------------------------------------------------
create table public.expenses (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations (id) on delete cascade,
  reference             text not null default '',
  date                  date not null,
  category              text not null check (category in ('tolls', 'border_fees', 'driver_allowance', 'parking', 'loading', 'repairs', 'tyres', 'insurance', 'permits', 'fines', 'other')),
  amount_amount         numeric(14, 2) not null check (amount_amount >= 0),
  amount_currency       char(3) not null check (amount_currency in ('MZN', 'USD', 'ZAR', 'ZWL')),
  vehicle_id            uuid,
  trip_id               uuid,
  driver_id             uuid,
  vendor                text not null default '',
  description           text not null default '',
  payment_method        text not null default 'cash' check (payment_method in ('cash', 'bank_transfer', 'mobile_money', 'fuel_card', 'company_card')),
  approval_status       text not null default 'pending' check (approval_status in ('pending', 'approved', 'rejected')),
  submitted_by_user_id  uuid,                       -- organization_members.id
  approved_by           uuid default null references auth.users (id) on delete set null,
  approved_at           timestamptz,
  receipt_file_name     text,
  notes                 text not null default '',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, vehicle_id) references public.vehicles (organization_id, id) on delete set null (vehicle_id),
  foreign key (organization_id, trip_id)    references public.trips    (organization_id, id) on delete set null (trip_id),
  foreign key (organization_id, driver_id)  references public.drivers  (organization_id, id) on delete set null (driver_id),
  foreign key (organization_id, submitted_by_user_id)
    references public.organization_members (organization_id, id) on delete set null (submitted_by_user_id)
);
create index expenses_org_date_idx on public.expenses (organization_id, date desc);
create index expenses_trip_idx on public.expenses (trip_id);
create index expenses_vehicle_idx on public.expenses (vehicle_id);
create index expenses_pending_idx on public.expenses (organization_id) where approval_status = 'pending';
create trigger expenses_set_updated_at before update on public.expenses
  for each row execute function private.set_updated_at();
select private.apply_tenant_policies('expenses', array['owner', 'admin', 'fleet_manager', 'finance']);

-- costs.approve: only owner / admin / finance may set an approval decision. Anyone who can
-- write expenses may (re)submit them as pending. The decision is stamped with who and when.
create or replace function private.guard_expense_approval()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.approval_status <> 'pending'
     and (tg_op = 'INSERT' or new.approval_status is distinct from old.approval_status)
     and (select auth.uid()) is not null   -- server-side jobs / seeds run without a user
     and not private.has_role(new.organization_id, array['owner', 'admin', 'finance']) then
    raise exception 'only owner, admin or finance can approve or reject expenses' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' or new.approval_status is distinct from old.approval_status then
    new.approved_by := case when new.approval_status = 'pending' then null else (select auth.uid()) end;
    new.approved_at := case when new.approval_status = 'pending' then null else now() end;
  end if;
  return new;
end;
$$;

create trigger expenses_guard_approval before insert or update on public.expenses
  for each row execute function private.guard_expense_approval();

-- ---------------------------------------------------------------------------------------------
-- Maintenance work orders
-- ---------------------------------------------------------------------------------------------
create table public.maintenance_records (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations (id) on delete cascade,
  work_order_number  text not null default '',
  vehicle_id         uuid not null,
  type               text not null check (type in ('preventive', 'corrective', 'inspection', 'tyres', 'bodywork', 'electrical')),
  status             text not null default 'scheduled' check (status in ('scheduled', 'in_progress', 'completed', 'cancelled')),
  description        text not null default '',
  workshop           text not null default '',
  odometer_km        integer not null default 0 check (odometer_km >= 0),
  planned_date       date not null,
  started_date       date,
  completed_date     date,
  currency           char(3) not null default 'MZN' check (currency in ('MZN', 'USD', 'ZAR', 'ZWL')),
  parts_cost         numeric(14, 2) not null default 0 check (parts_cost >= 0),
  labour_cost        numeric(14, 2) not null default 0 check (labour_cost >= 0),
  total_cost         numeric(14, 2) generated always as (parts_cost + labour_cost) stored,
  downtime_hours     numeric(7, 1) not null default 0 check (downtime_hours >= 0),
  next_service_km    integer check (next_service_km >= 0),
  next_service_date  date,
  notes              text not null default '',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, vehicle_id) references public.vehicles (organization_id, id) on delete restrict
);
create index maintenance_org_planned_idx on public.maintenance_records (organization_id, planned_date desc);
create index maintenance_vehicle_idx on public.maintenance_records (vehicle_id);
create unique index maintenance_work_order_idx on public.maintenance_records (organization_id, work_order_number) where work_order_number <> '';
create trigger maintenance_records_set_updated_at before update on public.maintenance_records
  for each row execute function private.set_updated_at();
select private.apply_tenant_policies('maintenance_records', array['owner', 'admin', 'fleet_manager']);

-- ---------------------------------------------------------------------------------------------
-- Exchange rates (global reference data: MZN per unit of currency, dated)
-- Read by every signed-in user; written only by the service role / dashboard.
-- ---------------------------------------------------------------------------------------------
create table public.exchange_rates (
  currency        char(3) not null check (currency in ('MZN', 'USD', 'ZAR', 'ZWL')),
  effective_date  date not null,
  rate_to_mzn     numeric(18, 8) not null check (rate_to_mzn > 0),
  source          text not null default 'manual',
  created_at      timestamptz not null default now(),
  primary key (currency, effective_date)
);
alter table public.exchange_rates enable row level security;
revoke all on public.exchange_rates from anon;
create policy exchange_rates_select on public.exchange_rates for select to authenticated using (true);

-- Indicative starting values (same as the demo build). Not market rates: the UI keeps
-- labelling converted figures as simulated until a real rate source is connected.
insert into public.exchange_rates (currency, effective_date, rate_to_mzn, source) values
  ('MZN', '2026-10-01', 1, 'manual'),
  ('USD', '2026-10-01', 63.9, 'manual'),
  ('ZAR', '2026-10-01', 3.55, 'manual'),
  ('ZWL', '2026-10-01', 0.0021, 'manual');
