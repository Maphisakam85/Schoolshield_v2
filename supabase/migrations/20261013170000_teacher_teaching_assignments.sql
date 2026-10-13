-- Reuse the existing stable teacher/subject/class/year links as assignments.
create unique index teacher_context_school_identity on public.teacher_teaching_contexts(school_id,id);
alter table public.teacher_teaching_contexts
 add column start_date date, add column end_date date,
 add column status text not null default 'Active' check(status in ('Active','Upcoming','Ended')),
 add column notes text not null default '' check(length(notes)<=4000),
 add column assignment_grade text,
 add column assigned_by uuid references public.profiles(id),
 add column created_at timestamptz not null default now(),
 add column updated_at timestamptz not null default now(),
 add column revision integer not null default 1,
 add column assignment_source text not null default 'Approved teaching link',
 add constraint assignment_dates check(end_date is null or start_date is null or end_date>=start_date);
-- Legacy links had a year but no dated commencement. Do not invent a start date.
alter table public.teacher_teaching_contexts disable trigger guard_teacher_review_context;
update public.teacher_teaching_contexts c set assignment_grade=cl.grade,
 assigned_by=(select r.reviewer_id from public.teacher_performance_reviews r where r.teaching_context_id=c.id order by r.created_at limit 1)
 from public.teacher_review_classes cl where cl.id=c.class_id;
alter table public.teacher_teaching_contexts enable trigger guard_teacher_review_context;
alter table public.teacher_performance_reviews add column assignment_snapshot jsonb;
-- Existing context identity was immutable, so retain its known labels now.
-- Legacy dates remain NULL rather than being fabricated retrospectively.
alter table public.teacher_performance_reviews disable trigger guard_teacher_term_review;
alter table public.teacher_performance_reviews disable trigger audit_teacher_review_events;
update public.teacher_performance_reviews r set assignment_snapshot=(
 select to_jsonb(c)||jsonb_build_object('subject',s.name,'class',cl.class_ref,'grade',c.assignment_grade)
 from public.teacher_teaching_contexts c join public.teacher_review_subjects s on s.id=c.subject_id
 join public.teacher_review_classes cl on cl.id=c.class_id where c.id=r.teaching_context_id);
alter table public.teacher_performance_reviews enable trigger audit_teacher_review_events;
alter table public.teacher_performance_reviews enable trigger guard_teacher_term_review;

create table public.teacher_class_subjects (
 school_id uuid not null, class_id uuid not null, subject_id uuid not null,
 source text not null,
 primary key(school_id,class_id,subject_id),
 foreign key(school_id,class_id) references public.teacher_review_classes(school_id,id),
 foreign key(school_id,subject_id) references public.teacher_review_subjects(school_id,id)
);
create table public.teacher_review_terms (
 school_id uuid not null references public.schools(id),academic_year integer not null check(academic_year between 1900 and 2200),
 term integer not null check(term between 1 and 4),start_date date not null,end_date date not null,
 updated_by uuid not null references public.profiles(id),updated_at timestamptz not null default now(),
 primary key(school_id,academic_year,term),
 check(end_date>=start_date and extract(year from start_date)=academic_year and extract(year from end_date)=academic_year)
);
create table public.teacher_assignment_history (
 id uuid primary key default gen_random_uuid(),school_id uuid not null,
 assignment_id uuid not null,teacher_id uuid not null,action text not null,
 previous_value jsonb,new_value jsonb not null,reason text not null,
 changed_by uuid not null references public.profiles(id),changed_at timestamptz not null default now(),
 foreign key(school_id,assignment_id) references public.teacher_teaching_contexts(school_id,id)
);
alter table public.teacher_class_subjects enable row level security;
alter table public.teacher_review_terms enable row level security;
alter table public.teacher_assignment_history enable row level security;
create policy "leadership reads class subjects" on public.teacher_class_subjects for select to authenticated using(public.can_manage_teacher_performance(school_id));
create policy "school leadership and teacher read review dates" on public.teacher_review_terms for select to authenticated
 using(public.can_manage_teacher_performance(school_id) or (school_id=public.current_school_id() and public.current_app_role()='teacher'));
