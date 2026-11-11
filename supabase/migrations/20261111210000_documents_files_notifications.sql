-- FleetOps MZ — migration 5: document register, private file storage (documents and receipts)
-- and notifications generated from the data, with per-user read state.

-- ---------------------------------------------------------------------------------------------
-- Documents
-- ---------------------------------------------------------------------------------------------
create table public.documents (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  reference        text not null default '',
  type             text not null check (type in ('vehicle_registration', 'insurance', 'inspection', 'road_tax', 'cross_border_permit',
                                                 'driver_licence', 'medical_certificate', 'waybill', 'customs_declaration', 'delivery_note', 'contract')),
  title            text not null check (length(trim(title)) > 0),
  -- Polymorphic link (vehicle, driver, trailer, trip, customer); validated by trigger below.
  entity_type      text not null check (entity_type in ('vehicle', 'driver', 'trailer', 'trip', 'customer')),
  entity_id        uuid not null,
  issuer           text not null default '',
  issue_date       date not null,
  expiry_date      date,
  -- Stored file: object `{organization_id}/documents/{id}/{file_name}` in bucket `files`.
  file_name        text,
  file_size_kb     integer check (file_size_kb >= 0),
  notes            text not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organization_id, id),
  check (expiry_date is null or expiry_date >= issue_date)
);
create index documents_org_expiry_idx on public.documents (organization_id, expiry_date);
create index documents_entity_idx on public.documents (entity_type, entity_id);
create unique index documents_reference_idx on public.documents (organization_id, reference) where reference <> '';
create trigger documents_set_updated_at before update on public.documents
  for each row execute function private.set_updated_at();
select private.apply_tenant_policies('documents', array['owner', 'admin', 'fleet_manager']);

-- The linked record must exist in the same organization.
create or replace function private.check_document_entity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_found boolean;
begin
  execute format('select exists (select 1 from public.%I where id = $1 and organization_id = $2)',
                 case new.entity_type when 'vehicle' then 'vehicles' when 'driver' then 'drivers' when 'trailer' then 'trailers'
                                      when 'trip' then 'trips' when 'customer' then 'customers' end)
    into v_found using new.entity_id, new.organization_id;
  if not v_found then
    raise exception 'document entity % % not found in this organization', new.entity_type, new.entity_id using errcode = '23503';
  end if;
  return new;
end;
$$;
create trigger documents_check_entity before insert or update of entity_type, entity_id, organization_id on public.documents
  for each row execute function private.check_document_entity();

-- Deleting a record removes its documents (the register would otherwise point to nothing).
create or replace function private.delete_entity_documents()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.documents where entity_type = tg_argv[0] and entity_id = old.id;
  return old;
end;
$$;
create trigger vehicles_delete_documents  after delete on public.vehicles  for each row execute function private.delete_entity_documents('vehicle');
create trigger drivers_delete_documents   after delete on public.drivers   for each row execute function private.delete_entity_documents('driver');
create trigger trailers_delete_documents  after delete on public.trailers  for each row execute function private.delete_entity_documents('trailer');
create trigger trips_delete_documents     after delete on public.trips     for each row execute function private.delete_entity_documents('trip');
create trigger customers_delete_documents after delete on public.customers for each row execute function private.delete_entity_documents('customer');

-- ---------------------------------------------------------------------------------------------
-- File storage: private bucket `files`, objects `{organization_id}/{kind}/{record_id}/{file}`
--   kind = documents (documents.manage) | fuel | expenses (costs.manage)
-- ---------------------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('files', 'files', false, 10485760)   -- 10 MB, same limit as the forms
on conflict (id) do nothing;

