-- Preserve the pilot workspace before replacing browser-owned identities with
-- school-owned UUIDs. Legacy refs remain aliases, never account relationships.
create table public.school_dataset_backups (
 school_id uuid primary key references public.schools(id), payload jsonb not null,
 archived_at timestamptz not null default now()
);
insert into public.school_dataset_backups(school_id,payload) select school_id,payload from public.school_workspaces;
alter table public.school_dataset_backups enable row level security;
revoke all on public.school_dataset_backups from anon,authenticated;

create table public.school_staff (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id),
 legacy_ref text not null, profile_id uuid, name text not null, record jsonb not null default '{}',
 unique(school_id,id), unique(school_id,legacy_ref), unique(school_id,profile_id),
 foreign key(school_id,profile_id) references public.profiles(school_id,id) on delete set null (profile_id)
);
create table public.school_grades (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id),
 name text not null, unique(school_id,name), unique(school_id,id)
);
alter table public.teacher_review_classes add column grade_id uuid;
alter table public.teacher_review_classes add column teacher_staff_id uuid;
alter table public.teacher_review_classes add column record jsonb not null default '{}';
alter table public.teacher_review_classes add foreign key(school_id,grade_id) references public.school_grades(school_id,id);
alter table public.teacher_review_classes add foreign key(school_id,teacher_staff_id) references public.school_staff(school_id,id);
create table public.school_learners (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id),
 legacy_ref text not null, class_id uuid, name text not null, record jsonb not null default '{}',
 unique(school_id,id), unique(school_id,legacy_ref),
 foreign key(school_id,class_id) references public.teacher_review_classes(school_id,id)
);
create table public.school_guardians (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id),
 profile_id uuid, name text not null, phone text, unique(school_id,id), unique(school_id,profile_id),
 foreign key(school_id,profile_id) references public.profiles(school_id,id) on delete set null (profile_id)
);
create table public.school_learner_guardians (
 school_id uuid not null, learner_id uuid not null, guardian_id uuid not null, relation text,
 primary key(school_id,learner_id,guardian_id),
 foreign key(school_id,learner_id) references public.school_learners(school_id,id),
 foreign key(school_id,guardian_id) references public.school_guardians(school_id,id)
);
create table public.school_entity_aliases (
 school_id uuid not null references public.schools(id), kind text not null, legacy_ref text not null,
 entity_id uuid not null default gen_random_uuid(), primary key(school_id,kind,legacy_ref),
 check(length(btrim(legacy_ref))>0)
);
create table public.school_identity_issues (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id),
 kind text not null, legacy_ref text not null, reason text not null,
 unique(school_id,kind,legacy_ref)
);
create table public.school_security_officers (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id),
 legacy_ref text not null, staff_id uuid not null, record jsonb not null default '{}',
 unique(school_id,legacy_ref), unique(school_id,staff_id),
 foreign key(school_id,staff_id) references public.school_staff(school_id,id)
);

create function public.school_alias(p_school uuid,p_kind text,p_ref text) returns uuid
language plpgsql security definer set search_path=public as $$
declare result uuid;
begin
 if nullif(p_ref,'') is null then raise exception 'Record ID is required'; end if;
 insert into school_entity_aliases(school_id,kind,legacy_ref) values(p_school,p_kind,p_ref) on conflict do nothing;
 select entity_id into result from school_entity_aliases where school_id=p_school and kind=p_kind and legacy_ref=p_ref;
 return result;
end $$;

