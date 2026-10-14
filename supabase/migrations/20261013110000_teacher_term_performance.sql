-- Internal Teacher Term Performance Review. This is not an official QMS appraisal.
create unique index if not exists profiles_school_identity on public.profiles(school_id,id);
create table public.teacher_review_classes (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id),
  class_ref text not null, grade text not null,
  unique(school_id,class_ref), unique(school_id,id)
);
create table public.teacher_review_subjects (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id),
  name text not null check(length(btrim(name))>0), unique(school_id,name), unique(school_id,id)
);
create table public.teacher_teaching_contexts (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id),
  teacher_id uuid not null, subject_id uuid not null, class_id uuid not null,
  academic_year integer not null check(academic_year between 1900 and 2200),
  foreign key(school_id,teacher_id) references public.profiles(school_id,id),
  foreign key(school_id,subject_id) references public.teacher_review_subjects(school_id,id),
  foreign key(school_id,class_id) references public.teacher_review_classes(school_id,id),
  unique(school_id,teacher_id,subject_id,class_id,academic_year),
  unique(school_id,teacher_id,id,academic_year)
);
create table public.teacher_performance_reviews (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id),
  teacher_id uuid not null, teaching_context_id uuid not null,
  academic_year integer not null check(academic_year between 1900 and 2200),
  term integer not null check(term between 1 and 4),
  reviewer_id uuid not null, reviewer_role public.app_role not null check(reviewer_role in ('principal','deputy')),
  status text not null default 'Not Started' check(status in ('Not Started','In Progress','Awaiting Teacher Acknowledgement','Completed')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), completed_at timestamptz,
  foreign key(school_id,teacher_id,teaching_context_id,academic_year) references public.teacher_teaching_contexts(school_id,teacher_id,id,academic_year),
  foreign key(school_id,reviewer_id) references public.profiles(school_id,id),
  unique(school_id,teaching_context_id,academic_year,term),
  check((status='Completed')=(completed_at is not null))
);
create index teacher_performance_teacher_term on public.teacher_performance_reviews(school_id,teacher_id,academic_year,term);

create function public.can_manage_teacher_performance(p_school uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.profiles where id=auth.uid() and school_id=p_school and role in ('principal','deputy'))
$$;
revoke all on function public.can_manage_teacher_performance(uuid) from public,anon;
grant execute on function public.can_manage_teacher_performance(uuid) to authenticated;

alter table public.teacher_review_classes enable row level security;
alter table public.teacher_review_subjects enable row level security;
alter table public.teacher_teaching_contexts enable row level security;
alter table public.teacher_performance_reviews enable row level security;
create policy "leadership manages review classes" on public.teacher_review_classes for all to authenticated
  using(public.can_manage_teacher_performance(school_id)) with check(public.can_manage_teacher_performance(school_id));
create policy "leadership manages review subjects" on public.teacher_review_subjects for all to authenticated
  using(public.can_manage_teacher_performance(school_id)) with check(public.can_manage_teacher_performance(school_id));
create policy "leadership manages teaching contexts" on public.teacher_teaching_contexts for all to authenticated
  using(public.can_manage_teacher_performance(school_id)) with check(public.can_manage_teacher_performance(school_id));
create policy "leadership manages term reviews" on public.teacher_performance_reviews for all to authenticated
  using(public.can_manage_teacher_performance(school_id)) with check(public.can_manage_teacher_performance(school_id));
-- No management page/edits for Teachers. Only their own shared/completed rows.
create policy "teachers read own shared term reviews" on public.teacher_performance_reviews for select to authenticated
  using(school_id=public.current_school_id() and public.current_app_role()='teacher' and teacher_id=auth.uid()
    and status in ('Awaiting Teacher Acknowledgement','Completed'));
grant select,insert,update,delete on public.teacher_review_classes,public.teacher_review_subjects,public.teacher_teaching_contexts,public.teacher_performance_reviews to authenticated;
revoke all on public.teacher_review_classes,public.teacher_review_subjects,public.teacher_teaching_contexts,public.teacher_performance_reviews from anon;

