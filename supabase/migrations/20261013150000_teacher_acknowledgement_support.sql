alter table public.teacher_performance_reviews
  add column teacher_acknowledged_at timestamptz,
  add column teacher_comment text not null default '' check(length(teacher_comment)<=6000);
alter table public.teacher_performance_reviews add constraint teacher_acknowledged_completion
  check(teacher_acknowledged_at is null or status='Completed');
alter table public.teacher_review_history drop constraint teacher_review_history_action_check;
alter table public.teacher_review_history add constraint teacher_review_history_action_check
  check(action in ('Draft saved','Review submitted','Review amended','Teacher acknowledged'));

create or replace function public.guard_teacher_term_review() returns trigger
language plpgsql security definer set search_path=public as $$
declare actor public.profiles%rowtype; command text:=current_setting('schoolshield.review_command',true);
begin
  select * into actor from public.profiles where id=auth.uid();
  if tg_op='UPDATE' and command='acknowledge' then
    if actor.role is distinct from 'teacher' or actor.id is distinct from old.teacher_id or actor.school_id is distinct from old.school_id
      or old.status not in ('Awaiting Teacher Acknowledgement','Completed') or old.completed_at is null then raise exception 'Teacher acknowledgement access denied'; end if;
    if old.teacher_acknowledged_at is not null then raise exception 'Review already acknowledged'; end if;
    if (to_jsonb(new)-array['teacher_acknowledged_at','teacher_comment','status']) is distinct from
      (to_jsonb(old)-array['teacher_acknowledged_at','teacher_comment','status']) then raise exception 'Teachers cannot change management review values'; end if;
    new.teacher_acknowledged_at:=now();new.status:='Completed';new.updated_at:=now();new.revision:=old.revision+1;
    return new;
  end if;
  if actor.id is null or actor.school_id is distinct from new.school_id or actor.role not in ('principal','deputy') then raise exception 'Teacher performance management access denied'; end if;
  if tg_op='UPDATE' then
    if (new.id,new.school_id,new.teacher_id,new.teaching_context_id,new.academic_year,new.term,new.created_at)
      is distinct from (old.id,old.school_id,old.teacher_id,old.teaching_context_id,old.academic_year,old.term,old.created_at) then raise exception 'Review identity and term cannot be changed'; end if;
    if old.status in ('Awaiting Teacher Acknowledgement','Completed') and command is distinct from 'amend' then raise exception 'Completed review is locked; a reasoned amendment is required'; end if;
    if (new.teacher_acknowledged_at,new.teacher_comment) is distinct from (old.teacher_acknowledged_at,old.teacher_comment) then raise exception 'Only the teacher can acknowledge or respond'; end if;
    new.revision:=old.revision+1;
  else
    new.created_at:=now();new.revision:=1;new.teacher_acknowledged_at:=null;new.teacher_comment:='';
  end if;
  if new.status in ('Awaiting Teacher Acknowledgement','Completed') and (command is null or command not in ('submit','amend')) then raise exception 'Use the review completion workflow'; end if;
  if not exists(select 1 from public.profiles where id=new.teacher_id and school_id=new.school_id and role='teacher') then raise exception 'Teacher is not assigned to this school'; end if;
  -- An amendment is a new version to acknowledge. Previous response stays in audit.
  if command='amend' then new.teacher_acknowledged_at:=null;new.teacher_comment:='';end if;
  new.reviewer_id:=actor.id;new.reviewer_role:=actor.role;new.updated_at:=now();
  new.completed_at:=case when new.status in ('Awaiting Teacher Acknowledgement','Completed') then coalesce(case when tg_op='UPDATE' then old.completed_at end,now()) else null end;
  return new;
end$$;

