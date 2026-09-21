-- Private Storage structure: <school-id>/<category>/<record-id>/<filename>
-- Categories keep school files organised while RLS keeps tenants separated.
create or replace function public.valid_school_document_path(p_path text, p_school_id uuid)
returns boolean
language sql
stable
as $$
  select (storage.foldername(p_path))[1] = p_school_id::text
     and (storage.foldername(p_path))[2] in (
       'sick-notices',
       'incident-evidence',
       'visitor-documents',
       'learner-records',
       'staff-documents',
       'reports'
     )
$$;

drop policy "school members read documents" on storage.objects;
drop policy "school members upload their documents" on storage.objects;
drop policy "uploaders delete their documents" on storage.objects;

create policy "school members read categorised documents"
on storage.objects for select to authenticated
using (
  bucket_id = 'school-documents'
  and public.valid_school_document_path(name, public.current_school_id())
  and (public.current_app_role() <> 'parent' or owner_id = auth.uid()::text)
);

create policy "school members upload categorised documents"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'school-documents'
  and public.valid_school_document_path(name, public.current_school_id())
  and (public.current_app_role() <> 'parent' or (storage.foldername(name))[2] = 'sick-notices')
);

create policy "uploaders delete categorised documents"
on storage.objects for delete to authenticated
using (
  bucket_id = 'school-documents'
  and public.valid_school_document_path(name, public.current_school_id())
  and owner_id = auth.uid()::text
);

-- Public sign-up only needs a safe school picker; it does not expose tenant
-- data beyond name and code, and it never creates an authenticated account.
create or replace function public.list_school_signup_options()
returns table (code text, name text)
language sql
stable
security definer
set search_path = public
as $$
  select code, name from public.schools order by name
$$;

revoke all on function public.list_school_signup_options() from public;
grant execute on function public.list_school_signup_options() to anon, authenticated;
