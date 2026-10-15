-- Management-set targets remain scoped to one teacher/subject/class/year/term.
create table public.teacher_targets (
  id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id),
  teacher_id uuid not null,teaching_context_id uuid not null,review_id uuid not null,
  academic_year integer not null,term integer not null check(term between 1 and 4),
  subject_id uuid not null,subject text not null,grade text not null,class_id uuid not null,
  target_category text not null check(target_category in ('Learner Achievement','Pass Rate','Learner Improvement','Curriculum Coverage','Assessment Completion','Marks Submission','Learner Support / Intervention','Lesson Planning','Classroom Practice','Professional Development','Extra / Co-curricular','Other')),
  description text not null check(length(btrim(description,E' \t\r\n')) between 1 and 4000),baseline jsonb,target_value jsonb not null,
  measurement_type text not null check(measurement_type in ('Percentage','Percentage Point Improvement','Number','Yes / No','Completion','Qualitative')),
  measurement_source text not null default 'manual' check(measurement_source in ('manual','current_average','pass_rate','improvement_percentage_points','curriculum_coverage','number_of_learners','learners_improving','learners_declining','learners_at_risk','assessments_planned','assessments_completed','marks_outstanding')),
  actual_value numeric,actual_text text check(length(actual_text)<=4000),margin numeric,
  direction text not null default 'Higher is better' check(direction in ('Higher is better','Lower is better')),
  near_tolerance numeric not null default 0 check(near_tolerance>=0),
  due_date date not null,priority text not null default 'Medium' check(priority in ('Low','Medium','High')),
  status text not null,created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),
  updated_by uuid not null references public.profiles(id),updated_at timestamptz not null default now(),revision integer not null default 1,
  foreign key(school_id,teacher_id,teaching_context_id,academic_year) references public.teacher_teaching_contexts(school_id,teacher_id,id,academic_year),
  foreign key(school_id,review_id) references public.teacher_performance_reviews(school_id,id),
  foreign key(school_id,subject_id) references public.teacher_review_subjects(school_id,id),
  foreign key(school_id,class_id) references public.teacher_review_classes(school_id,id)
);
create index teacher_targets_scope on public.teacher_targets(school_id,teacher_id,academic_year,term);
alter table public.teacher_targets enable row level security;
create policy "leadership reads school targets" on public.teacher_targets for select to authenticated
  using(public.can_manage_teacher_performance(school_id));
create policy "teachers read own targets" on public.teacher_targets for select to authenticated
  using(school_id=public.current_school_id() and public.current_app_role()='teacher' and teacher_id=auth.uid());
grant select on public.teacher_targets to authenticated;
revoke insert,update,delete on public.teacher_targets from authenticated,anon;

