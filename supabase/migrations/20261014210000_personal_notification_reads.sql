-- Read state belongs to a person, never to the shared workspace notification.
create table public.notification_reads (
 school_id uuid not null references public.schools(id),
 notification_id text not null,
 user_id uuid not null references public.profiles(id),
 read_at timestamptz not null default now(),
 primary key(school_id,notification_id,user_id)
);
alter table public.notification_reads enable row level security;
grant select on public.notification_reads to authenticated;
create policy own_notification_reads on public.notification_reads for select to authenticated
 using(account_is_ready() and school_id=current_school_id() and user_id=auth.uid());

create function public.notification_is_visible(p_id text) returns boolean
language plpgsql stable security definer set search_path=public as $$
declare actor profiles%rowtype; notice jsonb; data jsonb; audience text;
begin
 if not account_is_ready() then return false;end if;
 select * into actor from profiles where id=auth.uid();
 if p_id like 'assignment-notice:%' or p_id like 'account-request:%' then
  return exists(select 1 from account_request_notifications n where n.school_id=actor.school_id
   and n.recipient_id=actor.id and p_id=(case when n.notification_type='teaching_assignment' then 'assignment-notice:' else 'account-request:' end)||n.id::text);
 end if;
 select value into notice from school_workspaces w,jsonb_array_elements(coalesce(w.payload->'notifications','[]'))
  where w.school_id=actor.school_id and value->>'id'=p_id;
 if notice is null or nullif(notice->>'recipientId','') is not null and notice->>'recipientId'<>actor.id::text
  or nullif(notice->>'recipient','') is not null and notice->>'recipientId' is distinct from actor.id::text then return false;end if;
 if actor.role<>'parent' then
  data:=read_school_dataset()->'payload';
  return exists(select 1 from jsonb_array_elements(coalesce(data->'notifications','[]')) n where n->>'id'=p_id);
 end if;
 if notice->>'incidentId' is not null then return false;end if;
 if notice->>'recipientId'=actor.id::text then return true;end if;
 if notice->>'announcementId' is not null then
  audience:=notice->>'audienceId';
  if audience in ('whole-school','all-parents') then return true;end if;
  return exists(select 1 from school_learners l join parent_learner_links p
    on p.school_id=l.school_id and p.learner_ref=l.legacy_ref
    join teacher_review_classes c on c.school_id=l.school_id and c.id=l.class_id
    where l.school_id=actor.school_id and p.parent_id=actor.id and
    (audience='class-'||c.class_ref or audience='grade-'||replace(c.grade,' ','-')
     or audience='my-classes-parents' and coalesce(notice->'classIds','[]') ? c.class_ref));
 end if;
 if notice->>'scope'='whole-school' then return true;end if;
 if notice->>'learnerId' is not null or notice->>'class' is not null then
  return exists(select 1 from school_learners l join parent_learner_links p
   on p.school_id=l.school_id and p.learner_ref=l.legacy_ref
   left join teacher_review_classes c on c.school_id=l.school_id and c.id=l.class_id
   where l.school_id=actor.school_id and p.parent_id=actor.id
   and (notice->>'learnerId' in (l.legacy_ref,l.id::text) or notice->>'learnerId' is null and notice->>'class' in(c.class_ref,c.id::text))
   and coalesce(notice->>'scope','parents') in ('parents','parent','learner','system'));
 end if;
 return notice->>'scope' in ('parents','parent');
end $$;
revoke all on function public.notification_is_visible(text) from public,anon,authenticated;

create function public.mark_notifications_read(p_ids text[]) returns jsonb
language plpgsql security definer set search_path=public as $$
declare key text;stamp timestamptz:=clock_timestamp();begin
 perform assert_account_access();
 if p_ids is null or cardinality(p_ids)>500 then raise exception 'Choose up to 500 notifications';end if;
 foreach key in array p_ids loop
  if key is null or not notification_is_visible(key) then raise exception 'Notification access denied';end if;
 end loop;
 insert into notification_reads(school_id,notification_id,user_id,read_at)
 select current_school_id(),entry.notification_key,auth.uid(),stamp from unnest(p_ids) entry(notification_key)
 on conflict(school_id,notification_id,user_id) do nothing;
 return jsonb_build_object('ids',to_jsonb(p_ids),'read_at',stamp);
end $$;
revoke all on function public.mark_notifications_read(text[]) from public,anon;
grant execute on function public.mark_notifications_read(text[]) to authenticated;

create function public.get_notification_reads() returns jsonb
language plpgsql stable security definer set search_path=public as $$begin
 perform assert_account_access();
 return coalesce((select jsonb_agg(jsonb_build_object('notification_id',notification_id,'read_at',read_at))
 from notification_reads where school_id=current_school_id() and user_id=auth.uid()),'[]');end $$;
revoke all on function public.get_notification_reads() from public,anon;
grant execute on function public.get_notification_reads() to authenticated;

create function public.get_account_request_alerts() returns jsonb
language plpgsql stable security definer set search_path=public as $$begin
 perform assert_account_access();
 if current_app_role() not in ('principal','clerk') then return '[]';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'request_id',n.request_id,'created_at',n.created_at,'read_at',r.read_at))
 from account_request_notifications n join account_requests a on a.id=n.request_id and a.school_id=n.school_id
 left join notification_reads r on r.school_id=n.school_id and r.notification_id='account-request:'||n.id::text and r.user_id=auth.uid()
 where n.school_id=current_school_id() and n.recipient_id=auth.uid() and n.notification_type='account_request' and a.status='pending'),'[]');
end $$;
revoke all on function public.get_account_request_alerts() from public,anon;
grant execute on function public.get_account_request_alerts() to authenticated;

-- Recipient-specific legacy reads can be attributed; shared workspace booleans cannot.
insert into notification_reads(school_id,notification_id,user_id,read_at)
 select n.school_id,(case when notification_type='teaching_assignment' then 'assignment-notice:' else 'account-request:' end)||n.id::text,n.recipient_id,n.read_at
 from account_request_notifications n join profiles p on p.id=n.recipient_id and p.school_id=n.school_id
 where n.read_at is not null on conflict do nothing;
create function public.reset_notification_event_read() returns trigger language plpgsql security definer set search_path=public as $$begin
 if new.created_at is distinct from old.created_at then delete from notification_reads where school_id=new.school_id and user_id=new.recipient_id and notification_id in ('assignment-notice:'||new.id::text,'account-request:'||new.id::text);end if;return new;end $$;
create trigger reset_notification_event_read after update of created_at on account_request_notifications for each row execute function public.reset_notification_event_read();
do $$begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  alter publication supabase_realtime add table public.notification_reads;
 end if;
end $$;
