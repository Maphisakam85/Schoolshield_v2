-- A linked family may see teaching assignments, not arbitrary staff profiles.
create function public.get_learner_subject_teachers(p_learner uuid)
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
  where t.school_id=learner.school_id and t.class_id=learner.class_id;
  return result;
end $$;
revoke all on function public.get_learner_subject_teachers(uuid) from public,anon;
grant execute on function public.get_learner_subject_teachers(uuid) to authenticated;