create policy "leadership reads assignment history" on public.teacher_assignment_history for select to authenticated using(public.can_manage_teacher_performance(school_id));
create policy "teacher reads own assignments" on public.teacher_teaching_contexts for select to authenticated
 using(school_id=public.current_school_id() and public.current_app_role()='teacher' and teacher_id=auth.uid());
revoke all on public.teacher_class_subjects,public.teacher_review_terms,public.teacher_assignment_history from public,anon,authenticated;
grant select on public.teacher_class_subjects,public.teacher_review_terms,public.teacher_assignment_history to authenticated;
revoke all on public.teacher_teaching_contexts from public,anon,authenticated;
grant select on public.teacher_teaching_contexts to authenticated;

-- Extend the existing recipient notification store, retaining its bell/read flow.
alter table public.account_request_notifications alter column request_id drop not null;
alter table public.account_request_notifications
 add column notification_type text not null default 'account_request' check(notification_type in ('account_request','teaching_assignment')),
 add column assignment_id uuid references public.teacher_teaching_contexts(id),
 add column payload jsonb not null default '{}',
 add constraint recipient_notification_entity check((notification_type='account_request' and request_id is not null and assignment_id is null)
   or (notification_type='teaching_assignment' and request_id is null and assignment_id is not null));
create unique index unique_assignment_recipient_notice on public.account_request_notifications(assignment_id,recipient_id) where notification_type='teaching_assignment';
create policy "recipient notification tenant and role isolation" on public.account_request_notifications as restrictive for all to authenticated
 using(school_id=public.current_school_id() and ((notification_type='account_request' and public.current_app_role() in ('principal','clerk'))
  or (notification_type='teaching_assignment' and public.current_app_role()='teacher')))
 with check(school_id=public.current_school_id() and ((notification_type='account_request' and public.current_app_role() in ('principal','clerk'))
  or (notification_type='teaching_assignment' and public.current_app_role()='teacher')));
revoke all on public.account_request_notifications from public,anon,authenticated;
grant select,update(read_at) on public.account_request_notifications to authenticated;

create function public.teacher_assignment_status(p_start date,p_end date,p_year integer) returns text
language sql stable set search_path=public as $$
 select case when coalesce(p_end,make_date(p_year,12,31))<(now() at time zone 'Africa/Johannesburg')::date then 'Ended'
 when coalesce(p_start,make_date(p_year,1,1))>(now() at time zone 'Africa/Johannesburg')::date then 'Upcoming' else 'Active' end
$$;
create function public.teacher_assignment_in_term(p_context uuid,p_term integer,p_include_history boolean default true) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.teacher_teaching_contexts c where c.id=p_context and
  (exists(select 1 from public.teacher_review_terms t where t.school_id=c.school_id and t.academic_year=c.academic_year and t.term=p_term
    and coalesce(c.start_date,make_date(c.academic_year,1,1))<=t.end_date and coalesce(c.end_date,make_date(c.academic_year,12,31))>=t.start_date)
   or (c.start_date is null and not exists(select 1 from public.teacher_review_terms t where t.school_id=c.school_id and t.academic_year=c.academic_year and t.term=p_term))
   or (p_include_history and exists(select 1 from public.teacher_performance_reviews r where r.teaching_context_id=c.id and r.term=p_term and r.status<>'Not Started'))))
$$;
revoke all on function public.teacher_assignment_in_term(uuid,integer,boolean) from public,anon,authenticated;

