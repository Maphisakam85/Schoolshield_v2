-- Management edits normalized school records; JSON workspaces are projections.
-- No hard deletes: histories retain their UUIDs.
do $$ declare t text;begin foreach t in array array['school_staff','school_learners','school_guardians','school_grades','teacher_review_classes','teacher_review_subjects'] loop
 execute format('alter table public.%I add column revision integer not null default 1',t);
end loop;end $$;
alter table teacher_review_classes add column academic_year integer check(academic_year between 1900 and 2200);
alter table school_learners add column grade_id uuid;
alter table school_learners add foreign key(school_id,grade_id) references school_grades(school_id,id);
alter table school_learners disable trigger project_learner_change;
update school_learners l set grade_id=c.grade_id from teacher_review_classes c where c.school_id=l.school_id and c.id=l.class_id;
alter table school_learners enable trigger project_learner_change;
create table school_record_operations(id uuid primary key,school_id uuid not null references schools(id),actor_id uuid not null references profiles(id),kind text not null,record_id uuid not null,request jsonb not null,result jsonb not null,created_at timestamptz not null default now());
create table school_record_audit(id uuid primary key default gen_random_uuid(),school_id uuid not null references schools(id),kind text not null,record_id uuid not null,previous_value jsonb,new_value jsonb not null,changed_by uuid not null references profiles(id),changed_at timestamptz not null default now());
alter table school_record_operations enable row level security;alter table school_record_audit enable row level security;
revoke all on school_record_operations,school_record_audit from public,anon,authenticated;
grant select on school_record_audit to authenticated;
create policy management_reads_record_audit on school_record_audit for select to authenticated using(account_is_ready() and school_id=current_school_id() and current_app_role() in ('principal','deputy','clerk'));
create function bump_school_record_revision() returns trigger language plpgsql set search_path=public as $$begin new.revision:=old.revision+1;return new;end $$;
do $$ declare t text;begin foreach t in array array['school_staff','school_learners','school_guardians','school_grades','teacher_review_classes','teacher_review_subjects'] loop
 execute format('create trigger bump_record_revision before update on public.%I for each row execute function public.bump_school_record_revision()',t);
end loop;end $$;
revoke all on function bump_school_record_revision() from public,anon,authenticated;

create function get_school_records() returns jsonb language plpgsql stable security definer set search_path=public as $$
declare tenant uuid:=current_school_id();result jsonb;
begin
 perform assert_account_access();if current_app_role() not in ('principal','deputy','clerk') then raise exception 'School record management denied';end if;
 select jsonb_build_object('school',(select jsonb_build_object('id',id,'name',name,'code',code) from schools where id=tenant),
 'staff',coalesce((select jsonb_agg(to_jsonb(s)||jsonb_build_object('account_revision',p.management_revision,'account_status',p.account_status) order by s.name) from school_staff s left join profiles p on p.id=s.profile_id where s.school_id=tenant),'[]'),
 'learners',coalesce((select jsonb_agg(to_jsonb(l)||jsonb_build_object('guardian_ids',coalesce((select jsonb_agg(guardian_id) from school_learner_guardians where school_id=tenant and learner_id=l.id),'[]')) order by l.name) from school_learners l where school_id=tenant),'[]'),
 'guardians',coalesce((select jsonb_agg(to_jsonb(g) order by g.name) from school_guardians g where school_id=tenant),'[]'),
 'grades',coalesce((select jsonb_agg(to_jsonb(g) order by g.name) from school_grades g where school_id=tenant),'[]'),
 'classes',coalesce((select jsonb_agg(to_jsonb(c) order by c.class_ref) from teacher_review_classes c where school_id=tenant),'[]'),
 'subjects',coalesce((select jsonb_agg(to_jsonb(s) order by s.name) from teacher_review_subjects s where school_id=tenant),'[]'),
 'class_subjects',coalesce((select jsonb_agg(to_jsonb(cs)) from teacher_class_subjects cs where school_id=tenant),'[]'),
 'parents',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',display_name,'status',account_status,'phone',phone)) from profiles where school_id=tenant and role='parent'),'[]'),
 'teachers',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',display_name,'status',account_status)) from profiles where school_id=tenant and role='teacher'),'[]'),
 'assignments',coalesce((select jsonb_agg(to_jsonb(c)) from teacher_teaching_contexts c where school_id=tenant),'[]')) into result;
 return result;
