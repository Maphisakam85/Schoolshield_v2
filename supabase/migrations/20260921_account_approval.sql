-- SchoolShield account requests and principal/clerk approval workflow.

create table public.account_requests (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  email text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  display_name text not null check (char_length(display_name) between 2 and 120),
  requested_role public.app_role not null default 'parent',
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  approved_role public.app_role,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (school_id, email),
  check (
    (status = 'pending' and approved_role is null and reviewed_by is null and reviewed_at is null)
    or (status = 'approved' and approved_role is not null and reviewed_by is not null and reviewed_at is not null)
    or (status = 'rejected' and reviewed_by is not null and reviewed_at is not null)
  )
);

create index account_requests_review_idx
on public.account_requests(school_id, status, created_at desc);

create or replace function public.is_account_approver()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_app_role() in ('principal', 'clerk')
$$;

-- This public RPC stores a request only. It never creates an authenticated
-- user or grants a role; the Edge Function performs that after approval.
create or replace function public.request_school_account(
  p_school_code text,
  p_email text,
  p_display_name text,
  p_requested_role public.app_role default 'parent'
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
  select id into target_school_id from public.schools where code = upper(trim(p_school_code));
  if target_school_id is null then
    raise exception 'School code not found';
  end if;

  -- Leadership roles may only be assigned by an approver, never requested.
  if p_requested_role in ('principal', 'deputy', 'clerk', 'sgb') then
    p_requested_role := 'parent';
  end if;

  insert into public.account_requests (school_id, email, display_name, requested_role)
  values (target_school_id, lower(trim(p_email)), trim(p_display_name), p_requested_role)
  on conflict (school_id, email) do update
    set display_name = excluded.display_name,
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

-- Invited users do not carry trusted app metadata until the approver's Edge
-- Function assigns it. Do not block a pending invitation at auth.users insert.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  assigned_school_id uuid;
  assigned_role public.app_role;
begin
  if coalesce(new.raw_app_meta_data ->> 'school_code', '') = ''
     or coalesce(new.raw_app_meta_data ->> 'role', '') = '' then
    return new;
  end if;

  select id into assigned_school_id
  from public.schools
  where code = upper(new.raw_app_meta_data ->> 'school_code');

  if assigned_school_id is null then
    raise exception 'A valid school_code app metadata value is required';
  end if;

  assigned_role := (new.raw_app_meta_data ->> 'role')::public.app_role;
  insert into public.profiles (id, school_id, role, display_name)
  values (new.id, assigned_school_id, assigned_role, coalesce(new.raw_user_meta_data ->> 'display_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

alter table public.account_requests enable row level security;

create policy "approvers read school account requests"
on public.account_requests for select to authenticated
using (school_id = public.current_school_id() and public.is_account_approver());

revoke all on function public.is_account_approver() from public;
grant execute on function public.is_account_approver() to authenticated;
revoke all on function public.request_school_account(text, text, text, public.app_role) from public;
grant execute on function public.request_school_account(text, text, text, public.app_role) to anon, authenticated;
