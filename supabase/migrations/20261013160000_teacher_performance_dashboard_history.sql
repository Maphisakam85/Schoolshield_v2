-- Confidential personnel events. No public or cross-school read/write access.
create table public.teacher_performance_events (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id),
 teacher_id uuid not null, review_id uuid not null, academic_year integer not null, term integer not null,
 entity_type text not null, entity_id uuid not null, event text not null,
 previous_value jsonb, new_value jsonb not null, changed_by uuid not null references public.profiles(id),
 changed_at timestamptz not null default now(),
 foreign key(school_id,review_id) references public.teacher_performance_reviews(school_id,id)
);
create index teacher_performance_events_scope on public.teacher_performance_events(school_id,teacher_id,academic_year,term,changed_at);
alter table public.teacher_performance_events enable row level security;
create policy "leadership reads confidential performance events" on public.teacher_performance_events for select to authenticated
 using(public.can_manage_teacher_performance(school_id));
revoke all on public.teacher_performance_events from public,anon,authenticated;
grant select on public.teacher_performance_events to authenticated;

create function public.log_teacher_performance_event() returns trigger
language plpgsql security definer set search_path=public as $$
declare before_value jsonb;after_value jsonb:=to_jsonb(new);r public.teacher_performance_reviews%rowtype;
 events text[]:='{}';event_name text;kind text;
begin
 if tg_op='UPDATE' then before_value:=to_jsonb(old);end if;
 if tg_table_name='teacher_performance_reviews' then
  r:=new;kind:='review';
  if (tg_op='INSERT' and new.status in ('In Progress','Awaiting Teacher Acknowledgement')) or (tg_op='UPDATE' and old.status='Not Started' and new.status in ('In Progress','Awaiting Teacher Acknowledgement')) then events:=array_append(events,'Review started');end if;
  if new.status='Awaiting Teacher Acknowledgement' and (tg_op='INSERT' or old.status not in ('Awaiting Teacher Acknowledgement','Completed')) then events:=array_append(events,'Review completed');end if;
  if tg_op='UPDATE' and current_setting('schoolshield.review_command',true)='amend' then events:=array_append(events,'Review amended');end if;
  if tg_op='UPDATE' and new.internal_rating is distinct from old.internal_rating then events:=array_append(events,'Rating changed');end if;
  if tg_op='UPDATE' and new.teacher_acknowledged_at is not null and new.teacher_acknowledged_at is distinct from old.teacher_acknowledged_at then events:=array_append(events,'Teacher acknowledged');end if;
  if tg_op='UPDATE' and new.teacher_comment<>'' and new.teacher_comment is distinct from old.teacher_comment then events:=array_append(events,'Teacher response');end if;
 else
  select * into r from public.teacher_performance_reviews where id=new.review_id;
  if tg_table_name='teacher_targets' then
   kind:='target';events:=array[case when tg_op='INSERT' then 'Target created' else 'Target edited' end];
  else
   kind:='support';events:=array[case when tg_op='INSERT' then 'Support action created' else 'Support action updated' end];
   if new.status='Completed' and (tg_op='INSERT' or old.status<>'Completed') then events:=array_append(events,'Support action completed');end if;
  end if;
 end if;
 foreach event_name in array events loop
  insert into public.teacher_performance_events(school_id,teacher_id,review_id,academic_year,term,entity_type,entity_id,event,previous_value,new_value,changed_by)
   values(r.school_id,r.teacher_id,r.id,r.academic_year,r.term,kind,new.id,event_name,before_value,after_value,auth.uid());
 end loop;
 return new;
end$$;
create trigger audit_teacher_review_events after insert or update on public.teacher_performance_reviews for each row execute function public.log_teacher_performance_event();
create trigger audit_teacher_target_events after insert or update on public.teacher_targets for each row execute function public.log_teacher_performance_event();
create trigger audit_teacher_support_events after insert or update on public.teacher_support_actions for each row execute function public.log_teacher_performance_event();
revoke all on function public.log_teacher_performance_event() from public,anon,authenticated;

