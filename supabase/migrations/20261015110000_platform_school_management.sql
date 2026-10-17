alter table public.schools add column emis_number text;
alter table public.schools add column physical_address text not null default '';
alter table public.schools add column telephone text not null default '';
alter table public.schools add column email text not null default '';
alter table public.schools add column designated_contact text not null default '';
alter table public.schools add column platform_revision integer not null default 1;
create unique index schools_unique_emis on public.schools(emis_number) where emis_number is not null;

create or replace function public.platform_admin_directory() returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare schools_json jsonb; audit_json jsonb;
begin
 perform public.require_platform_administrator();
 select coalesce(jsonb_agg(to_jsonb(s) order by s.name,s.id),'[]') into schools_json
 from (select id,code,name,data_mode,emis_number,email,designated_contact,created_at from public.schools) s;
 select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc,a.id),'[]') into audit_json
 from (select id,actor_id,database_actor,action,school_id,target_id,previous_value,new_value,reason,created_at
 from public.platform_admin_audit order by created_at desc,id limit 100) a;
 return jsonb_build_object('schools',schools_json,'audit',audit_json);
end $$;

create function public.platform_school_fields(p_fields jsonb) returns jsonb
language plpgsql immutable set search_path=public,pg_temp as $$
declare result jsonb:=jsonb_build_object('name',btrim(coalesce(p_fields->>'name','')),
 'emis_number',nullif(btrim(p_fields->>'emis_number'),''),'physical_address',btrim(coalesce(p_fields->>'physical_address','')),
 'telephone',btrim(coalesce(p_fields->>'telephone','')),'email',lower(btrim(coalesce(p_fields->>'email',''))),
 'designated_contact',btrim(coalesce(p_fields->>'designated_contact','')));
begin
 if length(result->>'name') not between 2 and 120 or length(result->>'physical_address')>500
 or length(result->>'telephone')>40 or length(result->>'designated_contact')>120 or length(result->>'email')>254
 or coalesce(result->>'emis_number','1') !~ '^[0-9]{1,20}$'
 or (result->>'email'<>'' and result->>'email' !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then raise exception 'Enter valid school details (EMIS contains digits only)'; end if;
 return result;
end $$;
create function public.platform_school_metadata(p_school uuid) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('id',id,'code',code,'name',name,'emis_number',emis_number,'physical_address',physical_address,
 'telephone',telephone,'email',email,'designated_contact',designated_contact,'revision',platform_revision,'data_mode',data_mode,'created_at',created_at)
 from public.schools where id=p_school
$$;
create table public.platform_school_provisions (
 id uuid primary key,
 actor_id uuid not null references auth.users(id) on delete restrict,
 school_id uuid not null unique references public.schools(id) on delete restrict,
 principal_id uuid not null unique default gen_random_uuid(),
 fields jsonb not null,
 status text not null default 'Reserved' check(status in ('Reserved','Account ready','Completed','Failed')),
 last_error text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.platform_school_provisions enable row level security;
revoke all on public.platform_school_provisions from public,anon,authenticated;

create function public.platform_admin_school(p_school uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
 perform public.require_platform_administrator();result:=public.platform_school_metadata(p_school);
 if result is null then raise exception 'School not found'; end if;
 return jsonb_build_object('school',result,'provision',(select jsonb_build_object('id',id,'actor_id',actor_id,'status',status,'last_error',last_error,'fields',fields,'principal_setup_pending',exists(select 1 from public.profiles p where p.id=principal_id and p.requires_setup and p.onboarding_completed_at is null and p.account_status='Active')) from public.platform_school_provisions where school_id=p_school),
 'audit',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc) from
 (select id,actor_id,action,previous_value,new_value,reason,created_at from public.platform_admin_audit where school_id=p_school order by created_at desc limit 100) a),'[]'::jsonb));