create function public.guard_dated_teacher_assignment() returns trigger
language plpgsql security definer set search_path=public as $$
declare actor public.profiles%rowtype;cl public.teacher_review_classes%rowtype;previous jsonb;reason text:=current_setting('schoolshield.assignment_reason',true);
begin
 if tg_op='DELETE' then raise exception 'Preserve assignment history; end the assignment instead';end if;
 select * into actor from public.profiles where id=auth.uid();
 if not public.can_manage_teacher_performance(new.school_id) then raise exception 'Assignment management access denied';end if;
 if tg_op='UPDATE' then
  if (new.start_date,new.assigned_by,new.created_at,new.assignment_grade,new.assignment_source,new.notes) is distinct from
   (old.start_date,old.assigned_by,old.created_at,old.assignment_grade,old.assignment_source,old.notes) then raise exception 'Assignment details are immutable; preserve history and create the new teaching link';end if;
  if new.end_date is distinct from old.end_date and length(btrim(coalesce(reason,'')))<5 then raise exception 'An assignment end/change reason is required';end if;
  new.revision:=old.revision+1;
 else
  select * into cl from public.teacher_review_classes where id=new.class_id and school_id=new.school_id;
  if cl.id is null then raise exception 'Class is not in your school';end if;
  if not exists(select 1 from public.school_workspaces w cross join lateral jsonb_array_elements(coalesce(w.payload->'classes','[]')) c
    where w.school_id=new.school_id and c->>'id'=cl.class_ref and c->>'grade'=cl.grade) then raise exception 'Class is not available in the existing school class records';end if;
  if not exists(select 1 from public.teacher_class_subjects where school_id=new.school_id and class_id=new.class_id and subject_id=new.subject_id) then raise exception 'Subject is not valid for this class/grade';end if;
  if new.start_date is null and current_setting('schoolshield.assignment_import',true) is distinct from 'approved' then raise exception 'Assignment start date is required';end if;
  if extract(year from new.start_date)<>new.academic_year or (new.end_date is not null and extract(year from new.end_date)<>new.academic_year) then raise exception 'Assignment dates must be in the academic year';end if;
  -- Serialise the class/subject/year to reject races and accidental co-teaching.
  perform pg_advisory_xact_lock(hashtextextended(new.school_id::text||new.class_id::text||new.subject_id::text||new.academic_year::text,0));
  if exists(select 1 from public.teacher_teaching_contexts c where c.school_id=new.school_id and c.class_id=new.class_id and c.subject_id=new.subject_id and c.academic_year=new.academic_year
   and c.teacher_id<>new.teacher_id and coalesce(c.start_date,make_date(c.academic_year,1,1))<=coalesce(new.end_date,make_date(new.academic_year,12,31))
   and coalesce(c.end_date,make_date(c.academic_year,12,31))>=new.start_date) then raise exception 'Another teacher already has this subject/class during these dates; existing school rules do not authorise overlapping co-teaching';end if;
  new.assignment_grade:=cl.grade;new.assigned_by:=actor.id;new.created_at:=now();new.revision:=1;
 end if;
 new.status:=public.teacher_assignment_status(new.start_date,new.end_date,new.academic_year);new.updated_at:=now();return new;
end$$;
create trigger guard_dated_teacher_assignment before insert or update or delete on public.teacher_teaching_contexts for each row execute function public.guard_dated_teacher_assignment();
revoke all on function public.guard_dated_teacher_assignment() from public,anon,authenticated;

create function public.audit_and_notify_teacher_assignment() returns trigger
language plpgsql security definer set search_path=public as $$
declare subject_name text;class_name text;actor_name text;
begin
 insert into public.teacher_assignment_history(school_id,assignment_id,teacher_id,action,previous_value,new_value,reason,changed_by)
 values(new.school_id,new.id,new.teacher_id,case when tg_op='INSERT' then 'Assignment created' else 'Assignment ended/updated' end,
  case when tg_op='UPDATE' then to_jsonb(old) end,to_jsonb(new),coalesce(nullif(current_setting('schoolshield.assignment_reason',true),''),'Approved teaching assignment'),auth.uid());
 if tg_op='INSERT' then
  select name into subject_name from public.teacher_review_subjects where id=new.subject_id;
  select class_ref into class_name from public.teacher_review_classes where id=new.class_id;
  select display_name into actor_name from public.profiles where id=auth.uid();
  insert into public.account_request_notifications(school_id,recipient_id,notification_type,assignment_id,payload)
  values(new.school_id,new.teacher_id,'teaching_assignment',new.id,jsonb_build_object('title','New Teaching Assignment',
   'description',format('You have been assigned to teach %s — %s / Class %s for the %s academic year.',subject_name,new.assignment_grade,class_name,new.academic_year),
   'subject',subject_name,'grade',new.assignment_grade,'class',class_name,'academicYear',new.academic_year,'assignedBy',actor_name,'assignedById',auth.uid(),'assignmentDate',now()))
  on conflict do nothing;
 end if;
 return new;
