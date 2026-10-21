-- The new direct channel must honour live suspension/account readiness too.
alter function public.sgb_security_chat(uuid,text,uuid,timestamptz) rename to sgb_security_chat_private;
revoke all on function public.sgb_security_chat_private(uuid,text,uuid,timestamptz) from public,anon,authenticated;
create function public.sgb_security_chat(p_peer uuid default null,p_body text default null,p_message_id uuid default null,p_before timestamptz default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform public.assert_account_access();
 return public.sgb_security_chat_private(p_peer,p_body,p_message_id,p_before);
end $$;
revoke all on function public.sgb_security_chat(uuid,text,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.sgb_security_chat(uuid,text,uuid,timestamptz) to authenticated;
notify pgrst,'reload schema';