create function public.guard_teacher_review_context() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if not public.can_manage_teacher_performance(new.school_id) then raise exception 'Teacher performance management access denied'; end if;
  if tg_op='UPDATE' and (new.id,new.school_id,new.teacher_id,new.subject_id,new.class_id,new.academic_year)
    is distinct from (old.id,old.school_id,old.teacher_id,old.subject_id,old.class_id,old.academic_year) then raise exception 'Teaching context identity cannot be changed'; end if;
  if not exists(select 1 from public.profiles where id=new.teacher_id and school_id=new.school_id and role='teacher') then raise exception 'Teacher is not assigned to this school'; end if;
  return new;
end;
$$;
create trigger guard_teacher_review_context before insert or update on public.teacher_teaching_contexts for each row execute function public.guard_teacher_review_context();
create function public.guard_teacher_term_review() returns trigger
language plpgsql security definer set search_path=public as $$
declare actor public.profiles%rowtype;
begin
  select * into actor from public.profiles where id=auth.uid();
  if actor.id is null or actor.school_id is distinct from new.school_id or actor.role not in ('principal','deputy') then raise exception 'Teacher performance management access denied'; end if;
  if tg_op='UPDATE' and (new.id,new.school_id,new.teacher_id,new.teaching_context_id,new.academic_year,new.term,new.created_at)
    is distinct from (old.id,old.school_id,old.teacher_id,old.teaching_context_id,old.academic_year,old.term,old.created_at) then raise exception 'Review identity and term cannot be changed'; end if;
  if not exists(select 1 from public.profiles where id=new.teacher_id and school_id=new.school_id and role='teacher') then raise exception 'Teacher is not assigned to this school'; end if;
  new.reviewer_id:=actor.id;new.reviewer_role:=actor.role;new.updated_at:=now();
  if tg_op='INSERT' then new.created_at:=now(); end if;
  new.completed_at:=case when new.status='Completed' then coalesce(case when tg_op='UPDATE' then old.completed_at end,now()) else null end;
  return new;
end;
$$;
create trigger guard_teacher_term_review before insert or update on public.teacher_performance_reviews for each row execute function public.guard_teacher_term_review();
revoke all on function public.guard_teacher_review_context(),public.guard_teacher_term_review() from public,anon,authenticated;

-- Reuse existing profile identities, class references and recorded subject names.
-- No assumption that the class teacher teaches every subject in that class.
create function public.sync_teacher_review_catalogue() returns void
language plpgsql security definer set search_path=public as $$
declare tenant uuid:=public.current_school_id(); workspace jsonb;
begin
  if not public.can_manage_teacher_performance(tenant) then raise exception 'Teacher performance management access denied'; end if;
  select payload into workspace from public.school_workspaces where school_id=tenant;
  insert into public.teacher_review_classes(school_id,class_ref,grade)
    select tenant,c->>'id',coalesce(nullif(c->>'grade',''),'Unspecified grade') from jsonb_array_elements(coalesce(workspace->'classes','[]')) c where coalesce(c->>'id','')<>''
    on conflict(school_id,class_ref) do update set grade=excluded.grade;
  insert into public.teacher_review_subjects(school_id,name)
    select distinct tenant,btrim(a->>'subject') from jsonb_array_elements(coalesce(workspace->'assessments','[]')) a where coalesce(btrim(a->>'subject'),'')<>''
    on conflict do nothing;
  insert into public.teacher_review_subjects(school_id,name)
    select distinct tenant,btrim(s) from jsonb_array_elements(coalesce(workspace->'staff','[]')) staff
      cross join lateral jsonb_array_elements_text(case when jsonb_typeof(staff->'subjects')='array' then staff->'subjects' else '[]' end) s
    where btrim(s)<>'' on conflict do nothing;
