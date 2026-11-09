-- Files stay private. Metadata is independent of replaceable workspace caches.
create table public.document_attachments (
  id uuid primary key,
  school_id uuid not null references public.schools(id),
  entity_type text not null check (entity_type in ('visitor','incident','sick-notice')),
  record_id text not null check (length(record_id) between 1 and 100),
  category text not null,
  storage_path text not null unique,
  filename text not null check (length(filename) between 1 and 255),
  content_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  submitted_by uuid not null references auth.users(id),
  status text not null default 'pending' check (status in ('pending','ready')),
  created_at timestamptz not null default now(),
  check (category = case entity_type when 'visitor' then 'visitor-documents' when 'incident' then 'incident-evidence' else 'sick-notices' end),
  check (split_part(storage_path,'/',1) = school_id::text and split_part(storage_path,'/',2) = category and split_part(storage_path,'/',3) = record_id and split_part(storage_path,'/',4) like id::text || '.%' and array_length(string_to_array(storage_path,'/'),1) = 4)
);
create index document_attachments_record_idx on public.document_attachments(school_id,entity_type,record_id);

create or replace function public.can_access_document_record(p_school uuid,p_entity text,p_record text,p_write boolean default false)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare actor public.profiles%rowtype; item jsonb; workspace jsonb; learner jsonb;
begin
  select * into actor from public.profiles where id=auth.uid();
  if actor.id is null or actor.school_id <> p_school then return false; end if;
  select payload into workspace from public.school_workspaces where school_id=p_school;
  select value into item from jsonb_array_elements(coalesce(workspace->case p_entity when 'visitor' then 'visitors' when 'incident' then 'incidents' when 'sick-notice' then 'sickNotices' else 'invalid' end,'[]')) where value->>'id'=p_record;
  if item is null then return false; end if;
  if p_entity='visitor' then
    return case when p_write then actor.role in ('security','clerk') else actor.role in ('principal','deputy','security','clerk','sgb') end;
  elsif p_entity='incident' then
    if actor.role in ('principal','deputy','security') then return true; end if;
    if actor.role='sgb' then return not p_write; end if;
    if actor.role <> 'teacher' then return false; end if;
    select value into learner from jsonb_array_elements(coalesce(workspace->'learners','[]')) where value->>'id'=item->>'learnerId';
    return coalesce(item->>'reporter'=actor.display_name or item->>'staff'=actor.display_name or item->>'scope' in ('teachers','whole-school')
      or exists(select 1 from jsonb_array_elements(coalesce(workspace->'classes','[]')) c where c->>'teacher'=actor.display_name and c->>'id'=coalesce(learner->>'class',item->>'class')),false);
  elsif p_entity='sick-notice' then
    if actor.role in ('principal','deputy','clerk','teacher') then return true; end if;
    if actor.role='parent' then return coalesce(item->>'submittedById'=actor.id::text and exists(select 1 from public.parent_learner_links l where l.school_id=p_school and l.parent_id=actor.id and l.learner_ref=item->>'learnerId'),false); end if;
  end if;
  return false;
end;
$$;
revoke all on function public.can_access_document_record(uuid,text,text,boolean) from public;
grant execute on function public.can_access_document_record(uuid,text,text,boolean) to authenticated;

alter table public.document_attachments enable row level security;
grant select,insert,delete on public.document_attachments to authenticated;
create policy "authorised records read attachments" on public.document_attachments for select to authenticated
using (public.can_access_document_record(school_id,entity_type,record_id) and (status='ready' or submitted_by=auth.uid()));
create policy "authorised records stage attachments" on public.document_attachments for insert to authenticated
with check (submitted_by=auth.uid() and status='pending' and public.can_access_document_record(school_id,entity_type,record_id,true));
create policy "uploaders remove pending metadata" on public.document_attachments for delete to authenticated
using (submitted_by=auth.uid() and status='pending' and school_id=public.current_school_id());

