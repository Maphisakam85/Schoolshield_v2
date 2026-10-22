-- Email account requests may omit a mobile; keep validation for supplied numbers.
-- Patch only the original validator, preserving identity/platform wrappers and ACLs.
do $migration$
declare target regprocedure:=to_regprocedure('public.begin_user_management_identity_base(uuid,text,uuid,jsonb)');definition text;
 old_check text:=$old$if coalesce(p_fields->>'phone','') !~$old$;
 new_check text:=$new$if nullif(btrim(coalesce(p_fields->>'phone','')),'') is not null and (p_fields->>'phone') !~$new$;
begin
 if target is null then raise exception 'User-management identity validator is missing';end if;
 definition:=pg_get_functiondef(target);
 if strpos(definition,old_check)>0 then execute replace(definition,old_check,new_check);
 elsif strpos(definition,new_check)=0 then raise exception 'Unexpected user-management phone validation; review before applying';end if;
end $migration$;
notify pgrst,'reload schema';
