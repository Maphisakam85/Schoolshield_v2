-- Cross-school provisioning is a separate, explicitly allowlisted pilot-admin
-- backend operation. Ordinary user management remains bound to one school.
create table pilot_school_provisions(id uuid primary key,actor_id uuid not null references profiles(id),school_id uuid not null references schools(id),principal_id uuid not null default gen_random_uuid(),fields jsonb not null,status text not null default 'Pending' check(status in ('Pending','Completed')),created_at timestamptz not null default now());
alter table pilot_school_provisions enable row level security;revoke all on pilot_school_provisions from public,anon,authenticated;
create function reserve_pilot_school(p_actor uuid,p_operation uuid,p_fields jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare a profiles%rowtype;o pilot_school_provisions%rowtype;code text:=upper(btrim(p_fields->>'code'));school_name text:=btrim(p_fields->>'name');
begin
 select * into a from profiles where id=p_actor;
 if a.id is null or a.role<>'principal' or a.account_status<>'Active' or (a.requires_setup and a.onboarding_completed_at is null) then raise exception 'Active Principal required';end if;
 select * into o from pilot_school_provisions where id=p_operation;
 if found then if o.actor_id<>p_actor or o.fields is distinct from p_fields then raise exception 'Provisioning operation belongs to another request';end if;return to_jsonb(o);end if;
 if code !~ '^[A-Z0-9][A-Z0-9-]{1,29}$' or length(school_name) not between 2 and 120 then raise exception 'Enter a school name and unique school code';end if;
 if coalesce(p_fields->>'email','') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or coalesce(p_fields->>'phone','') !~ '^\+27[6-8][0-9]{8}$' or length(btrim(coalesce(p_fields->>'first_name',''))) not between 1 and 60 or length(btrim(coalesce(p_fields->>'last_name',''))) not between 1 and 60 then raise exception 'Enter valid Principal contact details';end if;
 insert into schools(id,code,name) values(p_operation,code,school_name);
 insert into pilot_school_provisions(id,actor_id,school_id,fields) values(p_operation,p_actor,p_operation,p_fields) returning * into o;return to_jsonb(o);
end $$;
create function finish_pilot_school(p_operation uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare o pilot_school_provisions%rowtype;u record;p profiles%rowtype;code text;
begin
 select * into o from pilot_school_provisions where id=p_operation for update;if o.id is null then raise exception 'Provisioning operation not found';end if;
 select s.code into code from schools s where s.id=o.school_id;select * into u from auth.users where id=o.principal_id;
 if u.id is null or u.raw_app_meta_data->>'school_code' is distinct from code or u.raw_app_meta_data->>'role' is distinct from 'principal' or lower(u.email) is distinct from lower(o.fields->>'email') then raise exception 'Real Principal Auth assignment must be confirmed';end if;
 insert into profiles(id,school_id,role,display_name,first_name,last_name,phone,requires_setup,account_status) values(o.principal_id,o.school_id,'principal',(o.fields->>'first_name')||' '||(o.fields->>'last_name'),o.fields->>'first_name',o.fields->>'last_name',o.fields->>'phone',true,'Inactive') on conflict(id) do nothing;
 select * into p from profiles where id=o.principal_id;if p.school_id is distinct from o.school_id or p.role<>'principal' then raise exception 'Reserved profile assignment mismatch';end if;
 if o.status='Pending' then
  update profiles set first_name=o.fields->>'first_name',last_name=o.fields->>'last_name',phone=o.fields->>'phone',account_status='Active',requires_setup=true where id=o.principal_id returning * into p;
  update pilot_school_provisions set status='Completed' where id=o.id;
  insert into user_management_audit(school_id,user_id,actor_id,action,new_value,operation_id) values(o.school_id,p.id,o.actor_id,'School Principal provisioned',to_jsonb(p),o.id);
 end if;return to_jsonb(p);
end $$;
revoke all on function reserve_pilot_school(uuid,uuid,jsonb),finish_pilot_school(uuid) from public,anon,authenticated;
grant execute on function reserve_pilot_school(uuid,uuid,jsonb),finish_pilot_school(uuid) to service_role;