create function public.acknowledge_teacher_review(p_review uuid,p_expected_revision integer,p_comment text default '') returns jsonb
language plpgsql security definer set search_path=public as $$
declare before_row public.teacher_performance_reviews%rowtype; after_row public.teacher_performance_reviews%rowtype;
begin
  if public.current_app_role() is distinct from 'teacher' then raise exception 'Teacher acknowledgement access denied'; end if;
  select * into before_row from public.teacher_performance_reviews
    where id=p_review and school_id=public.current_school_id() and teacher_id=auth.uid() for update;
  if before_row.id is null or before_row.status not in ('Awaiting Teacher Acknowledgement','Completed') or before_row.completed_at is null then raise exception 'Completed own review required'; end if;
  if before_row.teacher_acknowledged_at is not null then raise exception 'Review already acknowledged'; end if;
  if p_expected_revision is distinct from before_row.revision then raise exception 'Review changed; reload before acknowledging' using errcode='40001'; end if;
  if length(coalesce(p_comment,''))>6000 then raise exception 'Teacher response is too long'; end if;
  perform set_config('schoolshield.review_command','acknowledge',true);
  update public.teacher_performance_reviews set teacher_comment=btrim(coalesce(p_comment,'')),teacher_acknowledged_at=now(),status='Completed'
    where id=p_review returning * into after_row;
  perform set_config('schoolshield.review_command','',true);
  insert into public.teacher_review_history(school_id,review_id,action,previous_value,new_value,changed_by,reason)
    values(before_row.school_id,p_review,'Teacher acknowledged',to_jsonb(before_row),to_jsonb(after_row),auth.uid(),'Receipt acknowledged; acknowledgement does not mean agreement');
  return to_jsonb(after_row);
end$$;

create table public.teacher_support_actions (
  id uuid primary key default gen_random_uuid(), school_id uuid not null,
  teacher_id uuid not null, review_id uuid not null,
  support_area text not null check(length(btrim(support_area)) between 1 and 200),
  intervention text not null check(length(btrim(intervention)) between 1 and 6000),
  responsible_person text not null check(length(btrim(responsible_person)) between 1 and 300),
  due_date date not null, follow_up_date date,
  status text not null default 'Planned' check(status in ('Planned','In Progress','Completed','Cancelled')),
  outcome text not null default '' check(length(outcome)<=6000),
  created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(),
  updated_by uuid not null references public.profiles(id), updated_at timestamptz not null default now(), revision integer not null default 1,
  foreign key(school_id,review_id) references public.teacher_performance_reviews(school_id,id),
  foreign key(school_id,teacher_id) references public.profiles(school_id,id)
);
create index teacher_support_actions_teacher on public.teacher_support_actions(school_id,teacher_id,review_id);
alter table public.teacher_support_actions enable row level security;
create policy "leadership and own teacher read support" on public.teacher_support_actions for select to authenticated
  using(public.can_manage_teacher_performance(school_id) or
    (school_id=public.current_school_id() and public.current_app_role()='teacher' and teacher_id=auth.uid()));
revoke all on public.teacher_support_actions from public,anon,authenticated;
grant select on public.teacher_support_actions to authenticated;

