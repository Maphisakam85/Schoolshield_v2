-- Academic evidence per existing teacher/subject/class/term review, not a teacher rating.
create unique index teacher_reviews_school_identity on public.teacher_performance_reviews(school_id,id);
create table public.teacher_performance_subjects (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id),
  review_id uuid not null unique, subject_id uuid not null, subject text not null,
  grade text not null, class_id uuid not null,
  baseline_assessment_id text,
  baseline_average numeric(7,2),current_average numeric(7,2),previous_term_average numeric(7,2),pass_rate numeric(7,2),
  number_of_learners integer not null,learners_with_marks integer not null,
  learners_improving integer,learners_declining integer,learners_at_risk integer,
  comparable_learners integer not null,comparison_baseline_average numeric(7,2),comparison_current_average numeric(7,2),improvement_percentage_points numeric(7,2),
  curriculum_coverage numeric(5,2) check(curriculum_coverage between 0 and 100),
  assessments_planned integer,assessments_completed integer,marks_outstanding integer,
  reviewer_comment text check(length(reviewer_comment)<=4000),
  pass_threshold numeric(5,2) not null default 50,
  calculation_details jsonb not null,updated_by uuid not null references public.profiles(id),updated_at timestamptz not null default now(),
  foreign key(school_id,review_id) references public.teacher_performance_reviews(school_id,id) on delete cascade,
  foreign key(school_id,subject_id) references public.teacher_review_subjects(school_id,id),
  foreign key(school_id,class_id) references public.teacher_review_classes(school_id,id)
);
alter table public.teacher_performance_subjects enable row level security;
create policy "leadership reads subject performance" on public.teacher_performance_subjects for select to authenticated
  using(public.can_manage_teacher_performance(school_id));
create policy "teachers read own shared subject performance" on public.teacher_performance_subjects for select to authenticated
  using(exists(select 1 from public.teacher_performance_reviews r where r.id=review_id and r.school_id=teacher_performance_subjects.school_id
    and r.teacher_id=auth.uid() and public.current_app_role()='teacher' and r.status in ('Awaiting Teacher Acknowledgement','Completed')));
grant select on public.teacher_performance_subjects to authenticated;
revoke insert,update,delete on public.teacher_performance_subjects from authenticated,anon;