end$$;
create trigger audit_and_notify_teacher_assignment after insert or update on public.teacher_teaching_contexts for each row execute function public.audit_and_notify_teacher_assignment();
revoke all on function public.audit_and_notify_teacher_assignment() from public,anon,authenticated;

create function public.assign_teacher_subject_class(p_teacher uuid,p_subject uuid,p_class uuid,p_year integer,p_start date,p_end date default null,p_notes text default '') returns uuid
language plpgsql security definer set search_path=public as $$
declare result uuid;tenant uuid:=public.current_school_id();
begin
 if not public.can_manage_teacher_performance(tenant) then raise exception 'Assignment management access denied';end if;
 if exists(select 1 from public.teacher_teaching_contexts where school_id=tenant and teacher_id=p_teacher and subject_id=p_subject and class_id=p_class and academic_year=p_year) then raise exception 'This teacher/subject/grade/class/year assignment already exists';end if;
 insert into public.teacher_teaching_contexts(school_id,teacher_id,subject_id,class_id,academic_year,start_date,end_date,notes,assignment_source)
 values(tenant,p_teacher,p_subject,p_class,p_year,p_start,p_end,coalesce(p_notes,''),'Principal/Deputy approved assignment') returning id into result;
 return result;
exception when unique_violation then raise exception 'This exact teaching assignment already exists';
end$$;
create or replace function public.link_teacher_review_context(p_teacher uuid,p_subject uuid,p_class uuid,p_year integer) returns uuid
language plpgsql security definer set search_path=public as $$
begin
 raise exception 'Use Assign Subject & Class with an explicit start date';
end$$;