end $$;
revoke all on function get_school_records() from public,anon;grant execute on function get_school_records() to authenticated;

create function save_school_record(p_operation uuid,p_kind text,p_id uuid,p_revision integer,p_record jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare tenant uuid:=current_school_id();table_name text;previous jsonb;result jsonb;op school_record_operations%rowtype;label text;v_grade uuid;cl uuid;staff uuid;parent uuid;g uuid;ref text;status text;data jsonb;account profiles%rowtype;
begin
 perform assert_account_access();if current_app_role() not in ('principal','deputy','clerk') then raise exception 'School record management denied';end if;
 if nullif(p_record->>'school_id','') is not null and p_record->>'school_id'<>tenant::text then raise exception 'Cross-school record denied';end if;
 table_name:=case p_kind when 'staff' then 'school_staff' when 'learners' then 'school_learners' when 'guardians' then 'school_guardians' when 'grades' then 'school_grades' when 'classes' then 'teacher_review_classes' when 'subjects' then 'teacher_review_subjects' end;
 if table_name is null then raise exception 'Unsupported record type';end if;
 perform 1 from schools where id=tenant for update;
 select * into op from school_record_operations where id=p_operation;
 if found then if op.actor_id<>auth.uid() or op.school_id<>tenant or op.kind<>p_kind or op.record_id<>p_id or op.request is distinct from p_record then raise exception 'Operation belongs to another request';end if;return op.result;end if;
 execute format('select to_jsonb(t) from public.%I t where id=$1 and school_id=$2 for update',table_name) into previous using p_id,tenant;
 if previous is null and p_revision<>0 or previous is not null and (previous->>'revision')::int<>p_revision then raise exception 'Record changed in another session. Refresh before editing' using errcode='40001';end if;
 if previous is null and exists(select 1 from school_entity_aliases where school_id=tenant and entity_id=p_id) then raise exception 'Record UUID is already registered';end if;
 label:=btrim(coalesce(p_record->>'name',p_record->>'class_ref',''));
 if length(label) not between 1 and 120 then raise exception 'Enter a name or class code (up to 120 characters)';end if;
 status:=coalesce(p_record->>'status','Active');if status not in ('Active','Inactive','On Leave') then raise exception 'Invalid status';end if;
 data:=jsonb_build_object('status',status);
 if p_kind='staff' then
  if coalesce(p_record->>'role','') not in ('Teacher','Principal','Deputy Principal','Clerk','Security Officer','Support Staff','Other') then raise exception 'Select a valid staff role';end if;
  data:=data||jsonb_build_object('role',p_record->>'role','department',btrim(coalesce(p_record->>'department','')),'phone',btrim(coalesce(p_record->>'phone','')),'email',btrim(coalesce(p_record->>'email','')),'employeeId',btrim(coalesce(p_record->>'employee_id','')));
  if nullif(data->>'employeeId','') is not null and exists(select 1 from school_staff where school_id=tenant and id<>p_id and record->>'employeeId'=data->>'employeeId') then raise exception 'Staff / employee ID is already assigned in this school';end if;
  if nullif(previous->>'profile_id','') is not null then
   select * into account from profiles where id=(previous->>'profile_id')::uuid;
   perform assert_user_management(auth.uid(),tenant,account.role,account.role);
   if label<>account.display_name or status<>account.account_status or data->>'phone' is distinct from coalesce(account.phone,'') or data->>'email' is distinct from coalesce(account.email,'') or data->>'employeeId' is distinct from coalesce(account.employee_id,'') or data->>'role' is distinct from previous->'record'->>'role' then raise exception 'Use User Management to change linked account identity, role or access status';end if;
  end if;
  if previous is null then insert into school_staff(id,school_id,legacy_ref,name,record) values(p_id,tenant,p_id::text,label,data);
  else update school_staff set name=label,record=record||data where id=p_id and school_id=tenant;end if;
 elsif p_kind='grades' then
  if previous is null then insert into school_grades(id,school_id,name) values(p_id,tenant,label);else update school_grades set name=label where id=p_id and school_id=tenant;update teacher_review_classes set grade=label where school_id=tenant and grade_id=p_id;end if;
 elsif p_kind='subjects' then
  if previous is null then insert into teacher_review_subjects(id,school_id,name) values(p_id,tenant,label);else update teacher_review_subjects set name=label where id=p_id and school_id=tenant;end if;
 elsif p_kind='classes' then
  v_grade:=nullif(p_record->>'grade_id','')::uuid;staff:=nullif(p_record->>'teacher_staff_id','')::uuid;
  if not exists(select 1 from school_grades where school_id=tenant and id=v_grade) then raise exception 'Select a grade from your school';end if;
  if staff is not null and not exists(select 1 from school_staff where school_id=tenant and id=staff and record->>'role'='Teacher' and coalesce(record->>'status','Active')='Active') then raise exception 'Select an active school teacher';end if;
  if coalesce((p_record->>'academic_year')::int,0) not between 1900 and 2200 then raise exception 'Enter an academic year';end if;
  data:=data||jsonb_build_object('room',btrim(coalesce(p_record->>'room','')),'academicYear',(p_record->>'academic_year')::int);
  if previous is null then insert into teacher_review_classes(id,school_id,class_ref,grade,grade_id,teacher_staff_id,academic_year,record) select p_id,tenant,label,name,v_grade,staff,(p_record->>'academic_year')::int,data from school_grades where id=v_grade;
  else update teacher_review_classes set class_ref=label,grade=(select name from school_grades where id=v_grade),grade_id=v_grade,teacher_staff_id=staff,academic_year=(p_record->>'academic_year')::int,record=record||data where id=p_id and school_id=tenant;end if;
  if p_record ? 'subject_ids' then
   if exists(select 1 from jsonb_array_elements_text(p_record->'subject_ids') s where not exists(select 1 from teacher_review_subjects where school_id=tenant and id::text=s)) then raise exception 'Subject is not in your school';end if;
   if exists(select 1 from teacher_teaching_contexts where school_id=tenant and class_id=p_id and not (p_record->'subject_ids' ? subject_id::text)) then raise exception 'Preserve subjects with teaching assignment history';end if;
   delete from teacher_class_subjects where school_id=tenant and class_id=p_id and not(p_record->'subject_ids' ? subject_id::text);
   for ref in select jsonb_array_elements_text(p_record->'subject_ids') loop insert into teacher_class_subjects(school_id,class_id,subject_id,source) values(tenant,p_id,ref::uuid,'School record management') on conflict do nothing;end loop;
  end if;
 elsif p_kind='learners' then
  v_grade:=nullif(p_record->>'grade_id','')::uuid;cl:=nullif(p_record->>'class_id','')::uuid;
  if not exists(select 1 from school_grades where school_id=tenant and id=v_grade) then raise exception 'Select a school grade';end if;
  if cl is not null and not exists(select 1 from teacher_review_classes where school_id=tenant and id=cl and grade_id=v_grade) then raise exception 'Class must belong to the selected school grade';end if;
  data:=data||jsonb_build_object('gender',p_record->>'gender','dob',nullif(p_record->>'dob',''),'address',btrim(coalesce(p_record->>'address','')),'grade',(select name from school_grades where id=v_grade));
  if nullif(p_record->>'dob','') is not null and (p_record->>'dob')::date>current_date then raise exception 'Date of birth cannot be in the future';end if;
  if previous is null then insert into school_learners(id,school_id,legacy_ref,class_id,name,record,grade_id) values(p_id,tenant,p_id::text,cl,label,data,v_grade);
  else update school_learners set class_id=cl,name=label,record=record||data,grade_id=v_grade where id=p_id and school_id=tenant;end if;
  if p_record ? 'guardian_ids' then
   if exists(select 1 from jsonb_array_elements_text(p_record->'guardian_ids') s where not exists(select 1 from school_guardians where school_id=tenant and id::text=s)) then raise exception 'Guardian is not in your school';end if;
   delete from school_learner_guardians where school_id=tenant and learner_id=p_id and not(p_record->'guardian_ids' ? guardian_id::text);
   for ref in select jsonb_array_elements_text(p_record->'guardian_ids') loop insert into school_learner_guardians(school_id,learner_id,guardian_id) values(tenant,p_id,ref::uuid) on conflict do nothing;end loop;
  end if;
 elsif p_kind='guardians' then
  parent:=nullif(p_record->>'profile_id','')::uuid;
  if parent is not null then select * into account from profiles where school_id=tenant and id=parent and role='parent';if account.id is null then raise exception 'Select a Parent account from your school';end if;label:=account.display_name;end if;
  if previous is not null and nullif(previous->>'profile_id','') is not null and previous->>'profile_id' is distinct from parent::text and exists(select 1 from school_learner_guardians where school_id=tenant and guardian_id=p_id) then raise exception 'Preserve linked guardian identity; add another guardian instead';end if;
  if previous is null then insert into school_guardians(id,school_id,profile_id,name,phone) values(p_id,tenant,parent,label,case when parent is null then p_record->>'phone' else account.phone end);
  else update school_guardians set profile_id=parent,name=label,phone=case when parent is null then p_record->>'phone' else account.phone end where id=p_id and school_id=tenant;end if;
  -- Linking an existing guardian to an account must project all current children.
  if parent is not null then insert into parent_learner_links(school_id,parent_id,learner_ref) select tenant,parent,l.legacy_ref from school_learner_guardians x join school_learners l on l.id=x.learner_id and l.school_id=x.school_id where x.school_id=tenant and x.guardian_id=p_id on conflict do nothing;end if;
 end if;
 if previous is null and p_kind in ('staff','learners') then insert into school_entity_aliases(school_id,kind,legacy_ref,entity_id) values(tenant,p_kind,p_id::text,p_id) on conflict do nothing;end if;
 update school_workspaces set payload=school_core_payload(school_id,payload),version=version+1,updated_by=auth.uid() where school_id=tenant;
 execute format('select to_jsonb(t) from public.%I t where id=$1 and school_id=$2',table_name) into result using p_id,tenant;
 insert into school_record_audit(school_id,kind,record_id,previous_value,new_value,changed_by) values(tenant,p_kind,p_id,previous,result,auth.uid());
 insert into school_record_operations(id,school_id,actor_id,kind,record_id,request,result) values(p_operation,tenant,auth.uid(),p_kind,p_id,p_record,result);
 return result;
end $$;
revoke all on function save_school_record(uuid,text,uuid,integer,jsonb) from public,anon;
grant execute on function save_school_record(uuid,text,uuid,integer,jsonb) to authenticated;
-- Assessment access follows the actual teacher/subject/class assignment, even
-- when another subject is taught in the same class. Historical dated marks
-- remain visible to the teacher assigned on the assessment date.
create function academic_record_is_assigned(p_record jsonb,p_school uuid) returns boolean
language plpgsql stable security definer set search_path=public as $$
declare cl uuid;subject uuid;assessment_date date;year integer;
begin
 if not account_is_ready() or current_app_role()<>'teacher' or current_school_id() is distinct from p_school then return false;end if;
 select id into cl from teacher_review_classes where school_id=p_school and (id::text=p_record->>'classId' or class_ref=p_record->>'class');
 select id into subject from teacher_review_subjects where school_id=p_school and (id::text=p_record->>'subjectId' or name=p_record->>'subject');
 assessment_date:=coalesce(nullif(p_record->>'date','')::date,current_date);
 year:=coalesce(nullif(p_record->>'academicYear','')::integer,nullif(p_record->>'academic_year','')::integer,extract(year from assessment_date)::integer);
 return exists(select 1 from teacher_teaching_contexts t where t.school_id=p_school and t.teacher_id=auth.uid() and t.class_id=cl and t.subject_id=subject and t.academic_year=year
 and coalesce(t.start_date,make_date(year,1,1))<=assessment_date and coalesce(t.end_date,make_date(year,12,31))>=assessment_date);
exception when invalid_datetime_format or datetime_field_overflow or invalid_text_representation then return false;
end $$;
revoke all on function academic_record_is_assigned(jsonb,uuid) from public,anon,authenticated;
alter function read_school_dataset() rename to school_records_read_base;
revoke all on function school_records_read_base() from public,anon,authenticated;
create function read_school_dataset() returns jsonb language plpgsql stable security definer set search_path=public as $$
declare result jsonb;kind text;
begin
 perform assert_account_access();result:=school_records_read_base();
 if current_app_role()='teacher' then
  result:=jsonb_set(result,'{payload,classes}',coalesce((select jsonb_agg(c||jsonb_build_object('subjects',coalesce((select jsonb_agg(distinct s.name) from teacher_teaching_contexts t join teacher_review_subjects s on s.id=t.subject_id where t.school_id=current_school_id() and t.teacher_id=auth.uid() and t.class_id::text=c->>'entityId' and t.academic_year=extract(year from current_date)::int and coalesce(t.start_date,make_date(t.academic_year,1,1))<=current_date and coalesce(t.end_date,make_date(t.academic_year,12,31))>=current_date),'[]'))) from jsonb_array_elements(result->'payload'->'classes') c),'[]'));
 end if;
 if current_app_role()='teacher' then foreach kind in array array['assessments','reports'] loop
 result:=jsonb_set(result,array['payload',kind],coalesce((select jsonb_agg(r) from jsonb_array_elements(coalesce(result->'payload'->kind,'[]')) r where academic_record_is_assigned(r,current_school_id())),'[]'));
 end loop;end if;return result;
end $$;
revoke all on function read_school_dataset() from public,anon;grant execute on function read_school_dataset() to authenticated;
alter function save_school_dataset(jsonb,jsonb) rename to school_records_save_base;
revoke all on function school_records_save_base(jsonb,jsonb) from public,anon,authenticated;
create function save_school_dataset(p_before jsonb,p_after jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare kind text;r jsonb;before_row jsonb;after_row jsonb;
begin
 perform assert_account_access();
 if current_app_role()='teacher' then foreach kind in array array['assessments','reports'] loop
  for r in select value from jsonb_array_elements(coalesce(p_after->kind,'[]')||coalesce(p_before->kind,'[]')) loop
   select value into before_row from jsonb_array_elements(coalesce(p_before->kind,'[]')) where value->>'id'=r->>'id';
   select value into after_row from jsonb_array_elements(coalesce(p_after->kind,'[]')) where value->>'id'=r->>'id';
   if before_row is distinct from after_row and not academic_record_is_assigned(coalesce(after_row,before_row),current_school_id()) then raise exception 'Assessment access requires an approved teacher/subject/class assignment';end if;
  end loop;
 end loop;end if;
 return school_records_save_base(p_before,p_after);
end $$;
revoke all on function save_school_dataset(jsonb,jsonb) from public,anon;grant execute on function save_school_dataset(jsonb,jsonb) to authenticated;
create function require_active_teaching_records() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if tg_op='INSERT' and (not exists(select 1 from profiles where id=new.teacher_id and school_id=new.school_id and role='teacher' and account_status='Active' and (not requires_setup or onboarding_completed_at is not null)) or not exists(select 1 from teacher_review_classes where id=new.class_id and school_id=new.school_id and coalesce(record->>'status','Active')='Active')) then raise exception 'Select an active Teacher account and active class';end if;return new;
end $$;
create trigger aaa_active_teaching_records before insert on teacher_teaching_contexts for each row execute function require_active_teaching_records();
revoke all on function require_active_teaching_records() from public,anon,authenticated;
