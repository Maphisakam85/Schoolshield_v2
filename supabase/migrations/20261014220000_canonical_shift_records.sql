-- Legacy workspace/audit records remain readable. This table is the typed shift ledger.
alter table school_security_officers add constraint security_officer_tenant_identity unique(school_id,id);
create table public.security_shifts (
 id uuid primary key default gen_random_uuid(),school_id uuid not null references schools(id),
 officer_id uuid not null,legacy_id text not null,legacy_officer_id text not null,
 shift_date date,scheduled_start time,scheduled_end time,
 actual_clock_in timestamptz,actual_clock_out timestamptz,duration_minutes integer,
 status text not null check(status in ('ACTIVE','COMPLETED','INCOMPLETE')),
 site text,record jsonb not null,unique(school_id,legacy_id),
 foreign key(school_id,officer_id) references school_security_officers(school_id,id)
);
create unique index security_shifts_one_active on security_shifts(school_id,officer_id) where status='ACTIVE';
alter table security_shifts enable row level security;grant select on security_shifts to authenticated;
create function public.owns_security_officer(p_officer uuid) returns boolean language sql stable security definer set search_path=public as $$
 select account_is_ready() and exists(select 1 from school_security_officers o join school_staff s on s.id=o.staff_id and s.school_id=o.school_id
 where o.id=p_officer and o.school_id=current_school_id() and s.profile_id=auth.uid())
$$;
revoke all on function owns_security_officer(uuid) from public,anon;grant execute on function owns_security_officer(uuid) to authenticated;
create policy scoped_security_shifts on security_shifts for select to authenticated using(account_is_ready() and school_id=current_school_id()
 and (current_app_role() in ('principal','deputy') or current_app_role()='security' and owns_security_officer(officer_id)));

create function public.school_date_only(value text) returns date language plpgsql immutable as $$
declare result date;begin
 if value ~ '^\d{4}-\d{2}-\d{2}$' then result:=value::date;
 elsif value ~ '^\d{1,2} [A-Za-z]{3} \d{4}$' then
  result:=to_date(value,'DD Mon YYYY');
  if lower(to_char(result,'FMDD Mon YYYY'))<>lower(value) and lower(to_char(result,'DD Mon YYYY'))<>lower(value) then return null;end if;
 else return null;end if;return result;
exception when others then return null;end $$;
create function public.school_audit_timestamp(value text) returns timestamptz language plpgsql immutable as $$begin
 if value !~ '^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:\d{2})$' then return null;end if;return value::timestamptz;
exception when others then return null;end $$;
revoke all on function school_date_only(text),school_audit_timestamp(text) from public,anon,authenticated;

create function public.project_security_shift() returns trigger language plpgsql security definer set search_path=public as $$
declare officer uuid;canonical uuid;begin
 select id into officer from school_security_officers where school_id=new.school_id and (legacy_ref=new.officer_id or id::text=new.officer_id);
 if officer is null then return new;end if; -- retain unresolved legacy row, never guess by name
 canonical:=case when new.id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then new.id::uuid else school_alias(new.school_id,'security-shifts',new.id) end;
 insert into security_shifts(id,school_id,officer_id,legacy_id,legacy_officer_id,shift_date,scheduled_start,scheduled_end,actual_clock_in,actual_clock_out,duration_minutes,status,site,record)
 values(canonical,new.school_id,officer,new.id,new.officer_id,school_date_only(coalesce(new.record->>'scheduledDate',new.record->>'date')),
 case when new.record->>'scheduledStart' ~ '^([01]\d|2[0-3]):[0-5]\d$' then (new.record->>'scheduledStart')::time end,
 case when new.record->>'scheduledEnd' ~ '^([01]\d|2[0-3]):[0-5]\d$' then (new.record->>'scheduledEnd')::time end,
 school_audit_timestamp(new.record->>'actualCheckInAt'),school_audit_timestamp(new.record->>'actualCheckOutAt'),
 case when new.record->>'scheduledDurationMinutes' ~ '^\d{1,4}$' then (new.record->>'scheduledDurationMinutes')::integer end,
 case when new.active then 'ACTIVE' when new.record->>'status'='Completed' then 'COMPLETED' else 'INCOMPLETE' end,new.record->>'site',new.record)
 on conflict(school_id,legacy_id) do update set actual_clock_out=excluded.actual_clock_out,status=excluded.status,record=excluded.record;
 return new;
end $$;
create trigger project_security_shift after insert or update on security_shift_attendance for each row execute function project_security_shift();
revoke all on function project_security_shift() from public,anon,authenticated;
-- Existing typed audit rows already preserve exact actual timestamps.
update security_shift_attendance set record=record;

-- Preserve existing RPC validation/locking; new audit IDs are full UUIDs.
do $$declare body text;begin
 body:=pg_get_functiondef('public.record_security_shift(text,text,date,time,time)'::regprocedure);
 body:=replace(body,'''SEC-ATT-''||gen_random_uuid()','gen_random_uuid()::text');execute body;
end $$;
alter function record_security_shift(text,text,date,time,time) rename to record_security_shift_legacy;
revoke all on function record_security_shift_legacy(text,text,date,time,time) from public,anon,authenticated;
create function public.record_security_shift(p_officer_id text,p_action text,p_date date default null,p_start time default null,p_end time default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare legacy text;result jsonb;shift security_shifts%rowtype;begin
 perform assert_account_access();
 select legacy_ref into legacy from school_security_officers where school_id=current_school_id() and (legacy_ref=p_officer_id or id::text=p_officer_id);
 if legacy is null then raise exception 'Officer not found in your school';end if;
 result:=record_security_shift_legacy(legacy,p_action,p_date,p_start,p_end);
 select * into shift from security_shifts where school_id=current_school_id() and legacy_id=result->>'id';
 return result||jsonb_build_object('id',shift.id,'officerId',shift.officer_id,'legacyId',shift.legacy_id,'legacyOfficerId',legacy,
 'shiftDate',shift.shift_date,'actualClockIn',shift.actual_clock_in,'actualClockOut',shift.actual_clock_out,'durationMinutes',shift.duration_minutes,'shiftStatus',shift.status);
end $$;
revoke all on function record_security_shift(text,text,date,time,time) from public,anon;grant execute on function record_security_shift(text,text,date,time,time) to authenticated;

-- Keep the compatibility workspace projection in step with the typed ledger.
create or replace function public.preserve_security_shift_audit() returns trigger language plpgsql security definer set search_path=public as $$
declare records jsonb;begin
 select coalesce(jsonb_agg(a.record||jsonb_build_object('entityId',s.id,'officerEntityId',s.officer_id,'shiftDate',s.shift_date,
 'actualClockIn',s.actual_clock_in,'actualClockOut',s.actual_clock_out,'durationMinutes',s.duration_minutes,'shiftStatus',s.status)
 order by a.record->>'actualCheckInAt' desc),'[]') into records from security_shift_attendance a left join security_shifts s on s.school_id=a.school_id and s.legacy_id=a.id where a.school_id=new.school_id;
 records:=records||coalesce((select jsonb_agg(value) from jsonb_array_elements(coalesce(old.payload->'securityAttendance','[]')) where not exists(select 1 from security_shift_attendance a where a.school_id=new.school_id and a.id=value->>'id')),'[]');
 new.payload:=jsonb_set(new.payload,'{securityAttendance}',records);return new;end $$;