create function public.calculate_teacher_target_progress(p_type text,p_actual numeric,p_target jsonb,p_tolerance numeric,p_direction text)
returns jsonb language plpgsql immutable set search_path=public as $$
declare delta numeric;favourable numeric;
begin
  if p_type not in ('Percentage','Percentage Point Improvement','Number') then return jsonb_build_object('margin',null,'status',null); end if;
  if p_actual is null then return jsonb_build_object('margin',null,'status','Not Yet Measured'); end if;
  delta:=p_actual-(p_target#>>'{}')::numeric;
  favourable:=case when p_direction='Lower is better' then -delta else delta end;
  return jsonb_build_object('margin',delta,'status',case when favourable>0 then 'Target Exceeded' when favourable=0 then 'Target Achieved'
    when abs(delta)<=p_tolerance then 'Near Target' else 'Below Target' end);
end;
$$;

create function public.guard_teacher_target() returns trigger
language plpgsql security definer set search_path=public as $$
declare actor public.profiles%rowtype;context public.teacher_teaching_contexts%rowtype;review public.teacher_performance_reviews%rowtype;
  metrics public.teacher_performance_subjects%rowtype;result jsonb;numeric_target boolean;target_number numeric;
begin
  select * into actor from public.profiles where id=auth.uid();
  if actor.id is null or actor.role not in ('principal','deputy') or actor.school_id is distinct from new.school_id then raise exception 'Target management access denied'; end if;
  select * into context from public.teacher_teaching_contexts where id=new.teaching_context_id and school_id=actor.school_id;
  if context.id is null or context.teacher_id<>new.teacher_id or context.academic_year<>new.academic_year then raise exception 'Invalid target teaching context'; end if;
  select * into review from public.teacher_performance_reviews where id=new.review_id and school_id=actor.school_id;
  if review.id is null or review.teaching_context_id<>context.id or review.term<>new.term then raise exception 'Invalid target review'; end if;
  if tg_op='UPDATE' and (new.id,new.school_id,new.teacher_id,new.teaching_context_id,new.review_id,new.academic_year,new.term,new.subject_id,new.class_id,new.created_by,new.created_at)
    is distinct from (old.id,old.school_id,old.teacher_id,old.teaching_context_id,old.review_id,old.academic_year,old.term,old.subject_id,old.class_id,old.created_by,old.created_at) then raise exception 'Target scope and creator cannot be changed'; end if;
  if new.subject_id<>context.subject_id or new.class_id<>context.class_id then raise exception 'Invalid target subject/class'; end if;
  new.subject:=(select name from public.teacher_review_subjects where id=context.subject_id);
  new.grade:=(select grade from public.teacher_review_classes where id=context.class_id);
  numeric_target:=new.measurement_type in ('Percentage','Percentage Point Improvement','Number');
  if new.near_tolerance::text in ('NaN','Infinity','-Infinity') or new.actual_value::text in ('NaN','Infinity','-Infinity') then raise exception 'Enter finite numeric values'; end if;
  if numeric_target then
    if jsonb_typeof(new.target_value) is distinct from 'number' or (new.baseline is not null and jsonb_typeof(new.baseline)<>'number') then raise exception 'Numeric targets and baselines require numbers'; end if;
    target_number:=(new.target_value#>>'{}')::numeric;
    if (new.measurement_type='Percentage' and target_number not between 0 and 100) or
       (new.measurement_type='Percentage Point Improvement' and target_number not between -100 and 100) or
       (new.measurement_type='Number' and target_number<0) then raise exception 'Target value is outside the measurement range'; end if;
    if (new.measurement_source in ('current_average','pass_rate','curriculum_coverage') and new.measurement_type<>'Percentage') or
       (new.measurement_source='improvement_percentage_points' and new.measurement_type<>'Percentage Point Improvement') or
       (new.measurement_source in ('number_of_learners','learners_improving','learners_declining','learners_at_risk','assessments_planned','assessments_completed','marks_outstanding') and new.measurement_type<>'Number') then raise exception 'Actual source and measurement units do not match'; end if;
    if new.measurement_source<>'manual' then
      select * into metrics from public.teacher_performance_subjects where review_id=new.review_id and school_id=new.school_id;
      new.actual_value:=(to_jsonb(metrics)->>new.measurement_source)::numeric;
    end if;
    if (new.measurement_type='Percentage' and new.actual_value not between 0 and 100) or
       (new.measurement_type='Percentage Point Improvement' and new.actual_value not between -100 and 100) or
       (new.measurement_type='Number' and new.actual_value<0) then raise exception 'Actual value is outside the measurement range'; end if;
    result:=public.calculate_teacher_target_progress(new.measurement_type,new.actual_value,new.target_value,new.near_tolerance,new.direction);
    new.margin:=(result->>'margin')::numeric;new.status:=result->>'status';
  else
    if new.measurement_source<>'manual' or new.actual_value is not null then raise exception 'Qualitative targets cannot use numeric actuals'; end if;
    if jsonb_typeof(new.target_value) is distinct from 'string' or coalesce(length(btrim(new.target_value#>>'{}')),0) not between 1 and 2000 then raise exception 'Describe the expected target outcome'; end if;
    if new.measurement_type='Yes / No' and (new.target_value#>>'{}') not in ('Yes','No') then raise exception 'Choose Yes or No as the target'; end if;
    if new.status is null or new.status not in ('Not Started','In Progress','Completed','Not Achieved') then raise exception 'Choose a qualitative progress status'; end if;
    new.margin:=null;
  end if;
  if tg_op='INSERT' then new.created_by:=actor.id;new.created_at:=now();new.revision:=1;
  else new.revision:=old.revision+1; end if;
  new.updated_by:=actor.id;new.updated_at:=now();return new;
end;
$$;
create trigger guard_teacher_target before insert or update on public.teacher_targets for each row execute function public.guard_teacher_target();

create function public.save_teacher_target(p_id uuid,p_context uuid,p_term integer,p_details jsonb,p_expected_revision integer default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor public.profiles%rowtype;context public.teacher_teaching_contexts%rowtype;existing public.teacher_targets%rowtype;item public.teacher_targets%rowtype;v_review uuid;
begin
  select * into actor from public.profiles where id=auth.uid();
  if actor.id is null or actor.role not in ('principal','deputy') then raise exception 'Target management access denied'; end if;
  if jsonb_typeof(p_details) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_details) k where k not in
    ('targetCategory','description','baseline','targetValue','measurementType','measurementSource','actualValue','actualText','nearTolerance','direction','dueDate','priority','status')) then raise exception 'Invalid target fields'; end if;
  select * into context from public.teacher_teaching_contexts where id=p_context and school_id=actor.school_id;
  if context.id is null then raise exception 'Teaching context is not in your school'; end if;
  if p_id is not null then perform pg_advisory_xact_lock(hashtextextended(actor.school_id::text||':'||p_id::text,0)); end if;
  select * into existing from public.teacher_targets where id=p_id for update;
  if existing.id is not null then
    if existing.school_id<>actor.school_id or existing.teaching_context_id<>p_context or existing.term<>p_term then raise exception 'Target access denied'; end if;
    if p_expected_revision is distinct from existing.revision then raise exception using errcode='40001',message='This target changed. Reload it before editing; your changes have not been saved'; end if;
  end if;
  if p_details->'actualValue' is not null and p_details->'actualValue'<>'null'::jsonb and jsonb_typeof(p_details->'actualValue')<>'number' then raise exception 'Actual value must be numeric'; end if;
  if coalesce(p_details->>'measurementSource','manual')<>'manual' and nullif(p_details->'actualValue','null') is not null then raise exception 'Calculated actuals cannot be supplied by the client'; end if;
  select id into v_review from public.teacher_performance_reviews where teaching_context_id=p_context and school_id=actor.school_id and term=p_term;
  if v_review is null then v_review:=public.set_teacher_term_review_status(p_context,p_term,'Not Started'); end if;
  item.id:=coalesce(p_id,gen_random_uuid());item.school_id:=actor.school_id;item.teacher_id:=context.teacher_id;item.teaching_context_id:=context.id;item.review_id:=v_review;
  item.academic_year:=context.academic_year;item.term:=p_term;item.subject_id:=context.subject_id;item.class_id:=context.class_id;
  item.target_category:=p_details->>'targetCategory';item.description:=p_details->>'description';item.baseline:=nullif(p_details->'baseline','null');item.target_value:=p_details->'targetValue';
  item.measurement_type:=p_details->>'measurementType';item.measurement_source:=coalesce(p_details->>'measurementSource','manual');
  item.actual_value:=(p_details->>'actualValue')::numeric;item.actual_text:=p_details->>'actualText';item.direction:=coalesce(p_details->>'direction','Higher is better');
  item.near_tolerance:=coalesce((p_details->>'nearTolerance')::numeric,0);item.due_date:=(p_details->>'dueDate')::date;item.priority:=coalesce(p_details->>'priority','Medium');
  item.status:=coalesce(p_details->>'status','Not Started');item.created_by:=coalesce(existing.created_by,actor.id);item.created_at:=coalesce(existing.created_at,now());item.updated_by:=actor.id;
  insert into public.teacher_targets select (item).* on conflict(id) do update set
    target_category=excluded.target_category,description=excluded.description,baseline=excluded.baseline,target_value=excluded.target_value,
    measurement_type=excluded.measurement_type,measurement_source=excluded.measurement_source,actual_value=excluded.actual_value,actual_text=excluded.actual_text,
    near_tolerance=excluded.near_tolerance,direction=excluded.direction,due_date=excluded.due_date,priority=excluded.priority,status=excluded.status returning * into item;
  return to_jsonb(item);
end;
$$;
create function public.get_teacher_targets(p_context uuid default null,p_term integer default null) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare actor public.profiles%rowtype;
begin
  select * into actor from public.profiles where id=auth.uid();
  if actor.id is null or actor.role not in ('principal','deputy','teacher') then raise exception 'Target access denied'; end if;
  return coalesce((select jsonb_agg(to_jsonb(t)||jsonb_build_object('class_ref',c.class_ref) order by t.due_date,t.created_at)
    from public.teacher_targets t join public.teacher_review_classes c on c.id=t.class_id and c.school_id=t.school_id
    where t.school_id=actor.school_id and (actor.role in ('principal','deputy') or t.teacher_id=actor.id)
      and (p_context is null or t.teaching_context_id=p_context) and (p_term is null or t.term=p_term)),'[]');
end;
$$;

-- Saved subject metrics drive sourced targets without fabricating unavailable actuals.
create function public.refresh_teacher_target_actuals() returns trigger
language plpgsql security definer set search_path=public as $$
declare evidence jsonb;v_review uuid;tenant uuid;
begin
  if tg_op='DELETE' then evidence:='{}';v_review:=old.review_id;tenant:=old.school_id;
  else evidence:=to_jsonb(new);v_review:=new.review_id;tenant:=new.school_id;end if;
  update public.teacher_targets t set actual_value=(evidence->>t.measurement_source)::numeric
    where t.school_id=tenant and t.review_id=v_review and t.measurement_source<>'manual'
      and t.actual_value is distinct from (evidence->>t.measurement_source)::numeric;
  return null;
end;
$$;
create trigger refresh_teacher_target_actuals after insert or update or delete on public.teacher_performance_subjects for each row execute function public.refresh_teacher_target_actuals();
revoke all on function public.calculate_teacher_target_progress(text,numeric,jsonb,numeric,text),public.guard_teacher_target(),public.refresh_teacher_target_actuals() from public,anon,authenticated;
revoke all on function public.save_teacher_target(uuid,uuid,integer,jsonb,integer),public.get_teacher_targets(uuid,integer) from public,anon;
grant execute on function public.save_teacher_target(uuid,uuid,integer,jsonb,integer),public.get_teacher_targets(uuid,integer) to authenticated;