end;
$$;
create function public.get_teacher_performance_directory(p_year integer) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare tenant uuid:=public.current_school_id(); workspace jsonb; teachers jsonb;
begin
  if not public.can_manage_teacher_performance(tenant) then raise exception 'Teacher performance management access denied'; end if;
  select payload into workspace from public.school_workspaces where school_id=tenant;
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.display_name,
    'employeeId',coalesce(staff->>'employeeId',staff->>'employee',staff->>'id','Not assigned'),
    'department',coalesce(nullif(staff->>'department',''),'Not assigned')) order by p.display_name),'[]') into teachers
    from public.profiles p left join lateral (
      select s as staff from jsonb_array_elements(coalesce(workspace->'staff','[]')) s where
        s->>'userId'=p.id::text or s->>'profileId'=p.id::text or
        (coalesce(s->>'userId',s->>'profileId','')='' and s->>'name'=p.display_name
          and (select count(*) from public.profiles where school_id=tenant and display_name=p.display_name)=1)
      order by case when s->>'userId'=p.id::text or s->>'profileId'=p.id::text then 0 else 1 end limit 1
    ) existing on true where p.school_id=tenant and p.role='teacher';
  return jsonb_build_object('teachers',teachers,
    'subjects',coalesce((select jsonb_agg(to_jsonb(s) order by s.name) from public.teacher_review_subjects s where s.school_id=tenant),'[]'),
    'classes',coalesce((select jsonb_agg(to_jsonb(c) order by c.grade,c.class_ref) from public.teacher_review_classes c where c.school_id=tenant),'[]'),
    'contexts',coalesce((select jsonb_agg(to_jsonb(c)) from public.teacher_teaching_contexts c where c.school_id=tenant and c.academic_year=p_year),'[]'),
    'reviews',coalesce((select jsonb_agg(to_jsonb(r) order by r.updated_at desc,r.id) from public.teacher_performance_reviews r where r.school_id=tenant and r.academic_year=p_year),'[]'));
end;
$$;
create function public.link_teacher_review_context(p_teacher uuid,p_subject uuid,p_class uuid,p_year integer) returns uuid
language plpgsql security definer set search_path=public as $$
declare tenant uuid:=public.current_school_id(); result uuid;
begin
  if not public.can_manage_teacher_performance(tenant) then raise exception 'Teacher performance management access denied'; end if;
  insert into public.teacher_teaching_contexts(school_id,teacher_id,subject_id,class_id,academic_year)
    values(tenant,p_teacher,p_subject,p_class,p_year) on conflict(school_id,teacher_id,subject_id,class_id,academic_year) do nothing;
  select id into result from public.teacher_teaching_contexts where school_id=tenant and teacher_id=p_teacher and subject_id=p_subject and class_id=p_class and academic_year=p_year;
  return result;
end;
$$;
create function public.set_teacher_term_review_status(p_context uuid,p_term integer,p_status text) returns uuid
language plpgsql security definer set search_path=public as $$
declare tenant uuid:=public.current_school_id(); context public.teacher_teaching_contexts%rowtype; result uuid;
begin
  if not public.can_manage_teacher_performance(tenant) then raise exception 'Teacher performance management access denied'; end if;
  select * into context from public.teacher_teaching_contexts where id=p_context and school_id=tenant;
  if context.id is null then raise exception 'Teaching context is not in your school'; end if;
  insert into public.teacher_performance_reviews(school_id,teacher_id,teaching_context_id,academic_year,term,reviewer_id,reviewer_role,status)
    values(tenant,context.teacher_id,context.id,context.academic_year,p_term,auth.uid(),public.current_app_role(),p_status)
    on conflict(school_id,teaching_context_id,academic_year,term) do update set status=excluded.status
    returning id into result;
  return result;
end;
$$;
revoke all on function public.sync_teacher_review_catalogue(),public.get_teacher_performance_directory(integer),public.link_teacher_review_context(uuid,uuid,uuid,integer),public.set_teacher_term_review_status(uuid,integer,text) from public,anon;
grant execute on function public.sync_teacher_review_catalogue(),public.get_teacher_performance_directory(integer),public.link_teacher_review_context(uuid,uuid,uuid,integer),public.set_teacher_term_review_status(uuid,integer,text) to authenticated;
