-- A staff record and its real Auth account must be explicitly linked. Matching
-- employee IDs cannot silently produce a second personnel identity.
alter function begin_user_management(uuid,text,uuid,jsonb) rename to begin_user_management_identity_base;
revoke all on function begin_user_management_identity_base(uuid,text,uuid,jsonb) from public,anon,authenticated;
create function begin_user_management(p_operation uuid,p_action text,p_target uuid,p_fields jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare employee text:=nullif(btrim(p_fields->>'employee_id'),'');tenant uuid:=current_school_id();
begin
 perform assert_account_access();if current_app_role() not in ('principal','deputy','clerk') then raise exception 'User management access denied';end if;
 if exists(select 1 from user_management_operations where id=p_operation) then return begin_user_management_identity_base(p_operation,p_action,p_target,p_fields);end if;
 if p_action in ('create','edit') and employee is not null and exists(select 1 from school_staff where school_id=tenant and profile_id is distinct from p_target and (record->>'employeeId'=employee or legacy_ref=employee) and id::text is distinct from nullif(p_fields->>'staff_id','')) then raise exception 'An existing staff record uses this employee ID. Principal or Deputy must select that existing staff identity when linking the account';end if;
 return begin_user_management_identity_base(p_operation,p_action,p_target,p_fields);
end $$;
revoke all on function begin_user_management(uuid,text,uuid,jsonb) from public,anon;grant execute on function begin_user_management(uuid,text,uuid,jsonb) to authenticated;
