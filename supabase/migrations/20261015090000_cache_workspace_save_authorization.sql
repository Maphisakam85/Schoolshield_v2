-- Cache the authenticated role projection once per save transaction.
-- Keep all existing role, tenant, record and optimistic conflict checks.
create or replace function public.save_school_dataset_base(p_before jsonb,p_after jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare actor profiles%rowtype; current_payload jsonb; authorized_payload jsonb; merged jsonb; k text; a jsonb; b jsonb; existing jsonb; rows jsonb; ref text; sid uuid; pid uuid; cid uuid; gid uuid; guard uuid;
begin
 select * into actor from profiles where id=auth.uid();
 if actor.id is null or actor.role='parent' then raise exception 'School dataset access denied'; end if;
 select payload into current_payload from school_workspaces where school_id=actor.school_id for update;
 if current_payload is null then raise exception 'School dataset has not been initialized'; end if;
 authorized_payload:=read_school_dataset()->'payload';
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
    select 1 from jsonb_array_elements(coalesce(authorized_payload->k,'[]')) x where x->>'id'=ref
   ) then raise exception 'Record edit denied'; end if;
   if actor.role='teacher' and a is not null and k in ('assessments','reports','attendanceRegisters','attendanceWeeks') and not exists(
    select 1 from jsonb_array_elements(authorized_payload->'classes') c where c->>'id'=a->>'class'
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


revoke all on function public.save_school_dataset_base(jsonb,jsonb) from public,anon,authenticated;
