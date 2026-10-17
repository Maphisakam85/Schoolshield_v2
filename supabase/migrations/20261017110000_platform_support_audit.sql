-- Separate from teacher development/support actions. Owner-created operational
-- tickets only; no school messaging or academic/family record access.
create table public.platform_support_tickets (
 id uuid primary key default gen_random_uuid(),
 school_id uuid not null references public.schools(id) on delete restrict,
 title text not null check(length(btrim(title)) between 3 and 160),
 category text not null check(category in ('Access','Invitations','Branding','Platform','Other')),
 description text not null check(length(btrim(description)) between 5 and 3000),
 priority text not null check(priority in ('Low','Normal','High','Urgent')),
 status text not null check(status in ('Open','In Progress','Resolved','Closed')),
 internal_notes text not null default '' check(length(internal_notes)<=5000),
 origin text not null default 'Owner-created' check(origin='Owner-created'),
 created_by uuid not null references auth.users(id) on delete restrict,
 updated_by uuid not null references auth.users(id) on delete restrict,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 revision integer not null default 1
);
create index platform_support_school_recent on public.platform_support_tickets(school_id,updated_at desc,id);
alter table public.platform_support_tickets enable row level security;
revoke all on public.platform_support_tickets from public,anon,authenticated;
-- Audit contents are inspected through safe projections, not raw browser SELECT.
revoke select on public.platform_admin_audit from authenticated;

create function public.platform_admin_support(p_school uuid) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 perform require_platform_administrator();
 if not exists(select 1 from schools where id=p_school) then raise exception 'School not found'; end if;
 return jsonb_build_object('school_id',p_school,'tickets',coalesce((select jsonb_agg(to_jsonb(t) order by updated_at desc,id) from platform_support_tickets t where school_id=p_school),'[]'),
 'diagnostics',jsonb_build_object(
 'invitations',coalesce((select jsonb_agg(to_jsonb(d)) from (select operation_id,'Invitation ('||delivery||')' as action,status,created_at from user_invitations where school_id=p_school order by created_at desc limit 50) d),'[]'),
 'account_operations',coalesce((select jsonb_agg(to_jsonb(d)) from (select id as operation_id,action,status,created_at from platform_account_operations where school_id=p_school order by created_at desc limit 50) d),'[]'),
 'provisioning',coalesce((select jsonb_agg(to_jsonb(d)) from (select id as operation_id,status,created_at,updated_at from platform_school_provisions where school_id=p_school) d),'[]')));
end $$;
create function public.platform_admin_save_support(p_school uuid,p_id uuid,p_revision integer,p_fields jsonb,p_operation uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare old platform_support_tickets%rowtype; result platform_support_tickets%rowtype; previous platform_admin_audit%rowtype;
begin
 perform require_platform_administrator();
 if p_id is null or p_operation is null or p_fields is null or jsonb_typeof(p_fields)<>'object' or (p_fields-array['title','category','description','priority','status','internal_notes'])<>'{}' then raise exception 'Invalid support request'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_operation::text,0));
 select * into previous from platform_admin_audit where actor_id=auth.uid() and operation_id=p_operation;
 if found then
  if previous.school_id is distinct from p_school or previous.target_id is distinct from p_id or previous.action not in ('support_created','support_updated') or previous.new_value is distinct from p_fields then raise exception 'Operation reference already used'; end if;
  return (select to_jsonb(t) from platform_support_tickets t where id=p_id and school_id=p_school);
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select * into old from platform_support_tickets where id=p_id for update;
 if found and (old.school_id<>p_school or old.revision<>p_revision) then raise exception 'Ticket changed or is not in selected school' using errcode='40001'; end if;
 if old.id is null and p_revision<>0 then raise exception 'Ticket not found'; end if;
 if old.id is null then
  insert into platform_support_tickets(id,school_id,title,category,description,priority,status,internal_notes,created_by,updated_by)
  values(p_id,p_school,btrim(p_fields->>'title'),p_fields->>'category',btrim(p_fields->>'description'),p_fields->>'priority',p_fields->>'status',coalesce(p_fields->>'internal_notes',''),auth.uid(),auth.uid()) returning * into result;
 else
  update platform_support_tickets set title=btrim(p_fields->>'title'),category=p_fields->>'category',description=btrim(p_fields->>'description'),priority=p_fields->>'priority',status=p_fields->>'status',internal_notes=coalesce(p_fields->>'internal_notes',''),updated_by=auth.uid(),updated_at=now(),revision=revision+1 where id=p_id returning * into result;
 end if;
 insert into platform_admin_audit(actor_id,school_id,target_id,action,operation_id,previous_value,new_value,reason)
 values(auth.uid(),p_school,p_id,case when old.id is null then 'support_created' else 'support_updated' end,p_operation,
 case when old.id is null then null else jsonb_build_object('title',old.title,'category',old.category,'description',old.description,'priority',old.priority,'status',old.status,'internal_notes',old.internal_notes) end,p_fields,'Owner-created administrative support ticket');
 return to_jsonb(result);