create or replace function private.file_org(p_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case when split_part(p_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then split_part(p_name, '/', 1)::uuid end;
$$;

create or replace function private.can_write_file(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case split_part(p_name, '/', 2)
    when 'documents' then private.has_role(private.file_org(p_name), array['owner', 'admin', 'fleet_manager'])
    when 'fuel'      then private.has_role(private.file_org(p_name), array['owner', 'admin', 'fleet_manager', 'finance'])
    when 'expenses'  then private.has_role(private.file_org(p_name), array['owner', 'admin', 'fleet_manager', 'finance'])
    else false
  end;
$$;

revoke all on function private.file_org(text) from public;
revoke all on function private.can_write_file(text) from public;
grant execute on function private.file_org(text) to authenticated;
grant execute on function private.can_write_file(text) to authenticated;

create policy files_select on storage.objects for select to authenticated
  using (bucket_id = 'files' and (select private.is_member(private.file_org(name))));
create policy files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'files' and (select private.can_write_file(name)));
create policy files_update on storage.objects for update to authenticated
  using (bucket_id = 'files' and (select private.can_write_file(name)))
  with check (bucket_id = 'files' and (select private.can_write_file(name)));
create policy files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'files' and (select private.can_write_file(name)));

-- ---------------------------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------------------------
create table public.notifications (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  category         text not null check (category in ('maintenance', 'document', 'trip_delay', 'fuel_anomaly', 'expense_approval', 'system')),
  severity         text not null default 'info' check (severity in ('info', 'warning', 'critical')),
  title_key        text not null,          -- translation keys: notifications follow the UI language
  message_key      text not null,
  params           jsonb not null default '{}'::jsonb,
  link             jsonb,                  -- router commands, e.g. ["/trips", "<id>"]
  dedupe_key       text,                   -- one notification per fact (see generate_notifications)
  created_at       timestamptz not null default now(),
  unique (organization_id, dedupe_key)
);
create index notifications_org_created_idx on public.notifications (organization_id, created_at desc);
alter table public.notifications enable row level security;
revoke all on public.notifications from anon;
create policy notifications_select on public.notifications for select to authenticated
  using ((select private.is_member(organization_id)));
create policy notifications_delete on public.notifications for delete to authenticated
  using ((select private.has_role(organization_id, array['owner', 'admin'])));

-- Read state per user.
create table public.notification_reads (
  notification_id uuid not null references public.notifications (id) on delete cascade,
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  read_at         timestamptz not null default now(),
  primary key (notification_id, user_id)
);
alter table public.notification_reads enable row level security;
revoke all on public.notification_reads from anon;
create policy notification_reads_select on public.notification_reads for select to authenticated
  using (user_id = (select auth.uid()));
create policy notification_reads_insert on public.notification_reads for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.notifications n where n.id = notification_id)   -- visible ⇒ same organization
  );
create policy notification_reads_delete on public.notification_reads for delete to authenticated
  using (user_id = (select auth.uid()));

-- What the app reads: notifications with the caller's read flag.
create view public.notifications_feed with (security_invoker = true) as
  select n.id, n.organization_id, n.category, n.severity, n.title_key, n.message_key, n.params, n.link, n.created_at,
         exists (select 1 from public.notification_reads r where r.notification_id = n.id and r.user_id = (select auth.uid())) as read
  from public.notifications n;
revoke all on public.notifications_feed from anon;
grant select on public.notifications_feed to authenticated;

create or replace function public.mark_all_notifications_read()
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.notification_reads (notification_id, user_id)
  select n.id, (select auth.uid()) from public.notifications n
  on conflict do nothing;
$$;
revoke all on function public.mark_all_notifications_read() from public, anon;
grant execute on function public.mark_all_notifications_read() to authenticated;