create function public.school_reconcile_legacy_rows(p_school uuid,p_kind text,p_rows jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare result jsonb:='[]'; r jsonb; ref text; original_ref text;
begin
 for r in select value from jsonb_array_elements(coalesce(p_rows,'[]')) loop
  if exists(select 1 from jsonb_array_elements(result) prior where prior=r) then continue; end if;
  original_ref:=nullif(r->>'id','');
  ref:=coalesce(original_ref,'legacy-missing:'||md5(r::text));
  if exists(select 1 from jsonb_array_elements(result) prior where prior->>'id'=ref) then
   ref:=ref||':legacy:'||md5(r::text);
   insert into school_identity_issues(school_id,kind,legacy_ref,reason)
    values(p_school,p_kind,ref,'Conflicting records shared a legacy ID; both preserved. Original reference: '||original_ref) on conflict do nothing;
   r:=r || jsonb_build_object('legacyOriginalId',original_ref);
  end if;
  r:=r || jsonb_build_object('id',ref);
  if not exists(select 1 from jsonb_array_elements(result) prior where prior->>'id'=ref) then result:=result || jsonb_build_array(r); end if;
 end loop;
 return result;
end $$;
revoke all on function public.school_reconcile_legacy_rows(uuid,text,jsonb) from public,anon,authenticated;

-- Import once. Names are used ONLY to reconcile pre-migration legacy records,
-- and only when unique. Runtime links below use UUIDs exclusively.
do $$
declare w record; r jsonb; pid uuid; sid uuid; cid uuid; gid uuid; guard uuid; candidates integer;
begin
 for w in select school_id,payload from school_workspaces loop
  w.payload:=jsonb_set(w.payload,'{staff}',school_reconcile_legacy_rows(w.school_id,'staff',w.payload->'staff'));
  w.payload:=jsonb_set(w.payload,'{security}',school_reconcile_legacy_rows(w.school_id,'security',w.payload->'security'));
  w.payload:=jsonb_set(w.payload,'{classes}',school_reconcile_legacy_rows(w.school_id,'class',w.payload->'classes'));
  w.payload:=jsonb_set(w.payload,'{learners}',school_reconcile_legacy_rows(w.school_id,'learner',w.payload->'learners'));
  for r in select value from jsonb_array_elements(coalesce(w.payload->'staff','[]')) loop
   select id into pid from profiles where school_id=w.school_id and id::text=coalesce(r->>'userId',r->>'profileId',r->>'id') and role not in ('parent','sgb');
   if pid is null then
    select count(*),(array_agg(id))[1] into candidates,pid from profiles
    where school_id=w.school_id and role not in ('parent','sgb') and display_name=r->>'name'
     and (r->>'role'<>'Teacher' or role='teacher');
    if candidates<>1 then pid:=null; end if;
   end if;
   if exists(select 1 from school_staff where school_id=w.school_id and profile_id=pid) then pid:=null; end if;
   sid:=school_alias(w.school_id,'staff',r->>'id');
   insert into school_staff(id,school_id,legacy_ref,profile_id,name,record)
    values(sid,w.school_id,r->>'id',pid,coalesce(r->>'name','Unnamed staff'),r);
  end loop;
  for r in select value from jsonb_array_elements(coalesce(w.payload->'security','[]')) loop
   select count(*),(array_agg(s.id))[1] into candidates,sid from school_staff s left join profiles p on p.id=s.profile_id where s.school_id=w.school_id and s.name=r->>'name' and (s.record->>'role' in ('Security Officer','security') or p.role='security');
   if candidates<>1 or exists(select 1 from school_security_officers where school_id=w.school_id and staff_id=sid) then
    sid:=school_alias(w.school_id,'staff','security:'||(r->>'id'));
    select count(*),(array_agg(id))[1] into candidates,pid from profiles where school_id=w.school_id and role='security' and (id::text=coalesce(r->>'userId',r->>'profileId') or display_name=r->>'name');
    if candidates<>1 or exists(select 1 from school_staff where school_id=w.school_id and profile_id=pid) then pid:=null; end if;
    insert into school_staff(id,school_id,legacy_ref,profile_id,name,record) values(sid,w.school_id,'security:'||(r->>'id'),pid,coalesce(r->>'name','Security officer'),r || '{"role":"Security Officer"}');
   end if;
   insert into school_security_officers(school_id,legacy_ref,staff_id,record) values(w.school_id,r->>'id',sid,r);
  end loop;
  -- Every account represents an account, not a second employment record.
  for r in select to_jsonb(p) from profiles p where school_id=w.school_id and role not in ('parent','sgb') loop
   if not exists(select 1 from school_staff where school_id=w.school_id and profile_id=(r->>'id')::uuid) then
    sid:=school_alias(w.school_id,'staff',r->>'id');
    insert into school_staff(id,school_id,legacy_ref,profile_id,name,record)
     values(sid,w.school_id,r->>'id',(r->>'id')::uuid,r->>'display_name',jsonb_build_object('id',r->>'id','name',r->>'display_name','role',case when r->>'role'='teacher' then 'Teacher' else r->>'role' end));
   end if;
  end loop;
  insert into school_security_officers(school_id,legacy_ref,staff_id,record)
   select s.school_id,s.legacy_ref,s.id,jsonb_build_object('id',s.legacy_ref,'name',s.name)
    from school_staff s join profiles p on p.id=s.profile_id and p.school_id=s.school_id
    where s.school_id=w.school_id and p.role='security' on conflict do nothing;
  for r in select value from jsonb_array_elements(coalesce(w.payload->'classes','[]')) loop
   insert into school_grades(school_id,name) values(w.school_id,coalesce(r->>'grade','Unspecified')) on conflict do nothing;
   select id into gid from school_grades where school_id=w.school_id and name=coalesce(r->>'grade','Unspecified');
   select count(*),(array_agg(id))[1] into candidates,sid from school_staff where school_id=w.school_id and name=r->>'teacher';
   if candidates<>1 then sid:=null; end if;
   insert into teacher_review_classes(school_id,class_ref,grade,grade_id,teacher_staff_id,record)
    values(w.school_id,r->>'id',coalesce(r->>'grade','Unspecified'),gid,sid,r)
    on conflict(school_id,class_ref) do update set grade_id=excluded.grade_id,teacher_staff_id=excluded.teacher_staff_id,record=excluded.record;
   if sid is null and nullif(r->>'teacher','') is not null then
    insert into school_identity_issues(school_id,kind,legacy_ref,reason) values(w.school_id,'class',r->>'id','Legacy teacher name has no unique staff match; explicit assignment required') on conflict do nothing;
   end if;
  end loop;
  for r in select value from jsonb_array_elements(coalesce(w.payload->'learners','[]')) loop
   select id into cid from teacher_review_classes where school_id=w.school_id and class_ref=r->>'class';
   sid:=school_alias(w.school_id,'learner',r->>'id');
   insert into school_learners(id,school_id,legacy_ref,class_id,name,record) values(sid,w.school_id,r->>'id',cid,coalesce(r->>'name','Unnamed learner'),r);
   guard:=null;
   -- Explicit existing account links take precedence over any display name.
   select parent_id into pid from parent_learner_links where school_id=w.school_id and learner_ref=r->>'id' order by parent_id limit 1;
   if pid is not null then
    insert into school_guardians(school_id,profile_id,name,phone) select w.school_id,pid,display_name,r->>'phone' from profiles where id=pid
     on conflict(school_id,profile_id) do update set profile_id=excluded.profile_id returning id into guard;
   elsif nullif(btrim(r->>'parent'),'') is not null then
    -- Only consolidate legacy guardians with the same nonempty phone AND name.
    select id into guard from school_guardians where school_id=w.school_id and profile_id is null and name=r->>'parent' and nullif(phone,'')=nullif(r->>'phone','') limit 1;
    if guard is null then insert into school_guardians(school_id,name,phone) values(w.school_id,r->>'parent',r->>'phone') returning id into guard; end if;
   end if;
   if guard is not null then insert into school_learner_guardians values(w.school_id,sid,guard,r->>'relation'); end if;
  end loop;
  -- Preserve every explicit family link, including multiple guardians.
  insert into school_guardians(school_id,profile_id,name)
   select distinct p.school_id,p.id,p.display_name from profiles p join parent_learner_links l on l.parent_id=p.id and l.school_id=p.school_id
   where p.school_id=w.school_id on conflict(school_id,profile_id) do nothing;
  insert into school_learner_guardians(school_id,learner_id,guardian_id)
   select l.school_id,l.id,g.id from parent_learner_links x join school_learners l on l.school_id=x.school_id and l.legacy_ref=x.learner_ref
    join school_guardians g on g.school_id=x.school_id and g.profile_id=x.parent_id where x.school_id=w.school_id on conflict do nothing;
 end loop;
end $$;

-- Preserve the existing phase subject choices as a one-time catalogue import.
-- They are choices, never assessment results or teaching assignments.
insert into teacher_review_subjects(school_id,name)
 select distinct c.school_id,s from teacher_review_classes c cross join lateral unnest(case
  when substring(c.grade from '[0-9]+')::integer between 1 and 9 then array['Mathematics','Natural Sciences','English','Sesotho','Social Sciences','Technology','Life Orientation']
  when substring(c.grade from '[0-9]+')::integer between 10 and 12 then array['Mathematics','Physics','Life Sciences','Sesotho','English','Life Orientation','Computer Applications Technology','History'] else '{}'::text[] end) s on conflict do nothing;
insert into teacher_class_subjects(school_id,class_id,subject_id,source)
 select c.school_id,c.id,s.id,'Migrated legacy subject choices' from teacher_review_classes c join teacher_review_subjects s on s.school_id=c.school_id
 where s.name=any(case when substring(c.grade from '[0-9]+')::integer between 1 and 9 then array['Mathematics','Natural Sciences','English','Sesotho','Social Sciences','Technology','Life Orientation']
  when substring(c.grade from '[0-9]+')::integer between 10 and 12 then array['Mathematics','Physics','Life Sciences','Sesotho','English','Life Orientation','Computer Applications Technology','History'] else '{}'::text[] end) on conflict do nothing;

create function public.school_core_payload(p_school uuid,p_payload jsonb) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare result jsonb:=p_payload; k text; r jsonb; rows jsonb; label text;
begin
 result:=jsonb_set(result,'{staff}',coalesce((select jsonb_agg(record || jsonb_build_object('id',legacy_ref,'entityId',id,'school_id',school_id,'profileId',profile_id,'userId',profile_id,'name',name) order by legacy_ref) from school_staff where school_id=p_school),'[]'));
 result:=jsonb_set(result,'{classes}',coalesce((select jsonb_agg(c.record || jsonb_build_object('id',c.class_ref,'entityId',c.id,'school_id',c.school_id,'grade',c.grade,'gradeId',c.grade_id,'teacherStaffId',c.teacher_staff_id,'teacherProfileId',s.profile_id,'subjects',coalesce((select jsonb_agg(su.name order by su.name) from teacher_class_subjects cs join teacher_review_subjects su on su.id=cs.subject_id where cs.school_id=p_school and cs.class_id=c.id),'[]'),'teacherProfileIds',coalesce((select jsonb_agg(distinct t.teacher_id) from teacher_teaching_contexts t where t.school_id=p_school and t.class_id=c.id and t.status='Active' and t.start_date<=current_date and (t.end_date is null or t.end_date>=current_date)),'[]'),'teacher',coalesce(s.name,'Unassigned')) order by c.class_ref) from teacher_review_classes c left join school_staff s on s.id=c.teacher_staff_id and s.school_id=c.school_id where c.school_id=p_school),'[]'));
 result:=jsonb_set(result,'{learners}',coalesce((select jsonb_agg(l.record || jsonb_build_object('id',l.legacy_ref,'entityId',l.id,'school_id',l.school_id,'name',l.name,'class',c.class_ref,'classId',l.class_id,'grade',c.grade,'parentId',g.id,'parentProfileId',g.profile_id,'parent',coalesce(g.name,l.record->>'parent'),'phone',coalesce(g.phone,l.record->>'phone'),'guardianIds',coalesce((select jsonb_agg(guardian_id) from school_learner_guardians where school_id=p_school and learner_id=l.id),'[]'),'parentProfileIds',coalesce((select jsonb_agg(g2.profile_id) from school_learner_guardians x join school_guardians g2 on g2.id=x.guardian_id where x.school_id=p_school and x.learner_id=l.id and g2.profile_id is not null),'[]')) order by l.legacy_ref)
 from school_learners l left join teacher_review_classes c on c.id=l.class_id and c.school_id=l.school_id
 left join lateral(select g.* from school_learner_guardians x join school_guardians g on g.id=x.guardian_id and g.school_id=x.school_id where x.school_id=l.school_id and x.learner_id=l.id order by g.profile_id nulls last,g.id limit 1) g on true where l.school_id=p_school),'[]'));
 result:=jsonb_set(result,'{subjects}',coalesce((select jsonb_agg(jsonb_build_object('id',id,'school_id',school_id,'name',name) order by name) from teacher_review_subjects where school_id=p_school),'[]'));
 result:=jsonb_set(result,'{grades}',coalesce((select jsonb_agg(to_jsonb(g) order by name) from school_grades g where school_id=p_school),'[]'));
 result:=jsonb_set(result,'{security}',coalesce((select jsonb_agg(o.record || jsonb_build_object('id',o.legacy_ref,'entityId',o.id,'school_id',o.school_id,'staffId',o.staff_id,'userId',s.profile_id,'name',s.name) order by o.legacy_ref) from school_security_officers o join school_staff s on s.id=o.staff_id where o.school_id=p_school),'[]'));
 -- Legacy display labels are derived from their UUID references, so a subject
 -- or class rename does not split the marks/history into another logical entity.
 foreach k in array array['assessments','reports','attendanceRegisters','attendanceWeeks','teacherAssignments'] loop
  if jsonb_typeof(result->k)<>'array' then continue; end if;
  rows:='[]';
  for r in select value from jsonb_array_elements(result->k) loop
   if nullif(r->>'subjectId','') is not null then
    select name into label from teacher_review_subjects where school_id=p_school and id::text=r->>'subjectId';
    if label is not null then r:=r || jsonb_build_object('subject',label); end if;
   end if;
   if nullif(r->>'classId','') is not null then
    select class_ref into label from teacher_review_classes where school_id=p_school and id::text=r->>'classId';
    if label is not null then r:=r || jsonb_build_object('class',label); end if;
   end if;
   rows:=rows || jsonb_build_array(r);
  end loop;
  result:=jsonb_set(result,array[k],rows);
 end loop;
 return result;
end $$;

-- Catalogue synchronization now projects normalized rows; it must never
-- recreate subject/class/staff defaults or import display-name links at login.
create or replace function public.sync_teacher_review_catalogue_base() returns void
language plpgsql security definer set search_path=public as $$
begin
 if not can_manage_teacher_performance(current_school_id()) then raise exception 'Assignment management access denied'; end if;
end $$;
create or replace function public.sync_teacher_review_catalogue() returns void
language plpgsql security definer set search_path=public as $$
declare tenant uuid:=current_school_id();
begin
 if not can_manage_teacher_performance(tenant) then raise exception 'Assignment management access denied'; end if;
 update school_workspaces set payload=school_core_payload(school_id,payload)
  where school_id=tenant and payload is distinct from school_core_payload(school_id,payload);
end $$;

-- A protected compatibility projection keeps existing reports/attachments and
-- service-role integrations working. They cannot replace core identities.
create function public.protect_school_core() returns trigger
language plpgsql security definer set search_path=public as $$
declare k text; r jsonb; rows jsonb;
begin
 for k in select jsonb_object_keys(new.payload) loop
  if k in ('staff','classes','learners','security','subjects','grades') or jsonb_typeof(new.payload->k)<>'array' then continue; end if;
  rows:='[]';
  for r in select value from jsonb_array_elements(new.payload->k) loop
   if jsonb_typeof(r)='object' and nullif(r->>'id','') is not null then
    r:=r || jsonb_build_object('school_id',new.school_id,'entityId',school_alias(new.school_id,k,r->>'id'));
   end if;
   rows:=rows || jsonb_build_array(r);
  end loop;
  new.payload:=jsonb_set(new.payload,array[k],rows);
 end loop;
 new.payload:=school_core_payload(new.school_id,new.payload);
 return new;
end $$;
create trigger protect_school_core before update on public.school_workspaces for each row execute function public.protect_school_core();
update public.school_workspaces set payload=school_core_payload(school_id,payload);

-- Register legacy operational records once; their old display refs stay valid
-- for document metadata and historical links. UUIDs are tenant-specific.
do $$ declare w record; k text; r jsonb; rows jsonb; data jsonb; ref text; cid uuid; sub uuid; pid uuid; n integer; label text; begin
 for w in select school_id,payload from school_workspaces loop
  data:=w.payload;
  for k in select jsonb_object_keys(data) loop
   if k in ('staff','classes','learners','security','subjects','grades','teacherAssignments') or jsonb_typeof(data->k)<>'array' then continue; end if;
   rows:='[]';
   for r in select value from jsonb_array_elements(school_reconcile_legacy_rows(w.school_id,k,data->k)) loop
    if jsonb_typeof(r)='object' then
     ref:=coalesce(nullif(r->>'id',''),gen_random_uuid()::text);
     r:=r || jsonb_build_object('id',ref,'entityId',school_alias(w.school_id,k,ref),'school_id',w.school_id);
     if k in ('teacherChat','sgbPrincipalChat') then
      label:=case when k='teacherChat' then coalesce(r->>'legacyTeacher',r->>'id') else r->>'sgbMember' end;
      select count(*),(array_agg(id))[1] into n,pid from profiles where school_id=w.school_id and display_name=label and role=case when k='teacherChat' then 'teacher'::app_role else 'sgb'::app_role end;
      if n=1 then r:=r || jsonb_build_object(case when k='teacherChat' then 'teacherId' else 'sgbMemberId' end,pid); end if;
     end if;
     foreach label in array array['reporter','recipient','author'] loop
      if nullif(r->>label,'') is null then continue; end if;
      select count(*),(array_agg(id))[1] into n,pid from profiles where school_id=w.school_id and display_name=r->>label;
      if n=1 then r:=r || jsonb_build_object(label||'Id',pid); end if;
     end loop;
     if k='sickNotices' and r->>'learnerId' is null then
      select count(*),(array_agg(legacy_ref))[1] into n,label from school_learners where school_id=w.school_id and name=r->>'person';
      if n=1 then r:=r || jsonb_build_object('learnerId',label); end if;
     end if;
     if nullif(r->>'class','') is not null then
      select id into cid from teacher_review_classes where school_id=w.school_id and class_ref=r->>'class';
      r:=r || jsonb_build_object('classId',cid);
     end if;
     if nullif(r->>'subject','') is not null then
      insert into teacher_review_subjects(school_id,name) values(w.school_id,r->>'subject') on conflict do nothing;
      select id into sub from teacher_review_subjects where school_id=w.school_id and name=r->>'subject';
      r:=r || jsonb_build_object('subjectId',sub);
     end if;
    end if;
    rows:=rows || jsonb_build_array(r);
   end loop;
   data:=jsonb_set(data,array[k],rows);
  end loop;
  update school_workspaces set payload=data where school_id=w.school_id;
 end loop;
end $$;

create function public.school_dataset_announcement_visible(p_item jsonb,p_actor uuid) returns boolean
language plpgsql stable security definer set search_path=public as $$
declare actor profiles%rowtype; audience text:=p_item->>'audienceId';
begin
 select * into actor from profiles where id=p_actor;
 if actor.id is null then return false; end if;
 if actor.role in ('principal','deputy') or p_item->>'authorId'=actor.id::text then return true; end if;
 if audience is null then
  return coalesce(p_item->>'audience','') ~* 'whole.school|school.community'
   or (actor.role='teacher' and coalesce(p_item->>'audience','') ~* 'teacher')
   or (actor.role='security' and coalesce(p_item->>'audience','') ~* 'security')
   or (actor.role='sgb' and coalesce(p_item->>'audience','') ~* 'sgb');
 end if;
 return audience='whole-school' or (audience='all-staff' and actor.role in ('principal','deputy','teacher','clerk','security'))
  or (audience='teachers' and actor.role='teacher') or (audience='administration' and actor.role='clerk') or audience=actor.role::text;
end $$;
revoke all on function public.school_dataset_announcement_visible(jsonb,uuid) from public,anon,authenticated;

create function public.read_school_dataset() returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare actor profiles%rowtype; result jsonb; data jsonb; class_refs jsonb; learner_refs jsonb; k text;
begin
 select * into actor from profiles where id=auth.uid();
 if actor.id is null or actor.school_id is null or actor.role='parent' then raise exception 'School dataset access denied'; end if;
 select jsonb_build_object('payload',school_core_payload(school_id,payload),'version',version) into result from school_workspaces where school_id=actor.school_id;
 if result is null then raise exception 'School dataset has not been initialized by an administrator'; end if;
 data:=result->'payload';
 if actor.role='teacher' then
  select coalesce(jsonb_agg(value->'id'),'[]') into class_refs from jsonb_array_elements(data->'classes') where value->>'teacherProfileId'=actor.id::text or coalesce(value->'teacherProfileIds','[]') ? actor.id::text;
  foreach k in array array['classes','learners','assessments','reports','attendanceRegisters','attendanceWeeks'] loop
   data:=jsonb_set(data,array[k],coalesce((select jsonb_agg(value) from jsonb_array_elements(coalesce(data->k,'[]')) where class_refs ? (case when k='classes' then value->>'id' else value->>'class' end)),'[]'));
  end loop;
  foreach k in array array['visitors','security','securityAttendance','staffChangeRequests','teacherAssignments','sgbPrincipalChat'] loop data:=jsonb_set(data,array[k],'[]'); end loop;
  data:=jsonb_set(data,'{staff}',coalesce((select jsonb_agg(value) from jsonb_array_elements(data->'staff') where value->>'profileId'=actor.id::text),'[]'));
  select coalesce(jsonb_agg(value->'id'),'[]') into learner_refs from jsonb_array_elements(data->'learners');
  data:=jsonb_set(data,'{incidents}',coalesce((select jsonb_agg(value) from jsonb_array_elements(coalesce(data->'incidents','[]')) where value->>'scope' in ('whole-school','teachers') or value->>'reporterId'=actor.id::text or learner_refs ? (value->>'learnerId') or class_refs ? (value->>'class')),'[]'));
  foreach k in array array['parentChat','sickNotices'] loop
   data:=jsonb_set(data,array[k],coalesce((select jsonb_agg(value) from jsonb_array_elements(coalesce(data->k,'[]')) where learner_refs ? (value->>'learnerId')),'[]'));
  end loop;
  data:=jsonb_set(data,'{teacherChat}',coalesce((select jsonb_agg(value) from jsonb_array_elements(coalesce(data->'teacherChat','[]')) where value->>'teacherId'=actor.id::text),'[]'));
  data:=jsonb_set(data,'{appointments}',coalesce((select jsonb_agg(value) from jsonb_array_elements(coalesce(data->'appointments','[]')) where value->>'createdBy'=actor.id::text or value->>'requestedById'=actor.id::text),'[]'));
 elsif actor.role in ('security','sgb') then
  foreach k in array array['classes','learners','assessments','reports','staff','staffChangeRequests','teacherAssignments','teacherChat','parentChat','attendanceRegisters','attendanceWeeks','sickNotices','appointments','reportRequests'] loop data:=jsonb_set(data,array[k],'[]'); end loop;
  if actor.role='sgb' then data:=jsonb_set(data,'{security}','[]');data:=jsonb_set(data,'{securityAttendance}','[]'); end if;
  if actor.role='sgb' then data:=jsonb_set(data,'{sgbPrincipalChat}',coalesce((select jsonb_agg(value) from jsonb_array_elements(coalesce(data->'sgbPrincipalChat','[]')) where value->>'sgbMemberId'=actor.id::text),'[]')); end if;
 elsif actor.role='clerk' then
  foreach k in array array['security','securityAttendance','teacherChat','sgbPrincipalChat','parentChat'] loop data:=jsonb_set(data,array[k],'[]'); end loop;
 end if;
 if actor.role not in ('principal','deputy') then
  data:=jsonb_set(data,'{announcements}',coalesce((select jsonb_agg(value) from jsonb_array_elements(coalesce(data->'announcements','[]')) where school_dataset_announcement_visible(value,actor.id)),'[]'));
  data:=jsonb_set(data,'{notifications}',coalesce((select jsonb_agg(n) from jsonb_array_elements(coalesce(data->'notifications','[]')) n where
   (nullif(n->>'recipientId','') is null or n->>'recipientId'=actor.id::text)
   and (nullif(n->>'recipient','') is null or n->>'recipientId'=actor.id::text)
   and (actor.role<>'teacher' or (n->>'class' is null and n->>'learnerId' is null) or class_refs ? (n->>'class') or learner_refs ? (n->>'learnerId'))
   and (n->>'announcementId' is null or exists(select 1 from jsonb_array_elements(data->'announcements') a where a->>'id'=n->>'announcementId'))
   and (n->>'incidentId' is null or exists(select 1 from jsonb_array_elements(coalesce(data->'incidents','[]')) i where i->>'id'=n->>'incidentId'))
   and (n->>'recipientId'=actor.id::text or n->>'scope'='whole-school' or n->>'scope'=actor.role::text
    or (actor.role='teacher' and n->>'scope' in ('teachers','parents','parent','learner','system') and (class_refs ? (n->>'class') or learner_refs ? (n->>'learnerId') or n->>'incidentId' is not null))
    or (actor.role in ('security','clerk') and coalesce(n->>'scope','system')='system' and n->>'learnerId' is null and n->>'class' is null)
    or (actor.role='clerk' and n->>'scope'='leadership'))),'[]'));
 end if;
 result:=jsonb_set(result,'{payload}',data);
 return result;
end $$;

-- Row-level deltas against the confirmed snapshot: caches never initialize or
-- replace a school's workspace. Concurrent unrelated records are preserved.
create function public.save_school_dataset(p_before jsonb,p_after jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare actor profiles%rowtype; current_payload jsonb; merged jsonb; k text; a jsonb; b jsonb; existing jsonb; rows jsonb; ref text; sid uuid; pid uuid; cid uuid; gid uuid; guard uuid;
begin
 select * into actor from profiles where id=auth.uid();
 if actor.id is null or actor.role='parent' then raise exception 'School dataset access denied'; end if;
 select payload into current_payload from school_workspaces where school_id=actor.school_id for update;
 if current_payload is null then raise exception 'School dataset has not been initialized'; end if;
 merged:=current_payload;
 for k in select jsonb_object_keys(p_after) loop
  if k in ('__v','subjects','grades') or p_before->k is not distinct from p_after->k then continue; end if;
  if jsonb_typeof(p_after->k)<>'array' then raise exception 'Invalid collection'; end if;
  if actor.role='sgb' and k not in ('sgbPrincipalChat','notifications') then raise exception 'Collection edit denied'; end if;
  if actor.role='security' and k not in ('security','visitors','incidents','notifications') then raise exception 'Collection edit denied'; end if;
  if actor.role='teacher' and k not in ('assessments','reports','incidents','notifications','teacherChat','parentChat','attendanceRegisters','attendanceWeeks','chatExtras','reportRequests') then raise exception 'Collection edit denied'; end if;
  if actor.role='clerk' and k not in ('classes','learners','staffChangeRequests','teacherAssignments','assessments','reports','announcements','notifications','sickNotices','appointments','chatExtras','reportRequests') then raise exception 'Collection edit denied'; end if;
  if k in ('staff','classes','learners') and actor.role not in ('principal','deputy','clerk') then raise exception 'Core record edit denied'; end if;
  if k='staff' and actor.role='clerk' then raise exception 'Staff changes require leadership approval'; end if;
  rows:=coalesce(merged->k,'[]');
  for ref in select distinct value->>'id' from jsonb_array_elements(coalesce(p_before->k,'[]') || (p_after->k)) loop
   if ref is null then raise exception 'Stable record ID is required'; end if;
   select value into a from jsonb_array_elements(p_after->k) where value->>'id'=ref;
   select value into b from jsonb_array_elements(coalesce(p_before->k,'[]')) where value->>'id'=ref;
   if a is not distinct from b then continue; end if;
   if actor.role='teacher' and k='teacherChat' and (a is null or a->>'teacherId' is distinct from actor.id::text) then raise exception 'Teacher thread edit denied'; end if;
   if actor.role='sgb' and k='sgbPrincipalChat' and (a is null or a->>'sgbMemberId' is distinct from actor.id::text) then raise exception 'SGB thread edit denied'; end if;
   -- A role cannot edit a record hidden from its authoritative projection.
   if actor.role in ('teacher','clerk','security','sgb') and b is not null and not exists(
    select 1 from jsonb_array_elements(coalesce(read_school_dataset()->'payload'->k,'[]')) x where x->>'id'=ref
   ) then raise exception 'Record edit denied'; end if;
   if actor.role='teacher' and a is not null and k in ('assessments','reports','attendanceRegisters','attendanceWeeks') and not exists(
    select 1 from jsonb_array_elements(read_school_dataset()->'payload'->'classes') c where c->>'id'=a->>'class'
   ) then raise exception 'Class edit denied'; end if;
   select value into existing from jsonb_array_elements(rows) where value->>'id'=ref;
   if (existing - array['createdBy','subjectId','entityId','school_id','profileId','userId','classId','gradeId','parentId','parentProfileId','parentProfileIds','guardianIds','teacherProfileId','teacherProfileIds','staffId']) is distinct from
      (b - array['createdBy','subjectId','entityId','school_id','profileId','userId','classId','gradeId','parentId','parentProfileId','parentProfileIds','guardianIds','teacherProfileId','teacherProfileIds','staffId']) then raise exception 'This record changed in another session. Refresh before retrying.' using errcode='40001'; end if;
   if a is null and k in ('staff','classes','learners') then raise exception 'Core record removal requires an archival migration'; end if;
   if a is not null and k='staff' then
    sid:=school_alias(actor.school_id,'staff',ref);
    select profile_id into pid from school_staff where school_id=actor.school_id and legacy_ref=ref;
    if nullif(a->>'profileId','') is not null and (a->>'profileId')::uuid is distinct from pid then raise exception 'Account links require explicit administrator reconciliation'; end if;
    insert into school_staff(id,school_id,legacy_ref,name,record) values(sid,actor.school_id,ref,a->>'name',a)
     on conflict(school_id,legacy_ref) do update set name=excluded.name,record=excluded.record;
    if pid is not null then update profiles set display_name=a->>'name' where id=pid and school_id=actor.school_id and display_name is distinct from a->>'name'; end if;
   elsif a is not null and k='classes' then
    sid:=nullif(a->>'teacherStaffId','')::uuid;
    if sid is not null and not exists(select 1 from school_staff where school_id=actor.school_id and id=sid) then raise exception 'Teacher is not in this school'; end if;
    if sid is not null and not exists(select 1 from school_staff s left join profiles p on p.id=s.profile_id where s.school_id=actor.school_id and s.id=sid and ((s.profile_id is null and s.record->>'role'='Teacher') or p.role='teacher')) then raise exception 'Selected staff member is not a teacher'; end if;
    if actor.role='clerk' and sid is distinct from nullif(b->>'teacherStaffId','')::uuid then raise exception 'Teacher assignment requires leadership approval'; end if;
    insert into school_grades(school_id,name) values(actor.school_id,a->>'grade') on conflict do nothing;
    select id into gid from school_grades where school_id=actor.school_id and name=a->>'grade';
    insert into teacher_review_classes(school_id,class_ref,grade,grade_id,teacher_staff_id,record) values(actor.school_id,ref,a->>'grade',gid,sid,a)
     on conflict(school_id,class_ref) do update set grade=excluded.grade,grade_id=excluded.grade_id,teacher_staff_id=excluded.teacher_staff_id,record=excluded.record;
   elsif a is not null and k='learners' then
    sid:=school_alias(actor.school_id,'learner',ref);
    select id into cid from teacher_review_classes where school_id=actor.school_id and class_ref=a->>'class';
    if cid is null then raise exception 'Learner class does not exist in this school'; end if;
    insert into school_learners(id,school_id,legacy_ref,class_id,name,record) values(sid,actor.school_id,ref,cid,a->>'name',a)
     on conflict(school_id,legacy_ref) do update set class_id=excluded.class_id,name=excluded.name,record=excluded.record;
    guard:=nullif(a->>'parentId','')::uuid;
    if guard is not null then
     if not exists(select 1 from school_guardians where school_id=actor.school_id and id=guard) then raise exception 'Guardian is not in this school'; end if;
     update school_guardians set name=a->>'parent',phone=a->>'phone' where school_id=actor.school_id and id=guard;
     insert into school_learner_guardians values(actor.school_id,sid,guard,a->>'relation') on conflict do nothing;
     update school_learner_guardians set relation=a->>'relation' where school_id=actor.school_id and learner_id=sid and guardian_id=guard;
    elsif nullif(btrim(a->>'parent'),'') is not null then
     insert into school_guardians(school_id,name,phone) values(actor.school_id,a->>'parent',a->>'phone') returning id into guard;
     insert into school_learner_guardians values(actor.school_id,sid,guard,a->>'relation');
    end if;
    if guard is not null then
     insert into parent_learner_links(school_id,parent_id,learner_ref)
      select actor.school_id,profile_id,ref from school_guardians where id=guard and school_id=actor.school_id and profile_id is not null
      and not exists(select 1 from parent_learner_links x where x.school_id=actor.school_id and x.parent_id=school_guardians.profile_id and x.learner_ref=ref);
    end if;
   elsif a is not null and k='security' then
    select staff_id into sid from school_security_officers where school_id=actor.school_id and legacy_ref=ref;
    if actor.role not in ('principal','deputy','security') then raise exception 'Officer edit denied'; end if;
    if actor.role='security' and not exists(select 1 from school_staff where id=sid and school_id=actor.school_id and profile_id=actor.id) then raise exception 'Officer edit denied'; end if;
    if actor.role='security' and (a-array['shift','shiftStart','shiftEnd']) is distinct from (b-array['shift','shiftStart','shiftEnd']) then raise exception 'Only your scheduled shift may be edited'; end if;
    if sid is null then
     sid:=school_alias(actor.school_id,'staff','security:'||ref);
     insert into school_staff(id,school_id,legacy_ref,name,record) values(sid,actor.school_id,'security:'||ref,a->>'name',a || '{"role":"Security Officer"}');
     insert into school_security_officers(school_id,legacy_ref,staff_id,record) values(actor.school_id,ref,sid,a);
    end if;
    update school_security_officers set record=a where school_id=actor.school_id and legacy_ref=ref;
   end if;
   select coalesce(jsonb_agg(value),'[]') into rows from jsonb_array_elements(rows) where value->>'id'<>ref;
   if a is not null then
    a:=a || jsonb_build_object('school_id',actor.school_id);
    if b is null then a:=a || jsonb_build_object('createdBy',actor.id); elsif existing ? 'createdBy' then a:=a || jsonb_build_object('createdBy',existing->'createdBy'); end if;
    if k='incidents' and b is null then a:=a || jsonb_build_object('reporterId',actor.id); end if;
    if nullif(a->>'class','') is not null then
     select id into cid from teacher_review_classes where school_id=actor.school_id and class_ref=a->>'class';
     if cid is null then raise exception 'Class is not in this school'; end if;
     a:=a || jsonb_build_object('classId',cid);
    end if;
    if nullif(a->>'subject','') is not null then
     select id into gid from teacher_review_subjects where school_id=actor.school_id and name=a->>'subject';
     if gid is null then raise exception 'Subject is not in the school catalogue'; end if;
     if nullif(a->>'subjectId','') is not null and (a->>'subjectId')::uuid<>gid then raise exception 'Subject identity does not match'; end if;
     a:=a || jsonb_build_object('subjectId',gid);
    end if;
    if k not in ('staff','learners','classes') then a:=a || jsonb_build_object('entityId',school_alias(actor.school_id,k,ref)); end if;
    rows:=rows || jsonb_build_array(a);
   end if;
  end loop;
  merged:=jsonb_set(merged,array[k],rows);
 end loop;
 update school_workspaces set payload=merged,version=version+1,updated_by=actor.id where school_id=actor.school_id;
 return read_school_dataset();
end $$;

-- Direct writes cannot bypass the normalized core write path.
revoke insert,update,delete on public.school_workspaces from authenticated;
-- Prevent direct table reads from bypassing the role-scoped dataset RPC.
do $$ declare p record; begin
 for p in select policyname from pg_policies where schemaname='public' and tablename='school_workspaces' and cmd in ('SELECT','ALL') loop
  execute format('drop policy %I on public.school_workspaces',p.policyname);
 end loop;
end $$;
create policy canonical_workspace_management_read on public.school_workspaces for select to authenticated
 using(school_id=public.current_school_id() and public.current_app_role() in ('principal','deputy'));
do $$ declare t text; begin
 foreach t in array array['school_staff','school_grades','school_learners','school_guardians','school_learner_guardians','school_security_officers','school_entity_aliases','school_identity_issues'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy school_management_read on public.%I for select to authenticated using(school_id=public.current_school_id() and public.current_app_role() in (''principal'',''deputy'',''clerk''))',t);
 end loop;
end $$;
create policy own_staff_identity on public.school_staff for select to authenticated using(school_id=public.current_school_id() and profile_id=auth.uid());
create policy own_guardian_identity on public.school_guardians for select to authenticated using(school_id=public.current_school_id() and profile_id=auth.uid());
create policy linked_family_learner on public.school_learners for select to authenticated using(school_id=public.current_school_id() and public.current_app_role()='parent' and exists(select 1 from public.parent_learner_links x where x.school_id=school_learners.school_id and x.parent_id=auth.uid() and x.learner_ref=school_learners.legacy_ref));
revoke all on function public.school_alias(uuid,text,text),public.school_core_payload(uuid,jsonb),public.protect_school_core() from public,anon,authenticated;
revoke all on function public.read_school_dataset(),public.save_school_dataset(jsonb,jsonb) from public,anon;
grant execute on function public.read_school_dataset(),public.save_school_dataset(jsonb,jsonb) to authenticated;

create function public.project_school_core_change() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 update school_workspaces set payload=school_core_payload(school_id,payload)
 where school_id=case when tg_op='DELETE' then old.school_id else new.school_id end;
 return null;
end $$;
create trigger project_staff_change after insert or update or delete on public.school_staff for each row execute function public.project_school_core_change();
create trigger project_class_change after insert or update or delete on public.teacher_review_classes for each row execute function public.project_school_core_change();
create trigger project_subject_change after update of name on public.teacher_review_subjects for each row execute function public.project_school_core_change();
create trigger project_guardian_change after update on public.school_guardians for each row execute function public.project_school_core_change();
create trigger project_learner_change after insert or update or delete on public.school_learners for each row execute function public.project_school_core_change();
revoke all on function public.project_school_core_change() from public,anon,authenticated;

-- Keep the existing parent endpoint/notice permission table as a compatibility
-- projection of explicit UUID family links. Neither side uses guardian names.
create function public.sync_legacy_family_link() returns trigger
language plpgsql security definer set search_path=public as $$
declare guardian uuid; learner uuid; tenant uuid; account uuid; ref text;
begin
 tenant:=case when tg_op='DELETE' then old.school_id else new.school_id end;
 account:=case when tg_op='DELETE' then old.parent_id else new.parent_id end;
 ref:=case when tg_op='DELETE' then old.learner_ref else new.learner_ref end;
 select id into learner from school_learners where school_id=tenant and legacy_ref=ref;
 select id into guardian from school_guardians where school_id=tenant and profile_id=account;
 if tg_op='DELETE' then
  delete from school_learner_guardians where school_id=tenant and learner_id=learner and guardian_id=guardian;
 else
  if not exists(select 1 from profiles where school_id=tenant and id=account and role='parent') then raise exception 'Parent is not in this school'; end if;
  if learner is null then raise exception 'Learner is not in this school'; end if;
  if guardian is null then
   insert into school_guardians(school_id,profile_id,name) select tenant,account,display_name from profiles where id=account returning id into guardian;
  end if;
  insert into school_learner_guardians(school_id,learner_id,guardian_id) values(tenant,learner,guardian) on conflict do nothing;
 end if;
 update school_workspaces set payload=school_core_payload(school_id,payload) where school_id=tenant;
 return null;
end $$;
create trigger sync_legacy_family_link after insert or delete on public.parent_learner_links for each row execute function public.sync_legacy_family_link();
create function public.project_family_account_link() returns trigger
language plpgsql security definer set search_path=public as $$
declare link record; tenant uuid;
begin
 tenant:=case when tg_op='DELETE' then old.school_id else new.school_id end;
 select l.legacy_ref,g.profile_id into link from school_learners l join school_guardians g on g.school_id=l.school_id
 where l.school_id=tenant and l.id=case when tg_op='DELETE' then old.learner_id else new.learner_id end
 and g.id=case when tg_op='DELETE' then old.guardian_id else new.guardian_id end;
 if link.profile_id is not null then
  if tg_op='DELETE' then delete from parent_learner_links where school_id=tenant and parent_id=link.profile_id and learner_ref=link.legacy_ref;
  else insert into parent_learner_links(school_id,parent_id,learner_ref) select tenant,link.profile_id,link.legacy_ref
   where not exists(select 1 from parent_learner_links where school_id=tenant and parent_id=link.profile_id and learner_ref=link.legacy_ref); end if;
 end if;
 update school_workspaces set payload=school_core_payload(school_id,payload) where school_id=tenant;
 return null;
end $$;
create trigger project_family_account_link after insert or delete on public.school_learner_guardians for each row execute function public.project_family_account_link();
revoke all on function public.sync_legacy_family_link(),public.project_family_account_link() from public,anon,authenticated;

-- New schools start empty on the server. Login never seeds any records.
create function public.initialize_school_dataset() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 insert into school_workspaces(school_id,payload) values(new.id,'{}') on conflict do nothing;
 return new;
end $$;
create trigger initialize_school_dataset after insert on public.schools for each row execute function public.initialize_school_dataset();

create function public.sync_school_profile_identity() returns trigger
language plpgsql security definer set search_path=public as $$
declare sid uuid;
begin
 if new.school_id is null then return new; end if;
 if new.role not in ('parent','sgb') then
  select id into sid from school_staff where school_id=new.school_id and profile_id=new.id;
  if sid is null then
   sid:=school_alias(new.school_id,'staff',new.id::text);
   insert into school_staff(id,school_id,legacy_ref,profile_id,name,record)
    values(sid,new.school_id,new.id::text,new.id,new.display_name,jsonb_build_object('id',new.id,'name',new.display_name,'role',case when new.role='teacher' then 'Teacher' else new.role::text end));
  else update school_staff set name=new.display_name where id=sid and school_id=new.school_id; end if;
  if new.role='security' then
   insert into school_security_officers(school_id,legacy_ref,staff_id,record) values(new.school_id,new.id::text,sid,jsonb_build_object('id',new.id,'name',new.display_name)) on conflict do nothing;
  end if;
 else
  update school_guardians set name=new.display_name where school_id=new.school_id and profile_id=new.id;
 end if;
 update school_workspaces set payload=school_core_payload(school_id,payload) where school_id=new.school_id;
 return new;
end $$;
create trigger sync_school_profile_identity after insert or update of display_name,school_id,role on public.profiles for each row execute function public.sync_school_profile_identity();
revoke all on function public.initialize_school_dataset(),public.sync_school_profile_identity() from public,anon,authenticated;

-- Explicitly bind a pilot staff record to an approved account. No guessing by
-- display name/email at login. Do not merge existing records behind an admin's back.
create table public.school_staff_link_history (
 id uuid primary key default gen_random_uuid(),school_id uuid not null references schools(id),
 staff_id uuid not null,previous_identity jsonb,profile_id uuid not null,
 changed_by uuid not null,changed_at timestamptz not null default now()
);
alter table public.school_staff_link_history enable row level security;
revoke all on public.school_staff_link_history from anon,authenticated;
grant select on public.school_staff_link_history to authenticated;
create policy leadership_staff_link_history on public.school_staff_link_history for select to authenticated using(can_manage_teacher_performance(school_id));
create function public.link_school_staff_account(p_staff uuid,p_profile uuid) returns void
language plpgsql security definer set search_path=public as $$
declare tenant uuid:=current_school_id(); existing_staff uuid;
begin
 if not can_manage_teacher_performance(tenant) then raise exception 'Staff account linking denied'; end if;
 if not exists(select 1 from profiles where school_id=tenant and id=p_profile and role not in ('parent','sgb')) or not exists(select 1 from school_staff where school_id=tenant and id=p_staff) then raise exception 'Staff or account is not in your school'; end if;
 if exists(select 1 from school_staff s join profiles p on p.id=p_profile and p.school_id=s.school_id where s.id=p_staff and
   ((s.record->>'role'='Teacher' and p.role<>'teacher') or (s.record->>'role'='Clerk' and p.role<>'clerk') or (s.record->>'role'='Security Officer' and p.role<>'security'))) then raise exception 'Approved account role does not match the staff record'; end if;
 select id into existing_staff from school_staff where school_id=tenant and profile_id=p_profile;
 if exists(select 1 from school_staff where id=p_staff and profile_id is not null and profile_id<>p_profile) then raise exception 'Staff record already belongs to another account'; end if;
 if existing_staff is not null and existing_staff<>p_staff then
  -- Only an automatically created account placeholder may be consolidated.
  if not exists(select 1 from school_staff where id=existing_staff and legacy_ref=p_profile::text)
   or exists(select 1 from school_security_officers where staff_id=existing_staff) then raise exception 'Account already has a staff identity; reconcile its preserved records before merging'; end if;
  insert into school_staff_link_history(school_id,staff_id,previous_identity,profile_id,changed_by)
   select tenant,p_staff,to_jsonb(s),p_profile,auth.uid() from school_staff s where id=existing_staff;
  update teacher_review_classes set teacher_staff_id=p_staff where school_id=tenant and teacher_staff_id=existing_staff;
  update school_entity_aliases set entity_id=p_staff where school_id=tenant and kind='staff' and entity_id=existing_staff;
  delete from school_staff where school_id=tenant and id=existing_staff;
 else
  insert into school_staff_link_history(school_id,staff_id,profile_id,changed_by) values(tenant,p_staff,p_profile,auth.uid());
 end if;
 update school_staff set profile_id=p_profile where school_id=tenant and id=p_staff;
 update profiles set display_name=(select name from school_staff where id=p_staff and school_id=tenant) where id=p_profile and school_id=tenant;
 update school_workspaces set payload=school_core_payload(school_id,payload) where school_id=tenant;
end $$;
revoke all on function public.link_school_staff_account(uuid,uuid) from public,anon;
grant execute on function public.link_school_staff_account(uuid,uuid) to authenticated;

-- Reconcile old approval rows once, then remove name matching from the existing
-- catalogue/management functions without changing their public signatures.
alter table public.school_workspaces disable trigger protect_approved_workspace_assignments;
do $$ declare w record; r jsonb; rows jsonb; sid uuid; pid uuid; n integer; begin
 for w in select school_id,payload from school_workspaces loop
  rows:='[]';
  for r in select value from jsonb_array_elements(coalesce(w.payload->'teacherAssignments','[]')) loop
   sid:=null;pid:=null;
   if nullif(coalesce(r->>'teacherId',r->>'profileId'),'') is not null then
    select id,profile_id into sid,pid from school_staff where school_id=w.school_id and profile_id::text=coalesce(r->>'teacherId',r->>'profileId');
   else
    select count(*),(array_agg(id))[1],(array_agg(profile_id))[1] into n,sid,pid from school_staff where school_id=w.school_id and name=r->>'teacher';
    if n<>1 then sid:=null;pid:=null; end if;
   end if;
   r:=r || jsonb_build_object('school_id',w.school_id,'teacherStaffId',sid,'teacherId',pid);
   rows:=rows || jsonb_build_array(r);
  end loop;
  update school_workspaces set payload=jsonb_set(payload,'{teacherAssignments}',rows) where school_id=w.school_id;
 end loop;
end $$;
alter table public.school_workspaces enable trigger protect_approved_workspace_assignments;
do $$ declare signature text; body text; begin
 foreach signature in array array['public.get_teacher_performance_directory_base(integer)','public.sync_teacher_review_catalogue()','public.get_teacher_performance_directory(integer)'] loop
  body:=replace(pg_get_functiondef(signature::regprocedure),chr(13),'');
  body:=replace(body,$old$'id',p.id,'name',p.display_name$old$,$new$'id',p.id,'profileId',p.id,'staffId',(select st.id from school_staff st where st.school_id=p.school_id and st.profile_id=p.id),'name',p.display_name$new$);
  body:=replace(body,$old$(coalesce(s->>'userId',s->>'profileId','')='' and s->>'name'=p.display_name
          and (select count(*) from public.profiles where school_id=tenant and display_name=p.display_name)=1)$old$,'false');
  body:=replace(body,$old$(coalesce(a->>'teacherId',a->>'profileId','')='' and p.display_name=a->>'teacher'
      and (select count(*) from public.profiles q where q.school_id=tenant and q.role='teacher' and q.display_name=p.display_name)=1)$old$,'false');
  body:=replace(body,$old$(coalesce(item->>'teacherId',item->>'profileId','')='' and p.display_name=item->>'teacher'
     and (select count(*) from public.profiles q where q.school_id=tenant and q.role='teacher' and q.display_name=p.display_name)=1)$old$,'false');
  body:=replace(body,$old$(coalesce(a->>'teacherId',a->>'profileId','')='' and p.display_name=a->>'teacher')$old$,'false');
  execute body;
 end loop;
end $$;
