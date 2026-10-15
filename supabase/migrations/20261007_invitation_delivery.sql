-- Request preference never grants account access or assigns trusted roles.
alter table public.account_requests
  add column invitation_method text not null default 'email' check (invitation_method in ('email', 'sms')),
  add column phone text,
  add constraint account_request_sms_phone check (invitation_method <> 'sms' or (phone is not null and phone ~ '^\+27[6-8][0-9]{8}$'));
drop function public.request_school_account(text, text, text, public.app_role);
create or replace function public.request_school_account(
  p_school_code text,
  p_email text,
  p_display_name text,
  p_requested_role public.app_role default 'parent',
  p_invitation_method text default 'email',
  p_phone text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_school_id uuid;
  request_id uuid;
begin
  if p_invitation_method is null or p_invitation_method not in ('email', 'sms') then raise exception 'Choose Email or SMS'; end if;
  select id into target_school_id from public.schools where code = upper(trim(p_school_code));
  if target_school_id is null then
    raise exception 'School code not found';
  end if;

  -- Leadership roles may only be assigned by an approver, never requested.
  if p_requested_role in ('principal', 'deputy', 'clerk', 'sgb') then
    p_requested_role := 'parent';
  end if;

  insert into public.account_requests (school_id, email, display_name, requested_role, invitation_method, phone)
  values (target_school_id, lower(trim(p_email)), trim(p_display_name), p_requested_role, p_invitation_method, case when p_invitation_method = 'sms' then p_phone else null end)
  on conflict (school_id, email) do update
    set display_name = excluded.display_name,
        invitation_method = excluded.invitation_method,
        phone = excluded.phone,
        requested_role = excluded.requested_role,
        status = 'pending',
        approved_role = null,
        reviewed_by = null,
        reviewed_at = null,
        created_at = now()
  where public.account_requests.status <> 'approved'
  returning id into request_id;

  if request_id is null then
    raise exception 'An approved account already exists for this school and email';
  end if;
  return request_id;
end;
$$;


revoke all on function public.request_school_account(text,text,text,public.app_role,text,text) from public;
grant execute on function public.request_school_account(text,text,text,public.app_role,text,text) to anon, authenticated;
create or replace function public.complete_my_profile(
  p_display_name text,
  p_phone text,
  p_address text default null,
  p_emergency_contact text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in is required';
  end if;
  if p_display_name is null or char_length(trim(p_display_name)) not between 2 and 120 or p_phone is null or p_phone !~ '^\+27[6-8][0-9]{8}$' then
    raise exception 'Enter a full name and a valid mobile number';
  end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and onboarding_completed_at is null) then
    raise exception 'This account is unavailable or has already completed setup';
  end if;
  update public.profiles
  set display_name = trim(p_display_name),
      phone = trim(p_phone),
      address = nullif(trim(coalesce(p_address, '')), ''),
      emergency_contact = nullif(trim(coalesce(p_emergency_contact, '')), ''),
      onboarding_completed_at = now()
  where id = auth.uid() and onboarding_completed_at is null;
  if not found then raise exception 'Account setup has already been completed'; end if;
end;
$$;

revoke all on function public.complete_my_profile(text, text, text, text) from public;
grant execute on function public.complete_my_profile(text, text, text, text) to authenticated;