create or replace function public.complete_document_attachment(p_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare item public.document_attachments%rowtype;
begin
  select * into item from public.document_attachments where id=p_id and submitted_by=auth.uid() for update;
  if item.id is null or not public.can_access_document_record(item.school_id,item.entity_type,item.record_id,true) then raise exception 'Attachment access denied'; end if;
  if not exists(select 1 from storage.objects where bucket_id='school-documents' and name=item.storage_path and owner_id=auth.uid()::text) then raise exception 'Uploaded file is missing'; end if;
  update public.document_attachments set status='ready' where id=p_id;
end;
$$;
revoke all on function public.complete_document_attachment(uuid) from public;
grant execute on function public.complete_document_attachment(uuid) to authenticated;

drop policy "school members read categorised documents" on storage.objects;
drop policy "school members upload categorised documents" on storage.objects;
drop policy "uploaders delete categorised documents" on storage.objects;
create policy "authorised attachment downloads" on storage.objects for select to authenticated
using (bucket_id='school-documents' and (
  exists(select 1 from public.document_attachments a where a.storage_path=name and a.status='ready' and public.can_access_document_record(a.school_id,a.entity_type,a.record_id))
  -- Preserve known older sick-notice uploads, including their original paths.
  or exists(select 1 from public.sick_notice_attachments a where a.storage_path=name and a.school_id=public.current_school_id()
    and split_part(name,'/',1)=a.school_id::text
    and (public.current_app_role() in ('principal','deputy','clerk','teacher') or a.submitted_by=auth.uid()))
));
create policy "authorised attachment uploads" on storage.objects for insert to authenticated
with check (bucket_id='school-documents' and owner_id=auth.uid()::text and exists(select 1 from public.document_attachments a where a.storage_path=name and a.status='pending' and a.submitted_by=auth.uid() and public.can_access_document_record(a.school_id,a.entity_type,a.record_id,true)));
create policy "uploaders clean pending files" on storage.objects for delete to authenticated
using (bucket_id='school-documents' and owner_id=auth.uid()::text and exists(select 1 from public.document_attachments a where a.storage_path=name and a.status='pending' and a.submitted_by=auth.uid() and a.school_id=public.current_school_id()));
update storage.buckets set public=false where id='school-documents';

-- Parent document submissions must have a durable record before upload.
create or replace function public.persist_parent_document_notice(p_record jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare actor public.profiles%rowtype; workspace jsonb; learner jsonb; item jsonb; notices jsonb; registers jsonb; register jsonb; entries jsonb; class_teacher text;
begin
  select * into actor from public.profiles where id=auth.uid();
  if actor.id is null or actor.role <> 'parent' then raise exception 'Parent sign-in required'; end if;
  select payload into workspace from public.school_workspaces where school_id=actor.school_id for update;
  select value into learner from jsonb_array_elements(coalesce(workspace->'learners','[]')) where value->>'id'=p_record->>'learnerId';
  if learner is null or not exists(select 1 from public.parent_learner_links where school_id=actor.school_id and parent_id=actor.id and learner_ref=learner->>'id') then raise exception 'Learner access denied'; end if;
  if coalesce(p_record->>'id','') !~ '^SN-[A-Za-z0-9-]+$' or length(p_record->>'id')>100 or coalesce(btrim(p_record->>'reason'),'')='' or length(p_record->>'reason')>2000 or p_record->>'date' is null or (p_record->>'date')::date > (now() at time zone 'Africa/Johannesburg')::date then raise exception 'Invalid sick notice'; end if;
  notices:=coalesce(workspace->'sickNotices','[]');
  select value into item from jsonb_array_elements(notices) where value->>'id'=p_record->>'id';
  if item is not null then
    if item->>'submittedById' is distinct from actor.id::text then raise exception 'Record access denied'; end if;
    return item;
  end if;
  item:=jsonb_build_object('id',p_record->>'id','learnerId',learner->>'id','person',learner->>'name','date',p_record->>'date','reason',p_record->>'reason','letter',p_record->>'letter','submittedBy',actor.display_name,'submittedById',actor.id,'status','Pending teacher review');
  select c->>'teacher' into class_teacher from jsonb_array_elements(coalesce(workspace->'classes','[]')) c where c->>'id'=learner->>'class';
  registers:=coalesce(workspace->'attendanceRegisters','[]');
  select value into register from jsonb_array_elements(registers) where value->>'class'=learner->>'class' and value->>'date'=p_record->>'date';
  select coalesce(jsonb_object_agg(l->>'id',coalesce(register->'entries'->>(l->>'id'),'Present')),'{}') into entries from jsonb_array_elements(coalesce(workspace->'learners','[]')) l where l->>'class'=learner->>'class';
  entries:=jsonb_set(entries,array[learner->>'id'],'"Sick"'::jsonb);
  register:=coalesce(register,'{}') || jsonb_build_object('class',learner->>'class','date',p_record->>'date','teacher',class_teacher,'entries',entries,'source','Parent sick notice','capturedOn',to_char(now() at time zone 'Africa/Johannesburg','DD Mon YYYY'),'pendingSickNoticeIds',coalesce(register->'pendingSickNoticeIds','[]')||jsonb_build_array(item->>'id'));
  select coalesce(jsonb_agg(value),'[]') into registers from jsonb_array_elements(registers) where value->>'class' is distinct from learner->>'class' or value->>'date' is distinct from p_record->>'date';
  workspace:=jsonb_set(workspace,'{attendanceRegisters}',jsonb_build_array(register)||registers);
  workspace:=jsonb_set(workspace,'{notifications}',jsonb_build_array(jsonb_build_object('id','NTF-SICK-'||(item->>'id'),'category','Sick notice','priority','High','createdAt',now(),'title','Sick notice requires attention','description',(learner->>'name')||' was reported sick by '||actor.display_name||' for '||(p_record->>'date')||'. Attendance has been marked sick pending your review.','scope','teacher','recipient',class_teacher,'sickNoticeId',item->>'id','read',false))||coalesce(workspace->'notifications','[]'));
  update public.school_workspaces set payload=jsonb_set(workspace,'{sickNotices}',jsonb_build_array(item)||notices),updated_by=actor.id where school_id=actor.school_id;
  return item;
end;
$$;
revoke all on function public.persist_parent_document_notice(jsonb) from public;
grant execute on function public.persist_parent_document_notice(jsonb) to authenticated;
