-- FleetOps MZ — migration 3: trips, trip timeline and resource-status consistency.
--
-- Rules enforced here (previously only in the browser):
--   * status transitions follow src/app/core/domain/trip-rules.ts (TRIP_STATUS_TRANSITIONS);
--   * vehicle / driver / trailer statuses are derived from the active trips that use them,
--     in the same transaction as the trip change (trigger), whoever makes the change.

-- ---------------------------------------------------------------------------------------------
-- Trips
-- ---------------------------------------------------------------------------------------------
create table public.trips (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id) on delete cascade,
  reference           text not null check (length(trim(reference)) > 0),
  customer_id         uuid not null,
  vehicle_id          uuid not null,
  driver_id           uuid not null,
  trailer_id          uuid,
  route_id            uuid,
  origin              jsonb not null,   -- TripLocation {city, country, site}
  destination         jsonb not null,
  planned_distance_km integer not null check (planned_distance_km >= 0),
  actual_distance_km  integer check (actual_distance_km >= 0),
  cargo               jsonb not null,   -- TripCargo {type, description, weightTonnes, containerRef, sealNumber}
  planned_departure   timestamptz not null,
  planned_arrival     timestamptz not null,
  actual_departure    timestamptz,
  actual_arrival      timestamptz,
  status              text not null default 'planned'
                        check (status in ('planned', 'preparing', 'in_transit', 'delayed', 'delivered', 'completed', 'cancelled')),
  revenue_amount      numeric(14, 2) not null default 0 check (revenue_amount >= 0),
  revenue_currency    char(3) not null default 'MZN' check (revenue_currency in ('MZN', 'USD', 'ZAR', 'ZWL')),
  customer_reference  text not null default '',
  delay_reason        text,
  notes               text not null default '',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, reference),
  check (planned_arrival > planned_departure),
  -- Records with trip history cannot be deleted (history must stay intact).
  foreign key (organization_id, customer_id) references public.customers (organization_id, id) on delete restrict,
  foreign key (organization_id, vehicle_id)  references public.vehicles  (organization_id, id) on delete restrict,
  foreign key (organization_id, driver_id)   references public.drivers   (organization_id, id) on delete restrict,
  foreign key (organization_id, trailer_id)  references public.trailers  (organization_id, id) on delete restrict,
  foreign key (organization_id, route_id)    references public.routes    (organization_id, id) on delete set null (route_id)
);
create index trips_organization_departure_idx on public.trips (organization_id, planned_departure desc);
create index trips_vehicle_idx  on public.trips (vehicle_id);
create index trips_driver_idx   on public.trips (driver_id);
create index trips_trailer_idx  on public.trips (trailer_id);
create index trips_customer_idx on public.trips (customer_id);
create index trips_active_idx   on public.trips (organization_id, status) where status in ('preparing', 'in_transit', 'delayed');
create trigger trips_set_updated_at before update on public.trips
  for each row execute function private.set_updated_at();

-- Trip timeline (TripEvent[]).
create table public.trip_events (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  trip_id         uuid not null,
  occurred_at     timestamptz not null default now(),
  type            text not null check (type in ('created', 'status_change', 'checkpoint', 'border_crossing', 'note', 'delay')),
  status          text check (status in ('planned', 'preparing', 'in_transit', 'delayed', 'delivered', 'completed', 'cancelled')),
  location        text not null default '',
  note            text not null default '',
  created_by      uuid default auth.uid() references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  foreign key (organization_id, trip_id) references public.trips (organization_id, id) on delete cascade
);
create index trip_events_trip_idx on public.trip_events (trip_id, occurred_at);

-- Planning a trip is allowed to everyone who manages trips (trips.manage).
select private.apply_tenant_policies('trips', array['owner', 'admin', 'fleet_manager', 'dispatcher']);
select private.apply_tenant_policies('trip_events', array['owner', 'admin', 'fleet_manager', 'dispatcher']);