end $$;
create function public.platform_admin_audit_history(p_school uuid default null,p_search text default '',p_action text default '',p_from date default null,p_to date default null,p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
 perform require_platform_administrator();
 if p_offset<0 or length(p_search)>160 or length(p_action)>100 or (p_from is not null and p_to is not null and p_from>p_to) then raise exception 'Invalid audit filters'; end if;
 -- Explicit safe metadata projection: never expose raw provider errors, Auth
 -- payloads, invitation links or historical values through diagnostics/history.
 select coalesce(jsonb_agg(to_jsonb(d) order by created_at desc,id),'[]') into result from (
  select a.id,a.school_id,s.name as school_name,s.code as school_code,a.actor_id,a.database_actor,a.action,a.target_id,a.operation_id,a.created_at
  from platform_admin_audit a left join schools s on s.id=a.school_id
  where (p_school is null or a.school_id=p_school) and (p_action='' or a.action=p_action)
   and (p_from is null or a.created_at>=(p_from::timestamp at time zone 'UTC')) and (p_to is null or a.created_at<((p_to+1)::timestamp at time zone 'UTC'))
   and (coalesce(s.name,'')||' '||coalesce(s.code,'')||' '||a.action||' '||coalesce(a.actor_id::text,'')||' '||coalesce(a.operation_id::text,'')) ilike '%'||p_search||'%'
  order by a.created_at desc,a.id limit 101 offset p_offset
 ) d;
 return jsonb_build_object('events',result,'offset',p_offset);
end $$;
revoke all on function public.platform_admin_support(uuid),public.platform_admin_save_support(uuid,uuid,integer,jsonb,uuid),public.platform_admin_audit_history(uuid,text,text,date,date,integer) from public,anon,authenticated;
grant execute on function public.platform_admin_support(uuid),public.platform_admin_save_support(uuid,uuid,integer,jsonb,uuid),public.platform_admin_audit_history(uuid,text,text,date,date,integer) to authenticated;

-- Also remove historical payloads from the older summary views. Audit storage
-- remains intact for trusted investigation; the app shows safe event metadata.
alter function public.platform_admin_directory() rename to platform_admin_directory_support_base;
revoke all on function public.platform_admin_directory_support_base() from public,anon,authenticated;
create function public.platform_admin_directory() returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;begin
 perform require_platform_administrator();result:=platform_admin_directory_support_base();
 result:=jsonb_set(result,'{schools}',coalesce((select jsonb_agg(s||jsonb_build_object('lifecycle_status',c.lifecycle_status)) from jsonb_array_elements(result->'schools') s join schools c on c.id=(s->>'id')::uuid),'[]'));
 return jsonb_set(result,'{audit}',coalesce((select jsonb_agg(a-array['previous_value','new_value','reason']) from jsonb_array_elements(result->'audit') a),'[]'));
end $$;
alter function public.platform_admin_school(uuid) rename to platform_admin_school_support_base;
revoke all on function public.platform_admin_school_support_base(uuid) from public,anon,authenticated;
create function public.platform_admin_school(p_school uuid) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;begin
 perform require_platform_administrator();result:=platform_admin_school_support_base(p_school);
 result:=jsonb_set(result,'{audit}',coalesce((select jsonb_agg(a-array['previous_value','new_value','reason']) from jsonb_array_elements(result->'audit') a),'[]'));
 if jsonb_typeof(result->'provision')='object' then result:=jsonb_set(result,'{provision}',(result->'provision')-'last_error'); end if;
 return result;
end $$;
revoke all on function public.platform_admin_directory(),public.platform_admin_school(uuid) from public,anon;
grant execute on function public.platform_admin_directory(),public.platform_admin_school(uuid) to authenticated;
