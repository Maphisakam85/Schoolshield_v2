-- Internal review only. Ratings are entered by a reviewer, never derived from marks.
alter table public.teacher_performance_reviews
  add column review_content jsonb not null default '{}',
  add column internal_rating integer check(internal_rating between 1 and 4),
  add column revision integer not null default 1,
  add column evidence_snapshot jsonb not null default '{}';
do $$declare c record;begin
  for c in select conname from pg_constraint where conrelid='public.teacher_performance_reviews'::regclass
    and contype='c' and pg_get_constraintdef(oid) like '%completed_at%' loop
    execute format('alter table public.teacher_performance_reviews drop constraint %I',c.conname);
  end loop;
end$$;
alter table public.teacher_performance_reviews add constraint review_completion_state
  check((status in ('Awaiting Teacher Acknowledgement','Completed'))=(completed_at is not null)) not valid;
-- Preserve legacy shared reviews as locked reviewer-completed records.
alter table public.teacher_performance_reviews disable trigger guard_teacher_term_review;
update public.teacher_performance_reviews set completed_at=coalesce(completed_at,updated_at)
  where status='Awaiting Teacher Acknowledgement';
alter table public.teacher_performance_reviews enable trigger guard_teacher_term_review;
alter table public.teacher_performance_reviews validate constraint review_completion_state;

create table public.teacher_review_history (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  review_id uuid not null,
  action text not null check(action in ('Draft saved','Review submitted','Review amended')),
  previous_value jsonb,
  new_value jsonb not null,
  changed_by uuid not null references public.profiles(id),
  changed_at timestamptz not null default now(),
  reason text not null,
  foreign key(school_id,review_id) references public.teacher_performance_reviews(school_id,id)
);
create index teacher_review_history_review on public.teacher_review_history(review_id,changed_at);
alter table public.teacher_review_history enable row level security;
create policy "leadership reads review audit" on public.teacher_review_history for select to authenticated
  using(public.can_manage_teacher_performance(school_id));
revoke all on public.teacher_review_history from public,anon,authenticated;
grant select on public.teacher_review_history to authenticated;
revoke insert,update,delete on public.teacher_performance_reviews from authenticated;

create or replace function public.guard_teacher_term_review() returns trigger
language plpgsql security definer set search_path=public as $$
declare actor public.profiles%rowtype; command text:=current_setting('schoolshield.review_command',true);
begin
  select * into actor from public.profiles where id=auth.uid();
  if actor.id is null or actor.school_id is distinct from new.school_id or actor.role not in ('principal','deputy') then raise exception 'Teacher performance management access denied'; end if;
  if tg_op='UPDATE' then
    if (new.id,new.school_id,new.teacher_id,new.teaching_context_id,new.academic_year,new.term,new.created_at)
      is distinct from (old.id,old.school_id,old.teacher_id,old.teaching_context_id,old.academic_year,old.term,old.created_at) then raise exception 'Review identity and term cannot be changed'; end if;
    if old.status in ('Awaiting Teacher Acknowledgement','Completed') and command is distinct from 'amend' then raise exception 'Completed review is locked; a reasoned amendment is required'; end if;
    new.revision:=old.revision+1;
  else new.created_at:=now();new.revision:=1;
  end if;
  if new.status in ('Awaiting Teacher Acknowledgement','Completed') and command not in ('submit','amend') or
    (new.status in ('Awaiting Teacher Acknowledgement','Completed') and command is null) then raise exception 'Use the review completion workflow'; end if;
  if not exists(select 1 from public.profiles where id=new.teacher_id and school_id=new.school_id and role='teacher') then raise exception 'Teacher is not assigned to this school'; end if;
  new.reviewer_id:=actor.id;new.reviewer_role:=actor.role;new.updated_at:=now();
  new.completed_at:=case when new.status in ('Awaiting Teacher Acknowledgement','Completed') then coalesce(case when tg_op='UPDATE' then old.completed_at end,now()) else null end;
  return new;
end$$;

-- Existing metrics/targets may create an empty header, but cannot bypass workflow.
create or replace function public.set_teacher_term_review_status(p_context uuid,p_term integer,p_status text) returns uuid
language plpgsql security definer set search_path=public as $$
declare tenant uuid:=public.current_school_id(); c public.teacher_teaching_contexts%rowtype; result uuid;
begin
  if not public.can_manage_teacher_performance(tenant) then raise exception 'Teacher performance management access denied'; end if;
  if p_status is distinct from 'Not Started' then raise exception 'Use the review draft/completion workflow'; end if;
  select * into c from public.teacher_teaching_contexts where id=p_context and school_id=tenant;
  if c.id is null then raise exception 'Teaching context is not in your school'; end if;
  insert into public.teacher_performance_reviews(school_id,teacher_id,teaching_context_id,academic_year,term,reviewer_id,reviewer_role,status)
    values(tenant,c.teacher_id,c.id,c.academic_year,p_term,auth.uid(),public.current_app_role(),'Not Started')
    on conflict(school_id,teaching_context_id,academic_year,term) do nothing;
  select id into result from public.teacher_performance_reviews where school_id=tenant and teaching_context_id=p_context and term=p_term;
  return result;