-- ---------------------------------------------------------------------------------------------
-- Status transitions (mirror of TRIP_STATUS_TRANSITIONS in trip-rules.ts)
-- ---------------------------------------------------------------------------------------------
create or replace function private.trip_transition_allowed(p_from text, p_to text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_to = any (case p_from
    when 'planned'    then array['preparing', 'cancelled']
    when 'preparing'  then array['in_transit', 'planned', 'cancelled']
    when 'in_transit' then array['delayed', 'delivered']
    when 'delayed'    then array['in_transit', 'delivered']
    when 'delivered'  then array['completed', 'in_transit']
    when 'cancelled'  then array['planned']
    else array[]::text[]
  end);
$$;

create or replace function private.check_trip_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status and not private.trip_transition_allowed(old.status, new.status) then
    raise exception 'invalid trip status transition % -> %', old.status, new.status using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger trips_check_transition before update of status on public.trips
  for each row execute function private.check_trip_transition();

-- ---------------------------------------------------------------------------------------------
-- Resource statuses derived from active trips
--   vehicle: in_transit while a trip using it is in_transit/delayed (else back to available)
--   driver:  on_trip    while a trip using it is in_transit/delayed (else back to active)
--   trailer: in_use     while a trip using it is preparing/in_transit/delayed (else available)
-- Resources in other states (maintenance, on_leave, inactive…) are only touched when a trip
-- actually starts with them, never when releasing.
-- ---------------------------------------------------------------------------------------------
create or replace function private.refresh_vehicle_status(p_vehicle_id uuid, p_reference text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current text;
  v_busy    boolean;
  v_target  text;
  v_org     uuid;
begin
  select status, organization_id into v_current, v_org from public.vehicles where id = p_vehicle_id for update;
  if not found then return; end if;
  select exists (select 1 from public.trips where vehicle_id = p_vehicle_id and status in ('in_transit', 'delayed')) into v_busy;
  v_target := case when v_busy then 'in_transit' when v_current = 'in_transit' then 'available' else v_current end;
  if v_target <> v_current then
    update public.vehicles set status = v_target where id = p_vehicle_id;
    insert into public.vehicle_status_changes (organization_id, vehicle_id, from_status, to_status, reason)
    values (v_org, p_vehicle_id, v_current, v_target,
            case when v_busy then 'Viagem ' || p_reference else 'Viagem ' || p_reference || ' terminada' end);
  end if;
end;
$$;

create or replace function private.refresh_driver_status(p_driver_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_busy boolean;
begin
  select exists (select 1 from public.trips where driver_id = p_driver_id and status in ('in_transit', 'delayed')) into v_busy;
  update public.drivers
     set status = case when v_busy then 'on_trip' else 'active' end
   where id = p_driver_id
     and (case when v_busy then status <> 'on_trip' else status = 'on_trip' end);
end;
$$;

create or replace function private.refresh_trailer_status(p_trailer_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_busy boolean;
begin
  if p_trailer_id is null then return; end if;
  select exists (select 1 from public.trips where trailer_id = p_trailer_id and status in ('preparing', 'in_transit', 'delayed')) into v_busy;
  update public.trailers
     set status = case when v_busy then 'in_use' else 'available' end
   where id = p_trailer_id
     and (case when v_busy then status <> 'in_use' else status = 'in_use' end);
end;
$$;

create or replace function private.sync_trip_resources()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform private.refresh_vehicle_status(old.vehicle_id, old.reference);
    perform private.refresh_driver_status(old.driver_id);
    perform private.refresh_trailer_status(old.trailer_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform private.refresh_vehicle_status(new.vehicle_id, new.reference);
    perform private.refresh_driver_status(new.driver_id);
    perform private.refresh_trailer_status(new.trailer_id);
  end if;
  return null;
end;
$$;

create trigger trips_sync_resources
  after insert or delete or update of status, vehicle_id, driver_id, trailer_id on public.trips
  for each row execute function private.sync_trip_resources();

-- The transition check runs as the caller (BEFORE trigger), so members need EXECUTE.
revoke all on function private.trip_transition_allowed(text, text) from public;
grant execute on function private.trip_transition_allowed(text, text) to authenticated;
revoke all on function private.refresh_vehicle_status(uuid, text) from public;
revoke all on function private.refresh_driver_status(uuid) from public;
revoke all on function private.refresh_trailer_status(uuid) from public;

-- ---------------------------------------------------------------------------------------------
-- RPCs (SECURITY INVOKER: the caller's RLS applies; the trigger above does the privileged part)
-- ---------------------------------------------------------------------------------------------

-- Creates a planned trip and its "created" timeline event in one transaction.
-- p_trip: snake_case trip columns (organization_id included); system columns are ignored.
create or replace function public.create_trip(p_trip jsonb, p_note text default '')
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_trip public.trips;
begin
  v_trip := jsonb_populate_record(
    null::public.trips,
    p_trip || jsonb_build_object(
      'id', gen_random_uuid(), 'status', 'planned', 'created_at', now(), 'updated_at', now(),
      'actual_departure', null, 'actual_arrival', null, 'actual_distance_km', null, 'delay_reason', null
    )
  );
  v_trip.notes := coalesce(v_trip.notes, '');
  v_trip.customer_reference := coalesce(v_trip.customer_reference, '');
  insert into public.trips values (v_trip.*);
  insert into public.trip_events (organization_id, trip_id, type, status, location, note)
  values (v_trip.organization_id, v_trip.id, 'created', 'planned', coalesce(v_trip.origin ->> 'city', ''), coalesce(p_note, ''));
  return v_trip.id;
end;
$$;

-- Changes the status, records actual times and appends the timeline event.
create or replace function public.change_trip_status(p_trip_id uuid, p_status text, p_note text default '', p_delay_reason text default null)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_trip public.trips;
begin
  select * into v_trip from public.trips where id = p_trip_id for update;
  if not found then
    raise exception 'trip % not found', p_trip_id using errcode = 'P0002';
  end if;

  update public.trips set
    status             = p_status,
    actual_departure   = case when p_status in ('planned', 'preparing') then null
                              when p_status = 'in_transit' then coalesce(actual_departure, now())
                              else actual_departure end,
    actual_arrival     = case when p_status in ('planned', 'preparing') then null
                              when p_status = 'delivered' then coalesce(actual_arrival, now())
                              else actual_arrival end,
    actual_distance_km = case when p_status = 'delivered' then coalesce(actual_distance_km, planned_distance_km)
                              else actual_distance_km end,
    delay_reason       = case when p_status = 'delayed' then coalesce(p_delay_reason, delay_reason) else delay_reason end
  where id = p_trip_id;

  insert into public.trip_events (organization_id, trip_id, type, status, location, note)
  values (
    v_trip.organization_id, p_trip_id,
    case when p_status = 'delayed' then 'delay' else 'status_change' end,
    p_status,
    case when p_status in ('delivered', 'completed') then coalesce(v_trip.destination ->> 'city', '') else coalesce(v_trip.origin ->> 'city', '') end,
    case when p_status = 'delayed' then coalesce(p_delay_reason, p_note, '') else coalesce(p_note, '') end
  );
end;
$$;

revoke all on function public.create_trip(jsonb, text) from public, anon;
revoke all on function public.change_trip_status(uuid, text, text, text) from public, anon;
grant execute on function public.create_trip(jsonb, text) to authenticated;
grant execute on function public.change_trip_status(uuid, text, text, text) to authenticated;
