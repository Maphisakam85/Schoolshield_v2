-- SchoolShield operational-prototype baseline.
-- Apply with: supabase db push (after linking your project), or paste into
-- Supabase SQL Editor. Never expose a service_role key in the browser.

create extension if not exists pgcrypto;

create type public.app_role as enum (
  'principal', 'deputy', 'clerk', 'teacher', 'security', 'parent', 'sgb'
);

create table public.schools (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9-]{3,32}$'),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete restrict,
  role public.app_role not null default 'parent',
  display_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The existing browser prototype stores a complete school workspace object.
-- Keeping it in one versioned row lets the prototype become persistent before
-- its individual features are migrated into normalized tables.
create table public.school_workspaces (
  school_id uuid primary key references public.schools(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.sick_notice_attachments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  sick_notice_id text not null,
  storage_path text not null unique,
  submitted_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Parent-submitted notices are kept outside the staff workspace so parents
-- never need access to the school-wide learner, attendance or chat payload.
create table public.parent_learner_links (
  school_id uuid not null references public.schools(id) on delete cascade,
  parent_id uuid not null references auth.users(id) on delete cascade,
  learner_ref text not null,
  created_at timestamptz not null default now(),
  primary key (school_id, parent_id, learner_ref)
);

create table public.sick_notices (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  learner_ref text not null,
  notice_date date not null,
  reason text not null check (char_length(reason) between 3 and 2000),
  status text not null default 'pending_review' check (status in ('pending_review', 'reviewed')),
  submitted_by uuid not null references auth.users(id) on delete cascade,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'pending_review' and reviewed_by is null and reviewed_at is null)
      or (status = 'reviewed' and reviewed_by is not null and reviewed_at is not null))
);

create index profiles_school_id_idx on public.profiles(school_id);
create index sick_notice_attachments_school_id_idx on public.sick_notice_attachments(school_id);
create index parent_learner_links_parent_id_idx on public.parent_learner_links(parent_id);
create index sick_notices_school_id_idx on public.sick_notices(school_id, notice_date desc);

create or replace function public.current_school_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select school_id from public.profiles where id = auth.uid()
$$;

create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_school_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_app_role() in ('principal', 'deputy', 'clerk')
$$;

-- Auth users receive their tenant and role only from trusted app metadata
-- supplied by the Supabase Admin API / invitation flow. Client-editable user
-- metadata is deliberately not used for authorization.
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
  select id into assigned_school_id
  from public.schools
  where code = upper(new.raw_app_meta_data ->> 'school_code');

  if assigned_school_id is null then
    raise exception 'A valid school_code app metadata value is required';
  end if;

  assigned_role := (new.raw_app_meta_data ->> 'role')::public.app_role;
  insert into public.profiles (id, school_id, role, display_name)
  values (
    new.id,
    assigned_school_id,
    assigned_role,
    coalesce(new.raw_user_meta_data ->> 'display_name', '')
  );
  return new;
end;
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute procedure public.set_updated_at();

create trigger school_workspaces_set_updated_at
before update on public.school_workspaces
for each row execute procedure public.set_updated_at();

create trigger sick_notices_set_updated_at
before update on public.sick_notices
for each row execute procedure public.set_updated_at();

create trigger auth_user_profile_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

revoke all on function public.current_school_id() from public;
revoke all on function public.current_app_role() from public;
revoke all on function public.is_school_manager() from public;
revoke all on function public.handle_new_user() from public;
grant execute on function public.current_school_id() to authenticated;
grant execute on function public.current_app_role() to authenticated;
grant execute on function public.is_school_manager() to authenticated;

alter table public.schools enable row level security;
alter table public.profiles enable row level security;
alter table public.school_workspaces enable row level security;
alter table public.sick_notice_attachments enable row level security;
alter table public.parent_learner_links enable row level security;
alter table public.sick_notices enable row level security;