end$$;

create function public.save_teacher_review(p_context uuid,p_term integer,p_content jsonb,p_rating integer,
  p_action text,p_expected_revision integer,p_reason text default '') returns jsonb
language plpgsql security definer set search_path=public as $$
declare tenant uuid:=public.current_school_id(); rid uuid; before_row public.teacher_performance_reviews%rowtype;
  after_row public.teacher_performance_reviews%rowtype; snapshot jsonb; area jsonb; factor jsonb; support jsonb;
  labels text[]:=array['Positive learning and teaching environment','Curriculum knowledge, planning and presentation',
    'Learner assessment and achievement','Professional development','Extra/co-curricular participation']; i integer;
begin
  if not public.can_manage_teacher_performance(tenant) then raise exception 'Teacher performance management access denied'; end if;
  if p_action is null or p_action not in ('draft','submit','amend') then raise exception 'Invalid review action'; end if;
  if p_rating is not null and p_rating not between 1 and 4 then raise exception 'Internal rating must be 1 to 4'; end if;
  if jsonb_typeof(p_content) is distinct from 'object' or octet_length(p_content::text)>100000 then raise exception 'Invalid review content'; end if;
  if exists(select 1 from jsonb_object_keys(p_content) k where k not in ('areas','strengths','concerns','recommendedSupport','nextTermFocus','contextualFactors','contextNotes','supportActions')) then raise exception 'Unknown review fields'; end if;
  if jsonb_typeof(p_content->'areas') is distinct from 'array' or jsonb_array_length(p_content->'areas')<>5 then raise exception 'Record all five QMS-aligned areas'; end if;
  for i in 0..4 loop
    area:=p_content->'areas'->i;
    if area->>'area' is distinct from labels[i+1] or jsonb_typeof(area->'comment') is distinct from 'string'
      or jsonb_typeof(area->'evidence') is distinct from 'string' then raise exception 'Invalid review area'; end if;
    if p_action in ('submit','amend') and btrim(area->>'comment')='' then raise exception 'Add a reviewer comment for each review area'; end if;
  end loop;
  foreach area in array array[p_content->'strengths',p_content->'concerns',p_content->'recommendedSupport',p_content->'nextTermFocus',p_content->'contextNotes'] loop
    if jsonb_typeof(area) is distinct from 'string' then raise exception 'Review narrative must be text'; end if;
  end loop;
  if jsonb_typeof(p_content->'contextualFactors') is distinct from 'array' or jsonb_typeof(p_content->'supportActions') is distinct from 'array' then raise exception 'Invalid context or support actions'; end if;
  for factor in select value from jsonb_array_elements(p_content->'contextualFactors') loop
    if jsonb_typeof(factor)<>'string' or factor#>>'{}' not in ('Teacher joined class during term','Extended absence','Learner attendance problems','Timetable disruptions','LTSM shortages','Overcrowding','Infrastructure problems','High learner support needs','Other') then raise exception 'Invalid contextual factor'; end if;
  end loop;
  if p_content->'contextualFactors' ? 'Other' and btrim(p_content->>'contextNotes')='' then raise exception 'Explain the other contextual factor'; end if;
  for support in select value from jsonb_array_elements(p_content->'supportActions') loop
    if jsonb_typeof(support)<>'object' or jsonb_typeof(support->'description') is distinct from 'string' or btrim(support->>'description')='' then raise exception 'Support action description is required'; end if;
  end loop;
  -- Same lock order as metric refresh: review before metrics/targets.
  rid:=public.set_teacher_term_review_status(p_context,p_term,'Not Started');
  select * into before_row from public.teacher_performance_reviews where id=rid for update;
  if p_expected_revision is distinct from before_row.revision then raise exception 'Review changed; reload before saving' using errcode='40001'; end if;
  if before_row.status in ('Awaiting Teacher Acknowledgement','Completed') then
    if p_action<>'amend' then raise exception 'Completed review is locked; use an amendment'; end if;
    if length(btrim(coalesce(p_reason,'')))<5 then raise exception 'An amendment reason is required (at least 5 characters)'; end if;
  elsif p_action='amend' then raise exception 'Only submitted reviews can be amended'; end if;
  snapshot:=before_row.evidence_snapshot;
  if p_action='submit' then
    -- Freeze the evidence that the reviewer considered, including context names.
    snapshot:=jsonb_build_object('capturedAt',now(),
      'context',(select to_jsonb(c)||jsonb_build_object('subject',s.name,'class',cl.class_ref,'grade',cl.grade)
        from public.teacher_teaching_contexts c join public.teacher_review_subjects s on s.id=c.subject_id
        join public.teacher_review_classes cl on cl.id=c.class_id where c.id=p_context),
      'metrics',(select to_jsonb(m) from public.teacher_performance_subjects m where m.review_id=rid),
      'targets',coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.teacher_targets t where t.review_id=rid),'[]'));
  end if;
  perform set_config('schoolshield.review_command',p_action,true);
  update public.teacher_performance_reviews set review_content=p_content,internal_rating=p_rating,evidence_snapshot=snapshot,
    status=case when p_action='draft' then 'In Progress' else 'Awaiting Teacher Acknowledgement' end
    where id=rid returning * into after_row;
  perform set_config('schoolshield.review_command','',true);
  insert into public.teacher_review_history(school_id,review_id,action,previous_value,new_value,changed_by,reason)
    values(tenant,rid,case p_action when 'draft' then 'Draft saved' when 'submit' then 'Review submitted' else 'Review amended' end,
      to_jsonb(before_row),to_jsonb(after_row),auth.uid(),case when p_action='amend' then btrim(p_reason) else p_action end);
  return to_jsonb(after_row);
