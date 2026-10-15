-- Preserve the explicitly reported erroneous pilot context and its history.
-- This does not impose a global cutoff on legitimate historical school years.
create table public.teacher_performance_archives (
  context_id uuid primary key references public.teacher_teaching_contexts(id),
  school_id uuid not null references public.schools(id),
  reason text not null, archived_at timestamptz not null default now(),
  recorded_by text not null, original_records jsonb not null
);
alter table public.teacher_performance_archives enable row level security;
revoke all on public.teacher_performance_archives from anon,authenticated;
grant select on public.teacher_performance_archives to authenticated;
create policy management_archive_reads on public.teacher_performance_archives
for select to authenticated using(account_is_ready() and school_id=current_school_id() and current_app_role() in ('principal','deputy'));

insert into public.teacher_performance_archives(context_id,school_id,reason,recorded_by,original_records)
select c.id,c.school_id,'Pilot administrator reported unintended 1998 performance data. Excluded from working views; original records and audit retained.',
  'migration:20261014270000',jsonb_build_object('context',to_jsonb(c),'reviews',coalesce((select jsonb_agg(to_jsonb(r)) from teacher_performance_reviews r where r.teaching_context_id=c.id),'[]'))
from teacher_teaching_contexts c join schools s on s.id=c.school_id
where c.id='4b9d6875-a34c-4f4d-8fda-d29fd3657b39' and c.academic_year=1998 and s.code='SMM-001';

alter function public.get_teacher_assignments(integer) rename to get_teacher_assignments_before_archive;
revoke all on function public.get_teacher_assignments_before_archive(integer) from public,anon,authenticated;
create function public.get_teacher_assignments(p_year integer default null) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare result jsonb;
begin
  result:=get_teacher_assignments_before_archive(p_year);
  return coalesce((select jsonb_agg(c) from jsonb_array_elements(result) c
    where not exists(select 1 from teacher_performance_archives a where a.context_id::text=c->>'id')),'[]');
end $$;
revoke all on function public.get_teacher_assignments(integer) from public,anon;
grant execute on function public.get_teacher_assignments(integer) to authenticated;

alter function public.get_teacher_performance_directory(integer) rename to get_teacher_performance_directory_before_archive;
revoke all on function public.get_teacher_performance_directory_before_archive(integer) from public,anon,authenticated;
create function public.get_teacher_performance_directory(p_year integer) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare result jsonb;
begin
  result:=get_teacher_performance_directory_before_archive(p_year);
  result:=jsonb_set(result,'{contexts}',coalesce((select jsonb_agg(c) from jsonb_array_elements(result->'contexts') c where not exists(select 1 from teacher_performance_archives a where a.context_id::text=c->>'id')),'[]'));
  result:=jsonb_set(result,'{reviews}',coalesce((select jsonb_agg(r) from jsonb_array_elements(result->'reviews') r where not exists(select 1 from teacher_performance_archives a where a.context_id::text=r->>'teaching_context_id')),'[]'));
  return result;
end $$;
revoke all on function public.get_teacher_performance_directory(integer) from public,anon;
grant execute on function public.get_teacher_performance_directory(integer) to authenticated;

alter function public.get_teacher_performance_overview(integer,integer,jsonb) rename to get_teacher_performance_overview_before_archive;
revoke all on function public.get_teacher_performance_overview_before_archive(integer,integer,jsonb) from public,anon,authenticated;
create function public.get_teacher_performance_overview(p_year integer,p_term integer,p_filters jsonb default '{}') returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare result jsonb;
begin
  result:=get_teacher_performance_overview_before_archive(p_year,p_term,p_filters);
  return jsonb_set(result,'{contexts}',coalesce((select jsonb_agg(c) from jsonb_array_elements(result->'contexts') c where not exists(select 1 from teacher_performance_archives a where a.context_id::text=c->>'id')),'[]'));
end $$;
revoke all on function public.get_teacher_performance_overview(integer,integer,jsonb) from public,anon;
grant execute on function public.get_teacher_performance_overview(integer,integer,jsonb) to authenticated;

alter function public.get_teacher_performance_history(uuid,integer) rename to get_teacher_performance_history_before_archive;
revoke all on function public.get_teacher_performance_history_before_archive(uuid,integer) from public,anon,authenticated;
create function public.get_teacher_performance_history(p_teacher uuid,p_year integer) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare result jsonb;
begin
  result:=get_teacher_performance_history_before_archive(p_teacher,p_year);
  result:=jsonb_set(result,'{years}',coalesce((select jsonb_agg(y order by y desc) from (
    select distinct c.academic_year y from teacher_teaching_contexts c
    where c.school_id=current_school_id() and c.teacher_id=p_teacher
    and not exists(select 1 from teacher_performance_archives a where a.context_id=c.id)
  ) years),'[]'));
  result:=jsonb_set(result,'{events}',coalesce((select jsonb_agg(e) from jsonb_array_elements(result->'events') e where not exists(select 1 from teacher_performance_reviews r join teacher_performance_archives a on a.context_id=r.teaching_context_id where r.id::text=e->>'review_id')),'[]'));
  result:=jsonb_set(result,'{reviewHistory}',coalesce((select jsonb_agg(h) from jsonb_array_elements(result->'reviewHistory') h where not exists(select 1 from teacher_performance_reviews r join teacher_performance_archives a on a.context_id=r.teaching_context_id where r.id::text=h->>'review_id')),'[]'));
  return result;
end $$;
revoke all on function public.get_teacher_performance_history(uuid,integer) from public,anon;
grant execute on function public.get_teacher_performance_history(uuid,integer) to authenticated;

alter function public.get_my_teacher_performance(integer,integer) rename to get_my_teacher_performance_before_archive;
revoke all on function public.get_my_teacher_performance_before_archive(integer,integer) from public,anon,authenticated;
create function public.get_my_teacher_performance(p_year integer,p_term integer) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare result jsonb;
begin
  result:=get_my_teacher_performance_before_archive(p_year,p_term);
  return coalesce((select jsonb_agg(c) from jsonb_array_elements(result) c
    where not exists(select 1 from teacher_performance_archives a where a.context_id::text=c->>'id')),'[]');
end $$;
revoke all on function public.get_my_teacher_performance(integer,integer) from public,anon;
grant execute on function public.get_my_teacher_performance(integer,integer) to authenticated;

create or replace function public.get_learner_subject_teachers(p_learner uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare learner public.school_learners; result jsonb;
begin
  select * into learner from school_learners where id=p_learner and school_id=current_school_id();
  if learner.id is null or not can_access_learner_reference(learner.school_id,learner.legacy_ref) then
    raise exception 'Learner access denied' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'assignmentId',t.id,'teacherId',t.teacher_id,'teacherName',p.display_name,
    'subjectId',t.subject_id,'subject',s.name,'classId',t.class_id,
    'academicYear',t.academic_year,'startDate',t.start_date,'endDate',t.end_date,'status',t.status
  ) order by s.name,p.display_name),'[]') into result
  from teacher_teaching_contexts t
  join profiles p on p.id=t.teacher_id and p.school_id=t.school_id
  join teacher_review_subjects s on s.id=t.subject_id and s.school_id=t.school_id
  where t.school_id=learner.school_id and t.class_id=learner.class_id
  and not exists(select 1 from teacher_performance_archives a where a.context_id=t.id);
  return result;
end $$;