end $$;
create function public.platform_admin_save_school(p_school uuid,p_revision integer,p_operation uuid,p_fields jsonb,p_reason text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare fields jsonb; previous jsonb; result jsonb; prior public.platform_admin_audit%rowtype; explanation text:=btrim(p_reason);
begin
 perform public.require_platform_administrator();fields:=public.platform_school_fields(p_fields);
 if p_operation is null or p_school is null or explanation is null or length(explanation) not between 5 and 500 then raise exception 'A school, operation and reason (5-500 characters) are required'; end if;
 perform 1 from public.schools where id=p_school for update;if not found then raise exception 'School not found'; end if;
 select * into prior from public.platform_admin_audit where actor_id=auth.uid() and operation_id=p_operation;
 if found then
  if prior.action<>'school_updated' or prior.school_id is distinct from p_school or prior.new_value->'fields' is distinct from fields
  or prior.reason is distinct from explanation or (prior.previous_value->>'revision')::integer is distinct from p_revision then raise exception 'Operation belongs to another school or request'; end if;
  return prior.new_value->'school';
 end if;
 previous:=public.platform_school_metadata(p_school);
 if (previous->>'revision')::integer is distinct from p_revision then raise exception 'School details changed. Refresh before saving.' using errcode='40001'; end if;
 update public.schools set name=fields->>'name',emis_number=fields->>'emis_number',physical_address=fields->>'physical_address',telephone=fields->>'telephone',email=fields->>'email',designated_contact=fields->>'designated_contact',platform_revision=platform_revision+1 where id=p_school;
 result:=public.platform_school_metadata(p_school);
 insert into public.platform_admin_audit(actor_id,action,school_id,target_id,operation_id,previous_value,new_value,reason)
 values(auth.uid(),'school_updated',p_school,p_school,p_operation,previous,jsonb_build_object('fields',fields,'school',result),explanation);
 return result;
end $$;

-- Called only by the existing provision-school Edge Function's service client.
-- p_actor must be obtained from Auth getUser(token), never the request body.
create function public.reserve_platform_school(p_actor uuid,p_operation uuid,p_fields jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare o public.platform_school_provisions%rowtype; fields jsonb; requested_code text:=upper(btrim(p_fields->>'code')); mode text:=p_fields->>'purpose'; sid uuid;
begin
 if not public.platform_administrator_allowed(p_actor) then raise exception 'Platform administrator access denied' using errcode='42501'; end if;
 fields:=public.platform_school_fields(p_fields);
 if p_operation is null or requested_code is null or requested_code !~ '^[A-Z0-9][A-Z0-9-]{2,31}$' or mode is null or mode not in ('live','qa','demo')
 or length(btrim(coalesce(p_fields->>'principal_first_name',''))) not between 1 and 60
 or length(btrim(coalesce(p_fields->>'principal_last_name',''))) not between 1 and 60
 or coalesce(p_fields->>'principal_email','') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
 or coalesce(p_fields->>'principal_phone','') !~ '^\+27[6-8][0-9]{8}$' then raise exception 'Enter valid school and designated Principal details'; end if;
 if mode='live' and p_fields->>'principal_email' ~* '\.test$' then raise exception 'Live schools require verified real contact details; use QA for fictional accounts'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_operation::text,0));
 select * into o from public.platform_school_provisions where id=p_operation;
 if found then if o.actor_id<>p_actor or o.fields is distinct from p_fields then raise exception 'Provisioning operation belongs to another request'; end if;return to_jsonb(o);end if;
 perform pg_advisory_xact_lock(hashtextextended(lower(fields->>'name'),1));
 if exists(select 1 from public.schools where schools.code=requested_code) then raise exception 'School code already exists'; end if;
 if exists(select 1 from public.schools where lower(btrim(name))=lower(fields->>'name')) then raise exception 'A school with this name already exists; review the directory before creating another'; end if;
 insert into public.schools(code,name,data_mode,emis_number,physical_address,telephone,email,designated_contact)
 values(requested_code,fields->>'name',mode,fields->>'emis_number',fields->>'physical_address',fields->>'telephone',fields->>'email',fields->>'designated_contact') returning id into sid;
 insert into public.platform_school_provisions(id,actor_id,school_id,fields) values(p_operation,p_actor,sid,p_fields) returning * into o;
 insert into public.platform_admin_audit(actor_id,action,school_id,target_id,operation_id,new_value,reason)
 values(p_actor,'school_reserved',sid,sid,p_operation,public.platform_school_metadata(sid),'School provisioning reserved; Principal setup pending');
 return to_jsonb(o);
