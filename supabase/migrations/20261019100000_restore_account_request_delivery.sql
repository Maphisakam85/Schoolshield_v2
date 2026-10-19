-- Forward-only repair for projects still exposing the original four-argument
-- request RPC. Preserve that API; do not replay the old onboarding migration.
alter table public.account_requests add column if not exists invitation_method text not null default 'email';
alter table public.account_requests add column if not exists phone text;
do $$ begin
 if not exists(select 1 from pg_constraint where conrelid='public.account_requests'::regclass and conname='account_request_delivery_preference_valid') then
  alter table public.account_requests add constraint account_request_delivery_preference_valid
   check(invitation_method in ('email','sms') and (invitation_method<>'sms' or (phone is not null and phone ~ '^\+27[6-8][0-9]{8}$')));
 end if;
end $$;

create or replace function public.request_school_account(
 p_school_code text,p_email text,p_display_name text,p_requested_role public.app_role,
 p_invitation_method text,p_phone text
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare target_school_id uuid;request_id uuid;clean_phone text;clean_email text:=lower(btrim(coalesce(p_email,'')));
begin
 if p_invitation_method is null or p_invitation_method not in ('email','sms') then raise exception 'Choose Email or SMS'; end if;
 if length(btrim(coalesce(p_display_name,''))) not between 2 and 120 then raise exception 'Enter a full name between 2 and 120 characters'; end if;
 if length(clean_email)>254 or clean_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter a valid email address'; end if;
 select id into target_school_id from public.schools where code=upper(btrim(p_school_code));
 if target_school_id is null then raise exception 'School code not found'; end if;
 if not public.school_access_enabled(target_school_id) then raise exception 'Account requests are unavailable for this school'; end if;
 if exists(select 1 from public.profiles where school_id=target_school_id and lower(email)=clean_email) then raise exception 'An account already exists for this school and email. Sign in or reset your password.'; end if;
 if p_invitation_method='sms' then
  clean_phone:=regexp_replace(btrim(coalesce(p_phone,'')),'[[:space:]().-]','','g');
  if clean_phone ~ '^0027' then clean_phone:='+'||substr(clean_phone,3);
  elsif clean_phone ~ '^27' then clean_phone:='+'||clean_phone;
  elsif clean_phone ~ '^0' then clean_phone:='+27'||substr(clean_phone,2);end if;
  if clean_phone !~ '^\+27[6-8][0-9]{8}$' then raise exception 'Enter a valid South African cellphone number for SMS'; end if;
 end if;
 -- A requested role is untrusted. Approval assigns the actual school role.
 if p_requested_role is null or p_requested_role not in ('teacher','parent','security') then p_requested_role:='parent';end if;
 insert into public.account_requests(school_id,email,display_name,requested_role,invitation_method,phone)
 values(target_school_id,clean_email,btrim(p_display_name),p_requested_role,p_invitation_method,clean_phone)
 on conflict(school_id,email) do update set display_name=excluded.display_name,requested_role=excluded.requested_role,
 invitation_method=excluded.invitation_method,phone=excluded.phone,status='pending',approved_role=null,reviewed_by=null,reviewed_at=null,created_at=now()
 where public.account_requests.status<>'approved' returning id into request_id;
 if request_id is null then raise exception 'An approved account already exists for this school and email';end if;
 return request_id;
end $$;
-- Explicit forwarding avoids overload ambiguity from defaulted extra arguments.
create or replace function public.request_school_account(p_school_code text,p_email text,p_display_name text,p_requested_role public.app_role default 'parent') returns uuid
language sql security definer set search_path=public,pg_temp as $$
 select public.request_school_account(p_school_code,p_email,p_display_name,p_requested_role,'email',null)
$$;
revoke all on function public.request_school_account(text,text,text,public.app_role,text,text),public.request_school_account(text,text,text,public.app_role) from public,anon,authenticated;
grant execute on function public.request_school_account(text,text,text,public.app_role,text,text),public.request_school_account(text,text,text,public.app_role) to anon,authenticated;
notify pgrst,'reload schema';