create policy "members read their school"
on public.schools for select to authenticated
using (id = public.current_school_id());

create policy "members read school profiles"
on public.profiles for select to authenticated
using (school_id = public.current_school_id());

-- Profile assignment and role changes are intentionally server/admin-only.
-- Letting a client update this table would allow role escalation.

create policy "staff read their workspace"
on public.school_workspaces for select to authenticated
using (school_id = public.current_school_id() and public.current_app_role() <> 'parent');

create policy "staff update their workspace"
on public.school_workspaces for update to authenticated
using (school_id = public.current_school_id() and public.current_app_role() <> 'parent')
with check (school_id = public.current_school_id() and public.current_app_role() <> 'parent');

create policy "managers create a workspace"
on public.school_workspaces for insert to authenticated
with check (school_id = public.current_school_id() and public.is_school_manager());

create policy "staff read school attachment records"
on public.sick_notice_attachments for select to authenticated
using (school_id = public.current_school_id() and public.current_app_role() <> 'parent');

create policy "parents read their own attachment records"
on public.sick_notice_attachments for select to authenticated
using (school_id = public.current_school_id() and submitted_by = auth.uid());

create policy "members create their school attachment records"
on public.sick_notice_attachments for insert to authenticated
with check (school_id = public.current_school_id() and submitted_by = auth.uid());

create policy "parents read their learner links"
on public.parent_learner_links for select to authenticated
using (school_id = public.current_school_id() and parent_id = auth.uid());

create policy "staff read school learner links"
on public.parent_learner_links for select to authenticated
using (school_id = public.current_school_id() and public.current_app_role() <> 'parent');

create policy "parents submit a linked learner notice"
on public.sick_notices for insert to authenticated
with check (
  school_id = public.current_school_id()
  and submitted_by = auth.uid()
  and exists (
    select 1 from public.parent_learner_links link
    where link.school_id = sick_notices.school_id
      and link.parent_id = auth.uid()
      and link.learner_ref = sick_notices.learner_ref
  )
);

create policy "parents read their own notices"
on public.sick_notices for select to authenticated
using (school_id = public.current_school_id() and submitted_by = auth.uid());

create policy "staff read school notices"
on public.sick_notices for select to authenticated
using (school_id = public.current_school_id() and public.current_app_role() <> 'parent');

create policy "staff review school notices"
on public.sick_notices for update to authenticated
using (school_id = public.current_school_id() and public.current_app_role() <> 'parent')
with check (school_id = public.current_school_id() and public.current_app_role() <> 'parent');

-- Private bucket. Files are addressed as <school-id>/<sick-notice-id>/<file>.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('school-documents', 'school-documents', false, 10485760,
  array['image/jpeg', 'image/png', 'application/pdf', 'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do nothing;

create policy "school members read documents"
on storage.objects for select to authenticated
using (
  bucket_id = 'school-documents'
  and (storage.foldername(name))[1] = public.current_school_id()::text
  and (public.current_app_role() <> 'parent' or owner_id = auth.uid()::text)
);

create policy "school members upload their documents"
on storage.objects for insert to authenticated
with check (bucket_id = 'school-documents' and (storage.foldername(name))[1] = public.current_school_id()::text);

create policy "uploaders delete their documents"
on storage.objects for delete to authenticated
using (bucket_id = 'school-documents' and owner_id = auth.uid()::text);

-- Demo-school tenants. Add real users through Supabase Auth, then assign their
-- school and role in public.profiles from a trusted server/admin process.
insert into public.schools (code, name) values
  ('SMM-001', 'Setjhaba-Se-Maketse Combined School'),
  ('LLT-002', 'Lenyora La Thuto Secondary School'),
  ('SEE-003', 'Seemahale Secondary School'),
  ('LER-004', 'Leratong Secondary School'),
  ('NTE-005', 'Ntemoseng Secondary School')
on conflict (code) do update set name = excluded.name;