end $$;
create function public.finish_platform_school(p_actor uuid,p_operation uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare o public.platform_school_provisions%rowtype; u record; p public.profiles%rowtype; school_code text;
begin
 if not public.platform_administrator_allowed(p_actor) then raise exception 'Platform administrator access denied' using errcode='42501'; end if;
 select * into o from public.platform_school_provisions where id=p_operation for update;
 if o.id is null or o.actor_id<>p_actor then raise exception 'Provisioning operation not found for this administrator'; end if;
 select code into school_code from public.schools where id=o.school_id;select * into u from auth.users where id=o.principal_id;
 if u.id is null or u.raw_app_meta_data->>'school_code' is distinct from school_code or u.raw_app_meta_data->>'role' is distinct from 'principal'
 or lower(u.email) is distinct from lower(o.fields->>'principal_email') then raise exception 'Reserved Principal Auth identity does not match'; end if;
 insert into public.profiles(id,school_id,role,display_name,first_name,last_name,phone,requires_setup,account_status)
 values(o.principal_id,o.school_id,'principal',(o.fields->>'principal_first_name')||' '||(o.fields->>'principal_last_name'),o.fields->>'principal_first_name',o.fields->>'principal_last_name',o.fields->>'principal_phone',true,'Inactive') on conflict(id) do nothing;
 select * into p from public.profiles where id=o.principal_id;
 if p.school_id is distinct from o.school_id or p.role<>'principal' then raise exception 'Principal profile assignment mismatch'; end if;
 if o.status<>'Completed' then
  update public.profiles set account_status='Active',requires_setup=true where id=o.principal_id returning * into p;
  update public.platform_school_provisions set status='Account ready',last_error=null,updated_at=now() where id=o.id;
  insert into public.platform_admin_audit(actor_id,action,school_id,target_id,reason) values(p_actor,'principal_account_ready',o.school_id,o.principal_id,'Real Principal Auth identity confirmed; invitation completion pending');
 end if;return to_jsonb(p);
end $$;
create function public.record_platform_provision_result(p_actor uuid,p_operation uuid,p_success boolean,p_error text default null,p_setup_link_generated boolean default false) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare o public.platform_school_provisions%rowtype;
begin
 if not public.platform_administrator_allowed(p_actor) then raise exception 'Platform administrator access denied' using errcode='42501'; end if;
 select * into o from public.platform_school_provisions where id=p_operation and actor_id=p_actor for update;
 if not found then raise exception 'Provisioning operation not found';end if;
 if p_success and p_setup_link_generated then
  insert into public.platform_admin_audit(actor_id,action,school_id,target_id,reason) values(p_actor,'principal_setup_link_generated',o.school_id,o.principal_id,'Private setup link generated; delivery is not claimed');
 end if;
 if o.status='Completed' then return;end if;
 if p_success and o.status<>'Account ready' then raise exception 'Confirm the Principal account before completing provisioning';end if;
 update public.platform_school_provisions set status=case when p_success then 'Completed' else 'Failed' end,last_error=case when p_success then null else left(coalesce(p_error,'Provisioning failed; retry the same operation'),500) end,updated_at=now() where id=o.id;
 insert into public.platform_admin_audit(actor_id,action,school_id,target_id,reason)
 values(p_actor,case when p_success then 'school_provisioned' else 'school_provision_failed' end,o.school_id,o.principal_id,case when p_success then 'Principal setup link generated; delivery is not claimed' else 'Provisioning failed; operation retained for retry' end);
end $$;
revoke all on function public.platform_school_fields(jsonb),public.platform_school_metadata(uuid),public.platform_admin_school(uuid),public.platform_admin_save_school(uuid,integer,uuid,jsonb,text),public.reserve_platform_school(uuid,uuid,jsonb),public.finish_platform_school(uuid,uuid),public.record_platform_provision_result(uuid,uuid,boolean,text,boolean) from public,anon,authenticated;
grant execute on function public.platform_admin_school(uuid),public.platform_admin_save_school(uuid,integer,uuid,jsonb,text) to authenticated;
grant execute on function public.reserve_platform_school(uuid,uuid,jsonb),public.finish_platform_school(uuid,uuid),public.record_platform_provision_result(uuid,uuid,boolean,text,boolean) to service_role;
