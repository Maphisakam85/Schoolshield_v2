-- Inbox previews are restricted to the authenticated participant's own conversations.
create or replace function public.sgb_security_chat(p_peer uuid default null,p_body text default null,p_message_id uuid default null,p_before timestamptz default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb; inbox jsonb; school uuid;
begin
 perform public.assert_account_access();
 result:=public.sgb_security_chat_private(p_peer,p_body,p_message_id,p_before);
 if p_peer is not null then return result; end if;
 select school_id into school from public.profiles where id=auth.uid();
 select coalesce(jsonb_agg(c.value || jsonb_build_object('last_message',m.message) order by m.created_at desc nulls last,c.value->>'name',c.value->>'id'),'[]'::jsonb)
 into inbox from jsonb_array_elements(result->'contacts') c(value)
 left join lateral (
  select jsonb_build_object('id',id,'body',body,'sender_id',sender_id,'created_at',created_at) message,created_at
  from public.sgb_security_messages
  where school_id=school and ((sender_id=auth.uid() and recipient_id=(c.value->>'id')::uuid) or (recipient_id=auth.uid() and sender_id=(c.value->>'id')::uuid))
  order by created_at desc,id desc limit 1
 ) m on true;
 return result || jsonb_build_object('contacts',inbox,'user_id',auth.uid());
end $$;
revoke all on function public.sgb_security_chat(uuid,text,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.sgb_security_chat(uuid,text,uuid,timestamptz) to authenticated;
notify pgrst,'reload schema';