-- SchoolShield's mark entry stores percentages (0..100), including when totalMarks differs.
create function public.teacher_review_valid_score(p_value jsonb) returns numeric
language plpgsql immutable set search_path=public as $$
declare value text:=btrim(p_value#>>'{}'); result numeric;
begin
  if value is null or length(value)>20 or value !~ '^[0-9]+([.][0-9]+)?$' then return null; end if;
  result:=value::numeric;return case when result between 0 and 100 then result end;
end;
$$;
create function public.teacher_review_assessment_period(p_assessment jsonb) returns jsonb
language plpgsql immutable set search_path=public as $$
declare year_value text;term_value text;
begin
  year_value:=coalesce(p_assessment->>'academic_year',p_assessment->>'academicYear',p_assessment->>'year');
  if year_value is null then year_value:=substring(p_assessment->>'date' from '[12][0-9]{3}'); end if;
  term_value:=regexp_replace(lower(btrim(p_assessment->>'term')),'^term[[:space:]]*','');
  if coalesce(year_value,'') !~ '^[12][0-9]{3}$' or coalesce(term_value,'') !~ '^[1-4]$' then return null; end if;
  return jsonb_build_object('year',year_value::integer,'term',term_value::integer);
end;
$$;
create function public.calculate_teacher_subject_evidence(p_workspace jsonb,p_class text,p_subject text,p_year integer,p_term integer,p_baseline text default null)
returns jsonb language plpgsql set search_path=public as $$
declare a jsonb; period jsonb; learner jsonb; learner_id text; score numeric; weight numeric; weighted boolean;
  planned jsonb:='[]';current_tasks jsonb:='[]';previous_tasks jsonb:='[]';baseline jsonb;
  current_marks jsonb:='{}';previous_marks jsonb:='{}';baseline_marks jsonb:='{}';candidates jsonb:='[]';
  weighted_sum numeric;weight_sum numeric;average_value numeric;current_sum numeric:=0;previous_sum numeric:=0;baseline_sum numeric:=0;paired_base numeric:=0;paired_current numeric:=0;
  roster integer:=0;marked integer:=0;previous_marked integer:=0;baseline_marked integer:=0;paired integer:=0;improving integer:=0;declining integer:=0;passing integer:=0;risk integer:=0;outstanding integer:=0;ignored integer:=0;
  previous_year integer:=case when p_term=1 then p_year-1 else p_year end;previous_term integer:=case when p_term=1 then 4 else p_term-1 end;
begin
  for a in select value from jsonb_array_elements(coalesce(p_workspace->'assessments','[]')) loop
    if a->>'class' is distinct from p_class or a->>'subject' is distinct from p_subject then continue; end if;
    period:=public.teacher_review_assessment_period(a);
    if period is null then ignored:=ignored+1;continue; end if;
    if (period->>'year')::integer=p_year and (period->>'term')::integer=p_term then
      planned:=planned||jsonb_build_array(a);
      if lower(coalesce(a->>'status','')) in ('submitted','completed','finalised','published') then
        candidates:=candidates||jsonb_build_array(jsonb_build_object('id',a->>'id','title',coalesce(a->>'title',a->>'id')));
        if p_baseline is not null and a->>'id'=p_baseline then baseline:=a;
        else current_tasks:=current_tasks||jsonb_build_array(a); end if;
      end if;
    elsif (period->>'year')::integer=previous_year and (period->>'term')::integer=previous_term and lower(coalesce(a->>'status','')) in ('submitted','completed','finalised','published') then
      previous_tasks:=previous_tasks||jsonb_build_array(a);
    end if;
  end loop;
  if p_baseline is not null and baseline is null then raise exception 'Baseline must be a submitted assessment for this subject, class, year and term'; end if;
  for learner in select value from jsonb_array_elements(coalesce(p_workspace->'learners','[]')) where value->>'class'=p_class loop
    roster:=roster+1;learner_id:=learner->>'id';
    score:=public.teacher_review_valid_score(baseline->'scores'->learner_id);
    if score is not null then baseline_marks:=baseline_marks||jsonb_build_object(learner_id,score);baseline_sum:=baseline_sum+score;baseline_marked:=baseline_marked+1; end if;
    -- If any assessment lacks a valid weighting, use equal weights throughout that period.
    select not exists(select 1 from jsonb_array_elements(current_tasks) t where public.teacher_review_valid_score(t->'weighting') is null or public.teacher_review_valid_score(t->'weighting')=0) into weighted;
    weighted_sum:=0;weight_sum:=0;
    for a in select value from jsonb_array_elements(current_tasks) loop
      score:=public.teacher_review_valid_score(a->'scores'->learner_id);
      if score is not null then weight:=case when weighted then public.teacher_review_valid_score(a->'weighting') else 1 end;weighted_sum:=weighted_sum+score*weight;weight_sum:=weight_sum+weight; end if;
    end loop;
    if weight_sum>0 then
      average_value:=weighted_sum/weight_sum;current_marks:=current_marks||jsonb_build_object(learner_id,average_value);current_sum:=current_sum+average_value;marked:=marked+1;
      if average_value>=50 then passing:=passing+1;else risk:=risk+1; end if;
      score:=public.teacher_review_valid_score(baseline_marks->learner_id);
      if score is not null then paired:=paired+1;paired_base:=paired_base+score;paired_current:=paired_current+average_value;
        if average_value>score then improving:=improving+1;elsif average_value<score then declining:=declining+1;end if;
      end if;
    end if;
    select not exists(select 1 from jsonb_array_elements(previous_tasks) t where public.teacher_review_valid_score(t->'weighting') is null or public.teacher_review_valid_score(t->'weighting')=0) into weighted;
    weighted_sum:=0;weight_sum:=0;
    for a in select value from jsonb_array_elements(previous_tasks) loop
      score:=public.teacher_review_valid_score(a->'scores'->learner_id);
      if score is not null then weight:=case when weighted then public.teacher_review_valid_score(a->'weighting') else 1 end;weighted_sum:=weighted_sum+score*weight;weight_sum:=weight_sum+weight; end if;
    end loop;
    if weight_sum>0 then previous_sum:=previous_sum+weighted_sum/weight_sum;previous_marked:=previous_marked+1; end if;
    for a in select value from jsonb_array_elements(current_tasks||case when baseline is null then '[]'::jsonb else jsonb_build_array(baseline) end) loop
      if public.teacher_review_valid_score(a->'scores'->learner_id) is null then outstanding:=outstanding+1; end if;
    end loop;
  end loop;
  return jsonb_build_object('baseline_assessment_id',p_baseline,
    'baseline_average',round(baseline_sum/nullif(baseline_marked,0),2),'current_average',round(current_sum/nullif(marked,0),2),
    'previous_term_average',round(previous_sum/nullif(previous_marked,0),2),'pass_rate',round(passing*100.0/nullif(marked,0),2),
    'number_of_learners',roster,'learners_with_marks',marked,'learners_improving',case when paired>0 then improving end,'learners_declining',case when paired>0 then declining end,
    'learners_at_risk',case when marked>0 then risk end,'comparable_learners',paired,
    'comparison_baseline_average',round(paired_base/nullif(paired,0),2),'comparison_current_average',round(paired_current/nullif(paired,0),2),
    'improvement_percentage_points',round((paired_current-paired_base)/nullif(paired,0),2),
    'assessments_planned',case when jsonb_array_length(planned)>0 then jsonb_array_length(planned) end,
    'assessments_completed',case when jsonb_array_length(planned)>0 then jsonb_array_length(candidates) end,
    'marks_outstanding',case when jsonb_array_length(candidates)>0 and roster>0 then outstanding end,
    'baseline_candidates',candidates,'calculation_details',jsonb_build_object('ignored_unscoped_assessments',ignored,
      'current_assessment_ids',(select coalesce(jsonb_agg(t->>'id'),'[]') from jsonb_array_elements(current_tasks) t),
      'previous_assessment_ids',(select coalesce(jsonb_agg(t->>'id'),'[]') from jsonb_array_elements(previous_tasks) t),
      'previous_year',previous_year,'previous_term',previous_term,'previous_marked_learners',previous_marked,
      'baseline_marked_learners',baseline_marked,'method','Per-learner weighted mean; equal period weights if any weighting is missing. Baseline excluded from current performance. Improvement uses matched learners only.','pass_threshold',50));
end;
$$;

create function public.refresh_teacher_subject_performance(p_context uuid,p_term integer,p_baseline_id text default null,p_curriculum_coverage numeric default null,p_reviewer_comment text default null,p_update_review_fields boolean default false)
returns jsonb language plpgsql security definer set search_path=public as $$
declare tenant uuid:=public.current_school_id();context public.teacher_teaching_contexts%rowtype;v_review_id uuid;old_metrics public.teacher_performance_subjects%rowtype;
  class_record public.teacher_review_classes%rowtype;subject_record public.teacher_review_subjects%rowtype;workspace jsonb;metrics jsonb;record public.teacher_performance_subjects%rowtype;baseline_id text;coverage numeric;comment_text text;
begin
  if not public.can_manage_teacher_performance(tenant) then raise exception 'Teacher performance management access denied'; end if;
  select * into context from public.teacher_teaching_contexts where id=p_context and school_id=tenant;
  if context.id is null then raise exception 'Teaching context is not in your school'; end if;
  select id into v_review_id from public.teacher_performance_reviews where teaching_context_id=p_context and school_id=tenant and term=p_term;
  if v_review_id is null then v_review_id:=public.set_teacher_term_review_status(p_context,p_term,'Not Started'); end if;
  select * into old_metrics from public.teacher_performance_subjects s where s.review_id=v_review_id;
  baseline_id:=case when p_update_review_fields then p_baseline_id else old_metrics.baseline_assessment_id end;
  coverage:=case when p_update_review_fields then p_curriculum_coverage else old_metrics.curriculum_coverage end;
  comment_text:=case when p_update_review_fields then p_reviewer_comment else old_metrics.reviewer_comment end;
  select * into class_record from public.teacher_review_classes where id=context.class_id;
  select * into subject_record from public.teacher_review_subjects where id=context.subject_id;
  select payload into workspace from public.school_workspaces where school_id=tenant;
  if not p_update_review_fields and baseline_id is not null and not exists(
    select 1 from jsonb_array_elements(coalesce(workspace->'assessments','[]')) a
      where a->>'id'=baseline_id and a->>'class'=class_record.class_ref and a->>'subject'=subject_record.name
      and public.teacher_review_assessment_period(a)=jsonb_build_object('year',context.academic_year,'term',p_term)
      and lower(coalesce(a->>'status','')) in ('submitted','completed','finalised','published')) then baseline_id:=null; end if;
  metrics:=public.calculate_teacher_subject_evidence(coalesce(workspace,'{}'),class_record.class_ref,subject_record.name,context.academic_year,p_term,baseline_id);
  record:=jsonb_populate_record(null::public.teacher_performance_subjects,metrics||jsonb_build_object('school_id',tenant,'review_id',v_review_id,
    'subject_id',subject_record.id,'subject',subject_record.name,'grade',class_record.grade,'class_id',class_record.id,
    'curriculum_coverage',coverage,'reviewer_comment',comment_text,'pass_threshold',50,'updated_by',auth.uid(),'updated_at',now()));
  record.id:=coalesce(old_metrics.id,gen_random_uuid());
  insert into public.teacher_performance_subjects select (record).* on conflict(review_id) do update set
    baseline_assessment_id=excluded.baseline_assessment_id,baseline_average=excluded.baseline_average,current_average=excluded.current_average,
    previous_term_average=excluded.previous_term_average,pass_rate=excluded.pass_rate,number_of_learners=excluded.number_of_learners,
    learners_with_marks=excluded.learners_with_marks,learners_improving=excluded.learners_improving,learners_declining=excluded.learners_declining,
    learners_at_risk=excluded.learners_at_risk,comparable_learners=excluded.comparable_learners,comparison_baseline_average=excluded.comparison_baseline_average,
    comparison_current_average=excluded.comparison_current_average,improvement_percentage_points=excluded.improvement_percentage_points,
    curriculum_coverage=excluded.curriculum_coverage,assessments_planned=excluded.assessments_planned,assessments_completed=excluded.assessments_completed,
    marks_outstanding=excluded.marks_outstanding,reviewer_comment=excluded.reviewer_comment,calculation_details=excluded.calculation_details,
    updated_by=excluded.updated_by,updated_at=excluded.updated_at;
  return to_jsonb(record)||jsonb_build_object('baseline_candidates',metrics->'baseline_candidates');
end;
$$;
revoke all on function public.teacher_review_valid_score(jsonb),public.teacher_review_assessment_period(jsonb),public.calculate_teacher_subject_evidence(jsonb,text,text,integer,integer,text) from public,anon,authenticated;
revoke all on function public.refresh_teacher_subject_performance(uuid,integer,text,numeric,text,boolean) from public,anon;
grant execute on function public.refresh_teacher_subject_performance(uuid,integer,text,numeric,text,boolean) to authenticated;