create function public.get_teacher_performance_overview(p_year integer,p_term integer,p_filters jsonb default '{}') returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare tenant uuid:=public.current_school_id();directory jsonb;teachers jsonb;contexts jsonb;
begin
 if not public.can_manage_teacher_performance(tenant) then raise exception 'Teacher performance management access denied';end if;
 if p_year is null or p_year not between 1900 and 2200 or p_term is null or p_term not between 1 and 4 or jsonb_typeof(p_filters) is distinct from 'object' then raise exception 'Invalid overview scope';end if;
 directory:=public.get_teacher_performance_directory(p_year);
 select coalesce(jsonb_agg(t),'[]') into teachers from jsonb_array_elements(directory->'teachers') t
  where (coalesce(p_filters->>'teacher','')='' or t->>'id'=p_filters->>'teacher')
   and (coalesce(p_filters->>'department','')='' or t->>'department'=p_filters->>'department');
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'teacherId',c.teacher_id,'subject',s.name,'subjectId',s.id,
  'grade',cl.grade,'class',cl.class_ref,'classId',cl.id,'review',to_jsonb(r),
  'metrics',case when r.status in ('Awaiting Teacher Acknowledgement','Completed') then coalesce(nullif(r.evidence_snapshot->'metrics','null'),to_jsonb(m)) else to_jsonb(m) end,
  'targets',coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.teacher_targets t where t.review_id=r.id),'[]'),
  'supportActions',coalesce((select jsonb_agg(to_jsonb(a) order by a.due_date,a.id) from public.teacher_support_actions a where a.review_id=r.id),'[]'))
  order by s.name,cl.grade,cl.class_ref,c.teacher_id),'[]') into contexts
 from public.teacher_teaching_contexts c join public.teacher_review_subjects s on s.id=c.subject_id
 join public.teacher_review_classes cl on cl.id=c.class_id
 left join public.teacher_performance_reviews r on r.teaching_context_id=c.id and r.term=p_term
 left join public.teacher_performance_subjects m on m.review_id=r.id
 where c.school_id=tenant and c.academic_year=p_year
  and exists(select 1 from jsonb_array_elements(teachers) t where t->>'id'=c.teacher_id::text)
  and (coalesce(p_filters->>'subject','')='' or s.id::text=p_filters->>'subject')
  and (coalesce(p_filters->>'grade','')='' or cl.grade=p_filters->>'grade')
  and (coalesce(p_filters->>'class','')='' or cl.id::text=p_filters->>'class');
 if coalesce(p_filters->>'subject','')<>'' or coalesce(p_filters->>'grade','')<>'' or coalesce(p_filters->>'class','')<>'' then
  select coalesce(jsonb_agg(t),'[]') into teachers from jsonb_array_elements(teachers) t
   where exists(select 1 from jsonb_array_elements(contexts) c where c->>'teacherId'=t->>'id');
 end if;
 return jsonb_build_object('teachers',teachers,'contexts',contexts);
end$$;

create function public.get_teacher_performance_history(p_teacher uuid,p_year integer) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare tenant uuid:=public.current_school_id();terms jsonb:='[]';n integer;overview jsonb;years jsonb;teacher jsonb;
begin
 if not public.can_manage_teacher_performance(tenant) then raise exception 'Teacher performance management access denied';end if;
 if not exists(select 1 from public.profiles where id=p_teacher and school_id=tenant and role='teacher') then raise exception 'Teacher is not in your school';end if;
 if p_year is null or p_year not between 1900 and 2200 then raise exception 'Invalid history year';end if;
 select jsonb_build_object('id',p.id,'display_name',p.display_name) into teacher from public.profiles p where p.id=p_teacher;
 select coalesce(jsonb_agg(y order by y desc),'[]') into years from
  (select distinct academic_year as y from public.teacher_teaching_contexts where school_id=tenant and teacher_id=p_teacher) available;
 for n in 1..4 loop
  overview:=public.get_teacher_performance_overview(p_year,n,jsonb_build_object('teacher',p_teacher));
  terms:=terms||jsonb_build_array(jsonb_build_object('term',n,'contexts',overview->'contexts'));
 end loop;
 return jsonb_build_object('teacher',teacher,'years',years,'year',p_year,'terms',terms,
  'events',coalesce((select jsonb_agg(to_jsonb(e) order by changed_at desc,id) from public.teacher_performance_events e where e.school_id=tenant and e.teacher_id=p_teacher and e.academic_year=p_year),'[]'),
  'reviewHistory',coalesce((select jsonb_agg(to_jsonb(h) order by h.changed_at desc,h.id) from public.teacher_review_history h
   join public.teacher_performance_reviews r on r.id=h.review_id where h.school_id=tenant and r.teacher_id=p_teacher and r.academic_year=p_year),'[]'));
end$$;
revoke all on function public.get_teacher_performance_overview(integer,integer,jsonb),public.get_teacher_performance_history(uuid,integer) from public,anon;
grant execute on function public.get_teacher_performance_overview(integer,integer,jsonb),public.get_teacher_performance_history(uuid,integer) to authenticated;
