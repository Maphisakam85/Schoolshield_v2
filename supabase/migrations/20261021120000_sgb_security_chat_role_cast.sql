-- profiles.role is an enum in Supabase. Compare recipient CASE text explicitly.
create or replace function public.sgb_security_chat_private(p_peer uuid default null, p_body text default null, p_message_id uuid default null, p_before timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare actor public.profiles%rowtype; peer public.profiles%rowtype; saved public.sgb_security_messages%rowtype; result jsonb;
begin
 select * into actor from public.profiles where id=auth.uid();
 if actor.id is null or actor.school_id is null or actor.role not in ('sgb','security') or actor.account_status is distinct from 'Active' or (coalesce(actor.requires_setup,false) and actor.onboarding_completed_at is null) then
  raise exception 'SGB or Security access required' using errcode='42501';
 end if;
 if p_peer is null then
  if p_body is not null then raise exception 'Choose a recipient'; end if;
  return jsonb_build_object('contacts',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.display_name,'role',p.role) order by p.display_name,p.id) from public.profiles p
   where p.school_id=actor.school_id and p.account_status='Active' and not(coalesce(p.requires_setup,false) and p.onboarding_completed_at is null)
   and p.role::text=case when actor.role='sgb' then 'security' else 'sgb' end),'[]'::jsonb));
 end if;
 select * into peer from public.profiles where id=p_peer;
 if peer.id is null or peer.school_id is distinct from actor.school_id or peer.role::text is distinct from (case when actor.role='sgb' then 'security' else 'sgb' end) or peer.account_status is distinct from 'Active' or (coalesce(peer.requires_setup,false) and peer.onboarding_completed_at is null) then
  raise exception 'Recipient unavailable' using errcode='42501';
 end if;
 if p_body is not null then
  if p_message_id is null or length(btrim(p_body)) not between 1 and 4000 then raise exception 'Enter a message of 1–4000 characters'; end if;
  insert into public.sgb_security_messages(id,school_id,sender_id,recipient_id,body)
   values(p_message_id,actor.school_id,actor.id,peer.id,btrim(p_body)) on conflict(id) do nothing;
  select * into saved from public.sgb_security_messages where id=p_message_id;
  if saved.sender_id is distinct from actor.id or saved.recipient_id is distinct from peer.id or saved.school_id is distinct from actor.school_id or saved.body is distinct from btrim(p_body) then raise exception 'Message identifier conflict'; end if;
 end if;
 select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at,m.id),'[]'::jsonb) into result from (
  select id,sender_id,recipient_id,body,created_at from public.sgb_security_messages
  where school_id=actor.school_id and ((sender_id=actor.id and recipient_id=peer.id) or (sender_id=peer.id and recipient_id=actor.id))
   and (p_before is null or created_at<p_before)
  order by created_at desc,id desc limit 100
 ) m;
 return jsonb_build_object('messages',result,'user_id',actor.id);
end;
$$;

revoke all on function public.sgb_security_chat_private(uuid,text,uuid,timestamptz) from public,anon,authenticated;
notify pgrst,'reload schema';
