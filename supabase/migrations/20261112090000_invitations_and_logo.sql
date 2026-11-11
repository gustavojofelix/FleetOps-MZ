-- FleetOps MZ — migration 6: accepting invitations and storing the company logo.

-- ---------------------------------------------------------------------------------------------
-- Invitations: owner/admin register a member (status 'invited', no user yet). When a person
-- signs in with that e-mail address (confirmed by Supabase Auth), the invitation is linked to
-- their account and becomes active. Called by the app on every sign-in; idempotent.
-- ---------------------------------------------------------------------------------------------
create or replace function public.claim_invitations()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user  uuid := (select auth.uid());
  v_email text;
  v_count integer;
begin
  if v_user is null then
    return 0;
  end if;
  -- Only confirmed addresses can claim an invitation.
  select lower(email) into v_email from auth.users where id = v_user and email_confirmed_at is not null;
  if v_email is null then
    return 0;
  end if;

  update public.organization_members m
     set user_id = v_user,
         status = 'active',
         full_name = case when m.full_name = '' then coalesce((select raw_user_meta_data ->> 'full_name' from auth.users where id = v_user), '') else m.full_name end,
         last_active_at = now()
   where m.user_id is null
     and m.status = 'invited'
     and lower(m.email) = v_email
     -- Never two memberships of the same user in one organization.
     and not exists (select 1 from public.organization_members o where o.organization_id = m.organization_id and o.user_id = v_user);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.claim_invitations() from public, anon;
grant execute on function public.claim_invitations() to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Company logo: object `{organization_id}/company/{organization_id}/{file}` (settings.manage).
-- ---------------------------------------------------------------------------------------------
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
    when 'company'   then private.has_role(private.file_org(p_name), array['owner', 'admin'])
    else false
  end;
$$;
