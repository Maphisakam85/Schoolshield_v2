-- Record permission, not mere membership or object ownership, controls files.
create or replace function public.can_access_document_record(p_school uuid,p_entity text,p_record text,p_write boolean default false)
returns boolean language plpgsql stable security definer set search_path=public as $$
declare actor public.profiles%rowtype;
begin
  select * into actor from public.profiles where id=auth.uid();
  if actor.id is null or actor.school_id is distinct from p_school then return false; end if;
  if p_entity='visitor' then
    if not exists(select 1 from public.school_workspaces w cross join lateral jsonb_array_elements(coalesce(w.payload->'visitors','[]')) v where w.school_id=p_school and v->>'id'=p_record) then return false; end if;
    return case when coalesce(p_write,false) then actor.role in ('security','clerk') else actor.role in ('principal','deputy','clerk','security','sgb') end;
  elsif p_entity='incident' then
    return public.can_access_school_incident(p_school,p_record) and (not coalesce(p_write,false) or actor.role in ('principal','deputy','security','teacher'));
  elsif p_entity='sick-notice' then
    return public.can_access_school_notice(p_school,p_record);
  end if;
  return false;
end;
$$;
revoke all on function public.can_access_document_record(uuid,text,text,boolean) from public,anon;
grant execute on function public.can_access_document_record(uuid,text,text,boolean) to authenticated;

drop policy if exists "staff read school attachment records" on public.sick_notice_attachments;
drop policy if exists "parents read their own attachment records" on public.sick_notice_attachments;
drop policy if exists "members create their school attachment records" on public.sick_notice_attachments;
create policy "linked records read legacy attachments" on public.sick_notice_attachments for select to authenticated
  using(public.can_access_school_notice(school_id,sick_notice_id));
-- New uploads must use staged generic metadata and verified finalization.
revoke insert,update,delete on public.sick_notice_attachments from authenticated,anon;
grant select on public.sick_notice_attachments to authenticated;

drop policy if exists "school members read documents" on storage.objects;
drop policy if exists "school members upload their documents" on storage.objects;
drop policy if exists "uploaders delete their documents" on storage.objects;
drop policy if exists "school members read categorised documents" on storage.objects;
drop policy if exists "school members upload categorised documents" on storage.objects;
drop policy if exists "uploaders delete categorised documents" on storage.objects;
drop policy if exists "authorised attachment downloads" on storage.objects;
drop policy if exists "authorised attachment uploads" on storage.objects;
drop policy if exists "uploaders clean pending files" on storage.objects;
create policy "record authorised private downloads" on storage.objects for select to authenticated
  using(bucket_id='school-documents' and (
    exists(select 1 from public.document_attachments a where a.storage_path=name and a.status='ready'
      and a.school_id=public.current_school_id() and split_part(name,'/',1)=a.school_id::text
      and public.can_access_document_record(a.school_id,a.entity_type,a.record_id))
    or exists(select 1 from public.sick_notice_attachments a where a.storage_path=name
      and a.school_id=public.current_school_id() and split_part(name,'/',1)=a.school_id::text
      and public.can_access_school_notice(a.school_id,a.sick_notice_id))));
create policy "record authorised staged uploads" on storage.objects for insert to authenticated
  with check(bucket_id='school-documents' and owner_id=auth.uid()::text
    and exists(select 1 from public.document_attachments a where a.storage_path=name and a.status='pending'
      and a.submitted_by=auth.uid() and public.can_access_document_record(a.school_id,a.entity_type,a.record_id,true)));
create policy "record authorised pending cleanup" on storage.objects for delete to authenticated
  using(bucket_id='school-documents' and owner_id=auth.uid()::text
    and exists(select 1 from public.document_attachments a where a.storage_path=name and a.status='pending'
      and a.submitted_by=auth.uid() and public.can_access_document_record(a.school_id,a.entity_type,a.record_id,true)));
drop policy if exists "uploaders remove pending metadata" on public.document_attachments;
create policy "authorised uploaders remove pending metadata" on public.document_attachments for delete to authenticated
  using(status='pending' and submitted_by=auth.uid() and public.can_access_document_record(school_id,entity_type,record_id,true));
update storage.buckets set public=false where id='school-documents';
