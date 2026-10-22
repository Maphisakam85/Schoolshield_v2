-- Opt-in Web Push. All delivery decisions are made with the existing server visibility rules.
create table public.web_push_subscriptions(
 id uuid primary key default gen_random_uuid(),school_id uuid not null references schools(id),user_id uuid not null references profiles(id),
 endpoint text not null unique,subscription jsonb not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
alter table public.web_push_subscriptions enable row level security;
revoke all on public.web_push_subscriptions from anon,authenticated;
create table public.web_push_outbox(
 id uuid primary key default gen_random_uuid(),subscription_id uuid not null references web_push_subscriptions(id) on delete cascade,
 school_id uuid not null references schools(id),user_id uuid not null references profiles(id),event_key text not null,notification_id text,
 status text not null default 'pending' check(status in ('pending','sending','sent','failed','skipped')),attempts int not null default 0,
 available_at timestamptz not null default now(),created_at timestamptz not null default now(),sent_at timestamptz,last_error text,
 unique(subscription_id,event_key));
alter table public.web_push_outbox enable row level security;
revoke all on public.web_push_outbox from anon,authenticated;
grant all on public.web_push_subscriptions,public.web_push_outbox to service_role;
create index web_push_outbox_pending on web_push_outbox(available_at) where status in ('pending','sending');

create function public.register_web_push(p_subscription jsonb) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_endpoint text:=p_subscription->>'endpoint';result uuid;
begin
 perform assert_account_access();
 if v_endpoint is null or length(v_endpoint)>2048 or v_endpoint !~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|([a-zA-Z0-9-]+\.)?notify\.windows\.com|web\.push\.apple\.com)/[^[:space:]]+$'
 or coalesce(p_subscription#>>'{keys,p256dh}','') !~ '^[A-Za-z0-9_-]{80,100}={0,2}$'
 or coalesce(p_subscription#>>'{keys,auth}','') !~ '^[A-Za-z0-9_-]{20,30}={0,2}$' then raise exception 'Invalid or unsupported push subscription';end if;
 if exists(select 1 from web_push_subscriptions s where s.endpoint=v_endpoint and s.user_id<>auth.uid()) then raise exception 'This browser is subscribed to another account. Disable notifications for that account first.';end if;
 if (select count(*) from web_push_subscriptions where user_id=auth.uid())>=10 and not exists(select 1 from web_push_subscriptions s where s.endpoint=v_endpoint and s.user_id=auth.uid()) then raise exception 'Device limit reached';end if;
 insert into web_push_subscriptions(school_id,user_id,endpoint,subscription)values(current_school_id(),auth.uid(),v_endpoint,jsonb_build_object('endpoint',v_endpoint,'keys',jsonb_build_object('auth',p_subscription#>>'{keys,auth}','p256dh',p_subscription#>>'{keys,p256dh}')))
 on conflict(endpoint) do update set subscription=excluded.subscription,school_id=excluded.school_id,updated_at=now() where web_push_subscriptions.user_id=auth.uid()
 returning id into result;return result;
end $$;
create function public.unregister_web_push(p_endpoint text) returns void language plpgsql security definer set search_path=public,pg_temp as $$begin
 if auth.uid() is null then raise exception 'Sign in required';end if;
 delete from web_push_subscriptions where user_id=auth.uid() and endpoint=p_endpoint;
end $$;
revoke all on function public.register_web_push(jsonb),public.unregister_web_push(text) from public,anon;
grant execute on function public.register_web_push(jsonb),public.unregister_web_push(text) to authenticated;

create function public.queue_web_push(p_school uuid,p_event text,p_notice text,p_user uuid default null) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare u record;previous_sub text:=current_setting('request.jwt.claim.sub',true);allowed boolean;
begin
 for u in select distinct s.user_id from web_push_subscriptions s join profiles p on p.id=s.user_id and p.school_id=s.school_id where s.school_id=p_school and p.account_status='Active' and (p_user is null or s.user_id=p_user) loop
  perform set_config('request.jwt.claim.sub',u.user_id::text,true);allowed:=false;
  begin
   perform assert_account_access();
   allowed:=case when p_notice is null then p_user=u.user_id else notification_is_visible(p_notice) end;
  exception when others then allowed:=false;end;
  if allowed then insert into web_push_outbox(subscription_id,school_id,user_id,event_key,notification_id)
   select id,school_id,user_id,p_event,p_notice from web_push_subscriptions where school_id=p_school and user_id=u.user_id on conflict do nothing;end if;
 end loop;
 perform set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);
exception when others then perform set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);raise;
end $$;
revoke all on function public.queue_web_push(uuid,text,text,uuid) from public,anon,authenticated;

create function public.queue_workspace_web_push() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare n jsonb;
begin
 -- Bootstrap/imports and old notifications must not generate a delivery storm.
 if tg_op='INSERT' then return new;end if;
 for n in select candidate.value from jsonb_array_elements(coalesce(new.payload->'notifications','[]'::jsonb)) candidate(value) where nullif(candidate.value->>'id','') is not null and not exists(select 1 from jsonb_array_elements(coalesce(old.payload->'notifications','[]'::jsonb)) o where o->>'id'=candidate.value->>'id') loop
  perform queue_web_push(new.school_id,'notice:'||(n->>'id'),n->>'id');
 end loop;return new;
end $$;
create trigger queue_workspace_web_push after update of payload on school_workspaces for each row execute function queue_workspace_web_push();
create function public.queue_account_web_push() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare notice text;begin
 notice:=(case when new.notification_type='teaching_assignment' then 'assignment-notice:' else 'account-request:' end)||new.id::text;
 perform queue_web_push(new.school_id,notice||':'||new.created_at::text,notice,new.recipient_id);return new;
end $$;
create trigger queue_account_web_push after insert or update of created_at on account_request_notifications for each row execute function queue_account_web_push();
create function public.queue_direct_chat_web_push() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$begin
 perform queue_web_push(new.school_id,'direct-chat:'||new.id::text,null,new.recipient_id);return new;
end $$;
create trigger queue_direct_chat_web_push after insert on sgb_security_messages for each row execute function queue_direct_chat_web_push();
revoke all on function public.queue_workspace_web_push(),public.queue_account_web_push(),public.queue_direct_chat_web_push() from public,anon,authenticated;

create function public.claim_web_push() returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare job record;previous_sub text:=current_setting('request.jwt.claim.sub',true);result jsonb:='[]';permitted boolean;
begin
 update web_push_outbox set status='failed',last_error='Delivery attempt expired' where status='sending' and attempts>=5 and available_at<=now();
 for job in select q.*,s.subscription from web_push_outbox q join web_push_subscriptions s on s.id=q.subscription_id and s.user_id=q.user_id and s.school_id=q.school_id where q.status in ('pending','sending') and q.available_at<=now() and q.attempts<5 order by q.created_at limit 20 for update of q skip locked loop
  perform set_config('request.jwt.claim.sub',job.user_id::text,true);permitted:=false;
  begin
   perform assert_account_access();
   if job.notification_id is null then
    if not exists(select 1 from sgb_security_messages where 'direct-chat:'||id::text=job.event_key and recipient_id=job.user_id and school_id=job.school_id) then raise exception 'Conversation unavailable';end if;
    perform sgb_security_chat_private((select sender_id from sgb_security_messages where 'direct-chat:'||id::text=job.event_key and recipient_id=job.user_id and school_id=job.school_id));end if;
   permitted:=current_school_id()=job.school_id and (job.notification_id is null or notification_is_visible(job.notification_id));
   if job.notification_id is not null and exists(select 1 from notification_reads where school_id=job.school_id and user_id=job.user_id and notification_id=job.notification_id)then permitted:=false;end if;
  exception when others then permitted:=false;end;
  if permitted then
   update web_push_outbox set status='sending',attempts=attempts+1,available_at=now()+interval '5 minutes' where id=job.id;
   result:=result||jsonb_build_array(jsonb_build_object('id',job.id,'subscription_id',job.subscription_id,'subscription',job.subscription,'attempt',job.attempts+1));
  else update web_push_outbox set status='skipped' where id=job.id;end if;
 end loop;
 perform set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);return result;
exception when others then perform set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);raise;
end $$;
revoke all on function public.claim_web_push() from public,anon,authenticated;
grant execute on function public.claim_web_push() to service_role;
notify pgrst,'reload schema';