-- Generates the notifications that follow from the current data of one organization.
-- Idempotent: each fact has a dedupe_key, so running it again adds only new facts.
create or replace function private.generate_notifications(p_org uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings jsonb;
  v_today    date;
  v_doc_days integer;
  v_mnt_days integer;
  v_before   integer;
  v_after    integer;
begin
  select notification_settings, (now() at time zone time_zone)::date into v_settings, v_today
  from public.organizations where id = p_org;
  if not found then return 0; end if;
  v_doc_days := coalesce((v_settings ->> 'documentExpiryDays')::int, 30);
  v_mnt_days := coalesce((v_settings ->> 'maintenanceDueDays')::int, 14);
  select count(*) into v_before from public.notifications where organization_id = p_org;

  -- Delayed trips (one per delay episode = latest delay event).
  if coalesce((v_settings ->> 'tripDelayAlerts')::boolean, true) then
    insert into public.notifications (organization_id, category, severity, title_key, message_key, params, link, dedupe_key)
    select p_org, 'trip_delay', 'critical', 'notifications.messages.tripDelayed.title', 'notifications.messages.tripDelayed.body',
           jsonb_build_object('trip', t.reference, 'route', (t.origin ->> 'city') || ' → ' || (t.destination ->> 'city')),
           jsonb_build_array('/trips', t.id::text),
           'trip_delayed:' || t.id || ':' || coalesce((select max(e.occurred_at)::text from public.trip_events e where e.trip_id = t.id and e.type = 'delay'), '')
    from public.trips t where t.organization_id = p_org and t.status = 'delayed'
    on conflict (organization_id, dedupe_key) do nothing;
  end if;

  -- Fuel readings that cannot be right (odometer going backwards, more litres than the tank holds).
  if coalesce((v_settings ->> 'fuelAnomalyAlerts')::boolean, true) then
    insert into public.notifications (organization_id, category, severity, title_key, message_key, params, link, dedupe_key)
    select p_org, 'fuel_anomaly', 'warning', 'notifications.messages.fuelAnomaly.title', 'notifications.messages.fuelAnomaly.body',
           jsonb_build_object('vehicle', v.plate_number, 'record', f.reference),
           jsonb_build_array('/fuel'), 'fuel:' || f.id
    from public.fuel_records f join public.vehicles v on v.id = f.vehicle_id
    where f.organization_id = p_org
      and f."timestamp" >= now() - interval '30 days'
      and ((v.tank_capacity_l > 0 and f.litres > v.tank_capacity_l)
           or exists (select 1 from public.fuel_records p where p.vehicle_id = f.vehicle_id and p."timestamp" < f."timestamp" and p.odometer_km > f.odometer_km))
    on conflict (organization_id, dedupe_key) do nothing;
  end if;

  -- Pending expenses (at most one reminder per day).
  if coalesce((v_settings ->> 'expenseApprovalAlerts')::boolean, true) then
    insert into public.notifications (organization_id, category, severity, title_key, message_key, params, link, dedupe_key)
    select p_org, 'expense_approval', 'info', 'notifications.messages.expensesPending.title', 'notifications.messages.expensesPending.body',
           jsonb_build_object('count', count(*)), jsonb_build_array('/expenses'), 'expenses_pending:' || v_today
    from public.expenses where organization_id = p_org and approval_status = 'pending'
    having count(*) > 0
    on conflict (organization_id, dedupe_key) do nothing;
  end if;

  -- Documents expired / expiring within the company's warning window.
  insert into public.notifications (organization_id, category, severity, title_key, message_key, params, link, dedupe_key)
  select p_org, 'document',
         case when d.expiry_date < v_today then 'critical' else 'warning' end,
         case when d.expiry_date < v_today then 'notifications.messages.documentExpired.title' else 'notifications.messages.documentExpiring.title' end,
         case when d.expiry_date < v_today then 'notifications.messages.documentExpired.body' else 'notifications.messages.documentExpiring.body' end,
         jsonb_build_object('document', d.title, 'days', d.expiry_date - v_today),
         jsonb_build_array('/documents'),
         case when d.expiry_date < v_today then 'doc_expired:' else 'doc_expiring:' end || d.id || ':' || d.expiry_date
  from public.documents d
  where d.organization_id = p_org and d.expiry_date is not null and d.expiry_date <= v_today + v_doc_days
  on conflict (organization_id, dedupe_key) do nothing;

  -- Driving licences expiring soon.
  insert into public.notifications (organization_id, category, severity, title_key, message_key, params, link, dedupe_key)
  select p_org, 'document', case when dr.licence_expiry < v_today then 'critical' else 'warning' end,
         'notifications.messages.licenceExpiring.title', 'notifications.messages.licenceExpiring.body',
         jsonb_build_object('driver', trim(dr.first_name || ' ' || dr.last_name), 'days', greatest(dr.licence_expiry - v_today, 0)),
         jsonb_build_array('/drivers', dr.id::text), 'licence:' || dr.id || ':' || dr.licence_expiry
  from public.drivers dr
  where dr.organization_id = p_org and dr.status <> 'inactive' and dr.licence_expiry is not null and dr.licence_expiry <= v_today + v_doc_days
  on conflict (organization_id, dedupe_key) do nothing;

  -- Maintenance overdue / due soon.
  insert into public.notifications (organization_id, category, severity, title_key, message_key, params, link, dedupe_key)
  select p_org, 'maintenance',
         case when m.planned_date < v_today then 'warning' else 'info' end,
         case when m.planned_date < v_today then 'notifications.messages.maintenanceOverdue.title' else 'notifications.messages.maintenanceUpcoming.title' end,
         case when m.planned_date < v_today then 'notifications.messages.maintenanceOverdue.body' else 'notifications.messages.maintenanceUpcoming.body' end,
         jsonb_build_object('workOrder', m.work_order_number, 'vehicle', v.plate_number, 'date', m.planned_date),
         jsonb_build_array('/maintenance'),
         case when m.planned_date < v_today then 'mnt_overdue:' else 'mnt_upcoming:' end || m.id || ':' || m.planned_date
  from public.maintenance_records m join public.vehicles v on v.id = m.vehicle_id
  where m.organization_id = p_org and m.status = 'scheduled' and m.planned_date <= v_today + v_mnt_days
  on conflict (organization_id, dedupe_key) do nothing;

  select count(*) into v_after from public.notifications where organization_id = p_org;
  return v_after - v_before;
end;
$$;
revoke all on function private.generate_notifications(uuid) from public;

-- Called by the app when a member opens it: refreshes the notifications of their organizations.
create or replace function public.refresh_my_notifications()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org   uuid;
  v_total integer := 0;
begin
  for v_org in
    select organization_id from public.organization_members where user_id = (select auth.uid()) and status = 'active'
  loop
    v_total := v_total + private.generate_notifications(v_org);
  end loop;
  return v_total;
end;
$$;
revoke all on function public.refresh_my_notifications() from public, anon;
grant execute on function public.refresh_my_notifications() to authenticated;

-- Optional daily run when the pg_cron extension is enabled (Database → Extensions).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('fleetops-notifications', '0 4 * * *',
      $job$ select private.generate_notifications(id) from public.organizations $job$);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Fix (migration 3): create_trip() must apply column defaults for omitted optional fields
-- (jsonb_populate_record leaves them NULL).
-- ---------------------------------------------------------------------------------------------
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
    jsonb_build_object('revenue_amount', 0, 'revenue_currency', 'MZN', 'notes', '', 'customer_reference', '')
    || jsonb_strip_nulls(p_trip)
    || jsonb_build_object(
      'id', gen_random_uuid(), 'status', 'planned', 'created_at', now(), 'updated_at', now(),
      'actual_departure', null, 'actual_arrival', null, 'actual_distance_km', null, 'delay_reason', null
    )
  );
  insert into public.trips values (v_trip.*);
  insert into public.trip_events (organization_id, trip_id, type, status, location, note)
  values (v_trip.organization_id, v_trip.id, 'created', 'planned', coalesce(v_trip.origin ->> 'city', ''), coalesce(p_note, ''));
  return v_trip.id;
end;
$$;
