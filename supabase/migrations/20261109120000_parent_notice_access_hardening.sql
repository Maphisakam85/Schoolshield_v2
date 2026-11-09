-- Preserve the canonical notice implementation and its learner-link checks.
-- Add the same account/setup/school-lifecycle guard as other school RPCs.
alter function public.persist_parent_document_notice(jsonb)
 rename to persist_parent_document_notice_account_base;
revoke all on function public.persist_parent_document_notice_account_base(jsonb)
 from public,anon,authenticated;
create function public.persist_parent_document_notice(p_record jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform public.assert_account_access();
 return public.persist_parent_document_notice_account_base(p_record);
end $$;
revoke all on function public.persist_parent_document_notice(jsonb) from public,anon;
grant execute on function public.persist_parent_document_notice(jsonb) to authenticated;

-- Anonymous clients never read or write raw school workspaces. Revoke column
-- ACLs too: table-level revocation alone does not remove explicit column grants.
revoke all on public.school_workspaces from public,anon;
do $$ declare columns text; begin
 select string_agg(quote_ident(attname),',') into columns
 from pg_attribute where attrelid='public.school_workspaces'::regclass
 and attnum>0 and not attisdropped;
 execute format('revoke select (%s), insert (%s), update (%s), references (%s) on public.school_workspaces from public, anon',columns,columns,columns,columns);
end $$;

insert into public.platform_admin_audit(action,reason)
values('parent_notice_access_hardened','Account/setup/suspension guard added; anonymous workspace privileges removed; canonical notice logic retained');
notify pgrst,'reload schema';