create function public.save_teacher_support_action(p_id uuid,p_review uuid,p_details jsonb,p_expected_revision integer default null) returns jsonb
language plpgsql security definer set search_path=public as $$
declare r public.teacher_performance_reviews%rowtype; previous public.teacher_support_actions%rowtype; result public.teacher_support_actions%rowtype; k text;
begin
  if not public.can_manage_teacher_performance(public.current_school_id()) then raise exception 'Support management access denied'; end if;
  select * into r from public.teacher_performance_reviews where id=p_review and school_id=public.current_school_id();
  if r.id is null then raise exception 'Review is not in your school'; end if;
  if p_id is null or jsonb_typeof(p_details) is distinct from 'object' then raise exception 'Invalid support action'; end if;
  for k in select jsonb_object_keys(p_details) loop
    if k not in ('support_area','intervention','responsible_person','due_date','follow_up_date','status','outcome') then raise exception 'Invalid support fields';end if;
    if jsonb_typeof(p_details->k) not in ('string','null') then raise exception 'Support fields must be text';end if;
  end loop;
  perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
  select * into previous from public.teacher_support_actions where id=p_id for update;
  if previous.id is not null then
    if previous.school_id<>r.school_id or previous.review_id<>r.id or previous.teacher_id<>r.teacher_id then raise exception 'Support action scope cannot change'; end if;
    if p_expected_revision is distinct from previous.revision then raise exception 'Support action changed; reload before saving' using errcode='40001'; end if;
    update public.teacher_support_actions set support_area=btrim(p_details->>'support_area'),intervention=btrim(p_details->>'intervention'),
      responsible_person=btrim(p_details->>'responsible_person'),due_date=(p_details->>'due_date')::date,
      follow_up_date=nullif(p_details->>'follow_up_date','')::date,status=p_details->>'status',outcome=coalesce(p_details->>'outcome',''),
      updated_by=auth.uid(),updated_at=now(),revision=revision+1 where id=p_id returning * into result;
  else
    if p_expected_revision is not null then raise exception 'Support action no longer exists'; end if;
    insert into public.teacher_support_actions(id,school_id,teacher_id,review_id,support_area,intervention,responsible_person,due_date,follow_up_date,status,outcome,created_by,updated_by)
      values(p_id,r.school_id,r.teacher_id,r.id,btrim(p_details->>'support_area'),btrim(p_details->>'intervention'),btrim(p_details->>'responsible_person'),
        (p_details->>'due_date')::date,nullif(p_details->>'follow_up_date','')::date,p_details->>'status',coalesce(p_details->>'outcome',''),auth.uid(),auth.uid()) returning * into result;
  end if;
  return to_jsonb(result);
end$$;

create function public.get_my_teacher_performance(p_year integer,p_term integer) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare tenant uuid:=public.current_school_id(); result jsonb;
begin
  if public.current_app_role() is distinct from 'teacher' then raise exception 'Teacher performance access denied';end if;
  if p_year is null or p_term is null or p_year not between 1900 and 2200 or p_term not between 1 and 4 then raise exception 'Invalid year or term';end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'subject',s.name,'grade',cl.grade,'class',cl.class_ref,
    'review',case when r.status in ('Awaiting Teacher Acknowledgement','Completed') then to_jsonb(r) else null end,
    'metrics',case when r.status in ('Awaiting Teacher Acknowledgement','Completed') then coalesce(nullif(r.evidence_snapshot->'metrics','null'),to_jsonb(m))
      else to_jsonb(m)-array['reviewer_comment','updated_by','calculation_details'] end,
    'targets',coalesce((select jsonb_agg(to_jsonb(t) order by t.due_date,t.id) from public.teacher_targets t where t.teacher_id=auth.uid() and t.school_id=tenant and t.teaching_context_id=c.id and t.term=p_term),'[]'),
    'supportActions',coalesce((select jsonb_agg(to_jsonb(a) order by a.due_date,a.id) from public.teacher_support_actions a where a.teacher_id=auth.uid() and a.school_id=tenant and a.review_id=r.id),'[]')) order by s.name,cl.class_ref),'[]') into result
    from public.teacher_teaching_contexts c join public.teacher_review_subjects s on s.id=c.subject_id
    join public.teacher_review_classes cl on cl.id=c.class_id
    left join public.teacher_performance_reviews r on r.teaching_context_id=c.id and r.term=p_term
    left join public.teacher_performance_subjects m on m.review_id=r.id
    where c.school_id=tenant and c.teacher_id=auth.uid() and c.academic_year=p_year;
  return result;
end$$;
revoke all on function public.acknowledge_teacher_review(uuid,integer,text),public.save_teacher_support_action(uuid,uuid,jsonb,integer),public.get_my_teacher_performance(integer,integer) from public,anon;
grant execute on function public.acknowledge_teacher_review(uuid,integer,text),public.save_teacher_support_action(uuid,uuid,jsonb,integer),public.get_my_teacher_performance(integer,integer) to authenticated;
