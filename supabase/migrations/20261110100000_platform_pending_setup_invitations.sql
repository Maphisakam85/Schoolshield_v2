-- Permit the owner to invite active school accounts with no completed setup,
-- including legacy records whose requires_setup flag was false/null.
-- Existing owner, school, revision, protected identity and confirmation checks remain.
do $migration$
declare definition text;
begin
 select pg_get_functiondef('public.begin_platform_account(uuid,uuid,uuid,text,uuid,jsonb,boolean,text)'::regprocedure) into definition;
 if position('t.account_status<>''Active'' or not t.requires_setup or t.onboarding_completed_at is not null' in definition)=0 then raise exception 'Unexpected invitation eligibility definition';end if;
 definition:=replace(definition,'t.account_status<>''Active'' or not t.requires_setup or t.onboarding_completed_at is not null','t.account_status is distinct from ''Active'' or t.onboarding_completed_at is not null');
 execute definition;
 select pg_get_functiondef('public.finish_platform_account(uuid,uuid,boolean)'::regprocedure) into definition;
 if position('if o.action in (''create'',''edit'',''status'') then' in definition)=0 or position('requires_setup=case when o.action=''create'' then true else requires_setup end' in definition)=0 then raise exception 'Unexpected account completion definition';end if;
 definition:=replace(definition,'if o.action in (''create'',''edit'',''status'') then','if o.action in (''create'',''edit'',''status'',''invite'') then');
 definition:=replace(definition,'requires_setup=case when o.action=''create'' then true else requires_setup end','requires_setup=case when o.action in (''create'',''invite'') then true else requires_setup end');
 execute definition;
end $migration$;