create function public.end_teacher_assignment(p_assignment uuid,p_end date,p_expected_revision integer,p_reason text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare c public.teacher_teaching_contexts%rowtype;
begin
 if not public.can_manage_teacher_performance(public.current_school_id()) then raise exception 'Assignment management access denied';end if;
 select * into c from public.teacher_teaching_contexts where id=p_assignment and school_id=public.current_school_id() for update;
 if c.id is null then raise exception 'Assignment is not in your school';end if;
 if c.revision is distinct from p_expected_revision then raise exception 'Assignment changed; reload before ending' using errcode='40001';end if;
 if p_end is null or extract(year from p_end)<>c.academic_year or p_end<coalesce(c.start_date,make_date(c.academic_year,1,1)) then raise exception 'Choose a valid end date in the assignment year';end if;
 perform set_config('schoolshield.assignment_reason',p_reason,true);
 update public.teacher_teaching_contexts set end_date=p_end where id=c.id returning * into c;
 perform set_config('schoolshield.assignment_reason','',true);return to_jsonb(c);
end$$;

create function public.set_teacher_review_term_dates(p_year integer,p_term integer,p_start date,p_end date) returns void
language plpgsql security definer set search_path=public as $$
declare tenant uuid:=public.current_school_id();
begin
 if not public.can_manage_teacher_performance(tenant) then raise exception 'Term management access denied';end if;
 perform pg_advisory_xact_lock(hashtextextended(tenant::text||p_year::text,0));
 if exists(select 1 from public.teacher_review_terms where school_id=tenant and academic_year=p_year
   and ((term<p_term and end_date>=p_start) or (term>p_term and start_date<=p_end))) then raise exception 'School term dates must be chronological and cannot overlap';end if;
 insert into public.teacher_review_terms(school_id,academic_year,term,start_date,end_date,updated_by)
 values(tenant,p_year,p_term,p_start,p_end,auth.uid()) on conflict(school_id,academic_year,term) do update set start_date=excluded.start_date,end_date=excluded.end_date,updated_by=auth.uid(),updated_at=now();
end$$;

-- Do not infer term boundaries from months or fabricate DBE school calendars.
create function public.capture_review_assignment() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if exists(select 1 from public.teacher_performance_reviews where teaching_context_id=new.teaching_context_id and term=new.term and academic_year=new.academic_year and status<>'Not Started') then return new;end if;
 if not public.teacher_assignment_in_term(new.teaching_context_id,new.term,false) then raise exception 'This assignment does not cover the selected term; configure the school term dates first';end if;
  select to_jsonb(c)||jsonb_build_object('subject',s.name,'class',cl.class_ref,'grade',c.assignment_grade,
    'termPeriod',(select to_jsonb(t) from public.teacher_review_terms t where t.school_id=c.school_id and t.academic_year=c.academic_year and t.term=new.term)) into new.assignment_snapshot
 from public.teacher_teaching_contexts c join public.teacher_review_subjects s on s.id=c.subject_id join public.teacher_review_classes cl on cl.id=c.class_id where c.id=new.teaching_context_id;
 return new;
end$$;

-- Catalogue sync reuses existing SchoolShield phase choices, explicit class
-- subjects and assessment subjects. These are subject choices, not fake marks.
alter function public.sync_teacher_review_catalogue() rename to sync_teacher_review_catalogue_base;
revoke all on function public.sync_teacher_review_catalogue_base() from public,anon,authenticated;
create function public.sync_teacher_review_catalogue() returns void
language plpgsql security definer set search_path=public as $$
declare tenant uuid:=public.current_school_id();workspace jsonb;item jsonb;teacher uuid;subject uuid;cl uuid;year_text text;start_text text;end_text text;
begin
 if not public.can_manage_teacher_performance(tenant) then raise exception 'Assignment management access denied';end if;
 perform public.sync_teacher_review_catalogue_base();
 select payload into workspace from public.school_workspaces where school_id=tenant;
 insert into public.teacher_review_subjects(school_id,name)
 select distinct tenant,name from public.teacher_review_classes c cross join lateral unnest(case
  when substring(c.grade from '[0-9]+')::integer between 1 and 9 then array['Mathematics','Natural Sciences','English','Sesotho','Social Sciences','Technology','Life Orientation']
  when substring(c.grade from '[0-9]+')::integer between 10 and 12 then array['Mathematics','Physics','Life Sciences','Sesotho','English','Life Orientation','Computer Applications Technology','History'] else '{}'::text[] end) name
 where c.school_id=tenant on conflict do nothing;
 insert into public.teacher_review_subjects(school_id,name)
 select distinct tenant,btrim(subject_name) from jsonb_array_elements(coalesce(workspace->'classes','[]')) c
 cross join lateral jsonb_array_elements_text(case when jsonb_typeof(c->'subjects')='array' then c->'subjects' else '[]' end) subject_name
 where btrim(subject_name)<>'' on conflict do nothing;
 insert into public.teacher_review_subjects(school_id,name)
 select distinct tenant,btrim(a->>'subject') from jsonb_array_elements(coalesce(workspace->'teacherAssignments','[]')) a
 where a->>'status'='Approved' and coalesce(btrim(a->>'subject'),'')<>''
  and exists(select 1 from public.teacher_review_classes where school_id=tenant and class_ref=coalesce(a->>'class',a->>'classId')) on conflict do nothing;
 insert into public.teacher_class_subjects(school_id,class_id,subject_id,source)
 select tenant,c.id,s.id,'Existing SchoolShield phase catalogue' from public.teacher_review_classes c join public.teacher_review_subjects s on s.school_id=c.school_id
 where c.school_id=tenant and s.name=any(case
  when substring(c.grade from '[0-9]+')::integer between 1 and 9 then array['Mathematics','Natural Sciences','English','Sesotho','Social Sciences','Technology','Life Orientation']
  when substring(c.grade from '[0-9]+')::integer between 10 and 12 then array['Mathematics','Physics','Life Sciences','Sesotho','English','Life Orientation','Computer Applications Technology','History'] else '{}'::text[] end) on conflict do nothing;
 insert into public.teacher_class_subjects(school_id,class_id,subject_id,source)
 select distinct tenant,c.id,s.id,'Existing class/assessment subject' from public.teacher_review_classes c join public.teacher_review_subjects s on s.school_id=c.school_id
 where c.school_id=tenant and (exists(select 1 from jsonb_array_elements(coalesce(workspace->'assessments','[]')) a where a->>'class'=c.class_ref and a->>'subject'=s.name)
  or exists(select 1 from jsonb_array_elements(coalesce(workspace->'classes','[]')) raw where raw->>'id'=c.class_ref and coalesce(raw->'subjects','[]') ? s.name)) on conflict do nothing;
 insert into public.teacher_class_subjects(school_id,class_id,subject_id,source)
 select distinct tenant,c.id,s.id,'Existing explicitly approved class/subject assignment'
 from jsonb_array_elements(coalesce(workspace->'teacherAssignments','[]')) a
 join public.teacher_review_classes c on c.school_id=tenant and c.class_ref=coalesce(a->>'class',a->>'classId')
 join public.teacher_review_subjects s on s.school_id=tenant and s.name=btrim(a->>'subject')
 where a->>'status'='Approved' and exists(select 1 from public.profiles p where p.school_id=tenant and p.role='teacher' and
  (p.id::text=coalesce(a->>'teacherId',a->>'profileId') or
    (coalesce(a->>'teacherId',a->>'profileId','')='' and p.display_name=a->>'teacher'
      and (select count(*) from public.profiles q where q.school_id=tenant and q.role='teacher' and q.display_name=p.display_name)=1))) on conflict do nothing;
 insert into public.teacher_class_subjects(school_id,class_id,subject_id,source)
 select school_id,class_id,subject_id,'Existing approved teaching link' from public.teacher_teaching_contexts where school_id=tenant on conflict do nothing;
 -- Import only explicit approved subject/class/year mappings. Class teacher
 -- approvals lacking a subject are deliberately not expanded to all subjects.
 perform set_config('schoolshield.assignment_import','approved',true);
 for item in select value from jsonb_array_elements(coalesce(workspace->'teacherAssignments','[]')) where value->>'status'='Approved' and coalesce(value->>'subject','')<>'' loop
  year_text:=coalesce(item->>'academic_year',item->>'academicYear',item->>'year');
  if year_text is null or year_text !~ '^[0-9]{4}$' or year_text::integer not between 1900 and 2200 then continue;end if;
  teacher:=null;
  select p.id into teacher from public.profiles p where p.school_id=tenant and p.role='teacher' and
   (p.id::text=coalesce(item->>'teacherId',item->>'profileId') or
    (coalesce(item->>'teacherId',item->>'profileId','')='' and p.display_name=item->>'teacher'
     and (select count(*) from public.profiles q where q.school_id=tenant and q.role='teacher' and q.display_name=p.display_name)=1));
  select id into cl from public.teacher_review_classes where school_id=tenant and class_ref=coalesce(item->>'class',item->>'classId');
  select id into subject from public.teacher_review_subjects where school_id=tenant and name=btrim(item->>'subject');
  if teacher is null or cl is null or subject is null or not exists(select 1 from public.teacher_class_subjects where school_id=tenant and class_id=cl and subject_id=subject) then continue;end if;
  if exists(select 1 from public.teacher_teaching_contexts where school_id=tenant and teacher_id=teacher and class_id=cl and subject_id=subject and academic_year=year_text::integer) then continue;end if;
  start_text:=coalesce(item->>'start_date',item->>'startDate');end_text:=coalesce(item->>'end_date',item->>'endDate');
  begin
   insert into public.teacher_teaching_contexts(school_id,teacher_id,subject_id,class_id,academic_year,start_date,end_date,notes,assignment_source)
   values(tenant,teacher,subject,cl,year_text::integer,nullif(start_text,'')::date,nullif(end_text,'')::date,'Imported explicit approved assignment; missing legacy dates remain unknown.','Existing approved subject/class assignment');
  exception when invalid_datetime_format or datetime_field_overflow or check_violation or raise_exception then
   -- Keep the source record untouched; leadership can confirm invalid dates.
   continue;
  end;
 end loop;
 perform set_config('schoolshield.assignment_import','',true);
end$$;
revoke all on function public.sync_teacher_review_catalogue() from public,anon;
grant execute on function public.sync_teacher_review_catalogue() to authenticated;

alter function public.get_teacher_performance_directory(integer) rename to get_teacher_performance_directory_base;
revoke all on function public.get_teacher_performance_directory_base(integer) from public,anon,authenticated;
create function public.get_teacher_performance_directory(p_year integer) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare data jsonb;
begin
 data:=public.get_teacher_performance_directory_base(p_year);
 return data||jsonb_build_object('contexts',public.get_teacher_assignments(p_year),
 'classSubjects',coalesce((select jsonb_agg(to_jsonb(s)) from public.teacher_class_subjects s where school_id=public.current_school_id()),'[]'),
 'termPeriods',coalesce((select jsonb_agg(to_jsonb(t) order by term) from public.teacher_review_terms t where school_id=public.current_school_id() and academic_year=p_year),'[]'),
 'unmappedClassApprovals',(select count(*) from public.school_workspaces w cross join lateral jsonb_array_elements(coalesce(w.payload->'teacherAssignments','[]')) a
   where w.school_id=public.current_school_id() and a->>'status'='Approved' and coalesce(a->>'subject','')=''),
 'unmappedSubjectApprovals',(select count(*) from public.school_workspaces w cross join lateral jsonb_array_elements(coalesce(w.payload->'teacherAssignments','[]')) a
   where w.school_id=public.current_school_id() and a->>'status'='Approved' and coalesce(a->>'subject','')<>'' and not exists(
    select 1 from public.teacher_teaching_contexts c join public.teacher_review_subjects s on s.id=c.subject_id
     join public.teacher_review_classes cl on cl.id=c.class_id join public.profiles p on p.id=c.teacher_id
    where c.school_id=w.school_id and s.name=btrim(a->>'subject') and cl.class_ref=coalesce(a->>'class',a->>'classId')
     and c.academic_year::text=coalesce(a->>'academic_year',a->>'academicYear',a->>'year')
     and (p.id::text=coalesce(a->>'teacherId',a->>'profileId') or (coalesce(a->>'teacherId',a->>'profileId','')='' and p.display_name=a->>'teacher')))));
end$$;

-- Existing class-teacher requests stay available to Clerk. Only trusted
-- leadership can change the approved subset that is imported as assignments.
-- This closes a self-assignment path through legacy workspace JSON.
create function public.protect_approved_workspace_assignments() returns trigger
language plpgsql security definer set search_path=public as $$
declare old_approved jsonb;new_approved jsonb;
begin
 if auth.uid() is null or public.can_manage_teacher_performance(new.school_id) then return new;end if;
 select coalesce(jsonb_agg(a order by a::text),'[]') into old_approved from jsonb_array_elements(coalesce(old.payload->'teacherAssignments','[]')) a where a->>'status'='Approved';
 select coalesce(jsonb_agg(a order by a::text),'[]') into new_approved from jsonb_array_elements(coalesce(new.payload->'teacherAssignments','[]')) a where a->>'status'='Approved';
 if old_approved is distinct from new_approved then raise exception 'Only Principal/Deputy can approve or change teaching assignments';end if;
 return new;
end$$;
create trigger protect_approved_workspace_assignments before update on public.school_workspaces for each row execute function public.protect_approved_workspace_assignments();
revoke all on function public.protect_approved_workspace_assignments() from public,anon,authenticated;
revoke all on function public.get_teacher_performance_directory(integer) from public,anon;
grant execute on function public.get_teacher_performance_directory(integer) to authenticated;

alter function public.get_my_teacher_performance(integer,integer) rename to get_my_teacher_performance_base;
revoke all on function public.get_my_teacher_performance_base(integer,integer) from public,anon,authenticated;
create function public.get_my_teacher_performance(p_year integer,p_term integer) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare data jsonb;
begin
 data:=public.get_my_teacher_performance_base(p_year,p_term);
 return coalesce((select jsonb_agg(c||jsonb_build_object('assignment',a,
   'subject',coalesce(c->'review'->'assignment_snapshot'->>'subject',c->>'subject'),
   'grade',coalesce(c->'review'->'assignment_snapshot'->>'grade',a->>'grade',c->>'grade'),
   'class',coalesce(c->'review'->'assignment_snapshot'->>'class',c->>'class'))) from jsonb_array_elements(data) c
  join jsonb_array_elements(public.get_teacher_assignments(p_year)) a on a->>'id'=c->>'id'
  where public.teacher_assignment_in_term((c->>'id')::uuid,p_term)),'[]');
end$$;
revoke all on function public.get_my_teacher_performance(integer,integer) from public,anon;
grant execute on function public.get_my_teacher_performance(integer,integer) to authenticated;

alter function public.get_teacher_performance_overview(integer,integer,jsonb) rename to get_teacher_performance_overview_base;
revoke all on function public.get_teacher_performance_overview_base(integer,integer,jsonb) from public,anon,authenticated;
create function public.get_teacher_performance_overview(p_year integer,p_term integer,p_filters jsonb default '{}') returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare data jsonb;contexts jsonb;
begin
 data:=public.get_teacher_performance_overview_base(p_year,p_term,p_filters);
 select coalesce(jsonb_agg(c||jsonb_build_object('assignment',a,
   'subject',coalesce(c->'review'->'assignment_snapshot'->>'subject',c->>'subject'),
   'grade',coalesce(c->'review'->'assignment_snapshot'->>'grade',a->>'grade',c->>'grade'),
   'class',coalesce(c->'review'->'assignment_snapshot'->>'class',c->>'class'))),'[]') into contexts
 from jsonb_array_elements(data->'contexts') c join jsonb_array_elements(public.get_teacher_assignments(p_year)) a on a->>'id'=c->>'id'
 where public.teacher_assignment_in_term((c->>'id')::uuid,p_term);
 return data||jsonb_build_object('contexts',contexts);
end$$;
revoke all on function public.get_teacher_performance_overview(integer,integer,jsonb) from public,anon;
grant execute on function public.get_teacher_performance_overview(integer,integer,jsonb) to authenticated;
create trigger capture_review_assignment before insert on public.teacher_performance_reviews for each row execute function public.capture_review_assignment();
revoke all on function public.capture_review_assignment() from public,anon,authenticated;

create function public.get_teacher_assignments(p_year integer default null) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare tenant uuid:=public.current_school_id();
begin
 if public.current_app_role() is distinct from 'teacher' and not public.can_manage_teacher_performance(tenant) then raise exception 'Assignment access denied';end if;
 return coalesce((select jsonb_agg(to_jsonb(c)||jsonb_build_object('subject',s.name,'class',cl.class_ref,'grade',c.assignment_grade,
  'teacherName',p.display_name,'status',public.teacher_assignment_status(c.start_date,c.end_date,c.academic_year),
  'eligibleTerms',(select coalesce(jsonb_agg(n),'[]') from generate_series(1,4) n where public.teacher_assignment_in_term(c.id,n))) order by c.academic_year desc,s.name,cl.class_ref)
 from public.teacher_teaching_contexts c join public.teacher_review_subjects s on s.id=c.subject_id
 join public.teacher_review_classes cl on cl.id=c.class_id join public.profiles p on p.id=c.teacher_id
 where c.school_id=tenant and (p_year is null or c.academic_year=p_year)
 and (public.can_manage_teacher_performance(tenant) or c.teacher_id=auth.uid())),'[]');
end$$;

revoke all on function public.assign_teacher_subject_class(uuid,uuid,uuid,integer,date,date,text),public.end_teacher_assignment(uuid,date,integer,text),public.set_teacher_review_term_dates(integer,integer,date,date),public.get_teacher_assignments(integer) from public,anon;
grant execute on function public.assign_teacher_subject_class(uuid,uuid,uuid,integer,date,date,text),public.end_teacher_assignment(uuid,date,integer,text),public.set_teacher_review_term_dates(integer,integer,date,date),public.get_teacher_assignments(integer) to authenticated;

do $$begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='account_request_notifications') then
   alter publication supabase_realtime add table public.account_request_notifications;
  end if;
 end if;
end$$;
