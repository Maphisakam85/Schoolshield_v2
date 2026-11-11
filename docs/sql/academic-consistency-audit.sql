-- Read-only consistency audit. No learner/personnel details are returned.
select 'teaching_context_identity_or_tenant_mismatch' as check_name,count(*) as issue_count
from public.teacher_teaching_contexts c
left join public.profiles p on p.id=c.teacher_id and p.school_id=c.school_id
left join public.teacher_review_subjects s on s.id=c.subject_id and s.school_id=c.school_id
left join public.teacher_review_classes cl on cl.id=c.class_id and cl.school_id=c.school_id
where p.id is null or s.id is null or cl.id is null
union all
select 'review_context_or_tenant_mismatch',count(*) from public.teacher_performance_reviews r
left join public.teacher_teaching_contexts c on c.id=r.teaching_context_id and c.school_id=r.school_id and c.teacher_id=r.teacher_id and c.academic_year=r.academic_year where c.id is null
union all
select 'target_context_or_subject_class_mismatch',count(*) from public.teacher_targets t
left join public.teacher_teaching_contexts c on c.id=t.teaching_context_id and c.school_id=t.school_id and c.teacher_id=t.teacher_id and c.academic_year=t.academic_year and c.subject_id=t.subject_id and c.class_id=t.class_id where c.id is null
union all
select 'support_review_or_teacher_mismatch',count(*) from public.teacher_support_actions a
left join public.teacher_performance_reviews r on r.id=a.review_id and r.school_id=a.school_id and r.teacher_id=a.teacher_id where r.id is null
union all
select 'profile_without_school',count(*) from public.profiles p left join public.schools s on s.id=p.school_id where s.id is null;