end$$;
revoke all on function public.save_teacher_review(uuid,integer,jsonb,integer,text,integer,text) from public,anon;
grant execute on function public.save_teacher_review(uuid,integer,jsonb,integer,text,integer,text) to authenticated;

-- Lock related records too, so submitted evidence cannot drift silently.
create function public.lock_submitted_teacher_evidence() returns trigger
language plpgsql security definer set search_path=public as $$
declare rid uuid;begin
  rid:=case when tg_op='DELETE' then old.review_id else new.review_id end;
  perform 1 from public.teacher_performance_reviews where id=rid for update;
  if exists(select 1 from public.teacher_performance_reviews where id=rid and status in ('Awaiting Teacher Acknowledgement','Completed')) then
    raise exception 'Submitted review evidence is locked; retain it and use the review amendment workflow';
  end if;
  if tg_op='DELETE' then return old; end if;return new;
end$$;
create trigger a_lock_submitted_metrics before insert or update or delete on public.teacher_performance_subjects for each row execute function public.lock_submitted_teacher_evidence();
create trigger a_lock_submitted_targets before insert or update or delete on public.teacher_targets for each row execute function public.lock_submitted_teacher_evidence();
revoke all on function public.lock_submitted_teacher_evidence() from public,anon,authenticated;

alter function public.refresh_teacher_subject_performance(uuid,integer,text,numeric,text,boolean) rename to refresh_teacher_subject_performance_unlocked;
revoke all on function public.refresh_teacher_subject_performance_unlocked(uuid,integer,text,numeric,text,boolean) from public,anon,authenticated;
create function public.refresh_teacher_subject_performance(p_context uuid,p_term integer,p_baseline_id text default null,p_curriculum_coverage numeric default null,p_reviewer_comment text default null,p_update_review_fields boolean default false)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.teacher_performance_reviews%rowtype;
begin
  if not public.can_manage_teacher_performance(public.current_school_id()) then raise exception 'Teacher performance management access denied'; end if;
  select * into r from public.teacher_performance_reviews where teaching_context_id=p_context and term=p_term and school_id=public.current_school_id() for update;
  if r.status in ('Awaiting Teacher Acknowledgement','Completed') then
    if p_update_review_fields then raise exception 'Submitted review evidence is locked'; end if;
    return coalesce(nullif(r.evidence_snapshot->'metrics','null'),(select to_jsonb(m) from public.teacher_performance_subjects m where m.review_id=r.id),'{}')||jsonb_build_object('baseline_candidates','[]'::jsonb,'locked',true);
  end if;
  return public.refresh_teacher_subject_performance_unlocked(p_context,p_term,p_baseline_id,p_curriculum_coverage,p_reviewer_comment,p_update_review_fields);
end$$;
revoke all on function public.refresh_teacher_subject_performance(uuid,integer,text,numeric,text,boolean) from public,anon;
grant execute on function public.refresh_teacher_subject_performance(uuid,integer,text,numeric,text,boolean) to authenticated;

-- Also cover cascading deletion through a teaching context, not just REST writes.
create function public.prevent_submitted_teacher_review_delete() returns trigger
language plpgsql set search_path=public as $$
begin
  if old.status in ('Awaiting Teacher Acknowledgement','Completed') then
    raise exception 'Submitted reviews cannot be deleted';
  end if;
  return old;
end$$;
create trigger prevent_submitted_review_delete before delete on public.teacher_performance_reviews
  for each row execute function public.prevent_submitted_teacher_review_delete();
revoke all on function public.prevent_submitted_teacher_review_delete() from public,anon,authenticated;
