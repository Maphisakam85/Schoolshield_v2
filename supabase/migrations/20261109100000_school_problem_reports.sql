-- School-submitted support reuses owner tickets; internal notes remain owner-only.
alter table public.platform_support_tickets drop constraint platform_support_tickets_origin_check;
alter table public.platform_support_tickets add constraint platform_support_tickets_origin_check check(origin in ('Owner-created','School-reported'));
create table public.support_email_queue (
 ticket_id uuid primary key references public.platform_support_tickets(id),
 status text not null default 'Pending' check(status in ('Pending','Sent')),
 created_at timestamptz not null default now(), sent_at timestamptz
);
alter table public.support_email_queue enable row level security;
revoke all on public.support_email_queue from public,anon,authenticated;
grant select,update on public.support_email_queue to service_role;
create function public.report_school_problem(p_id uuid,p_title text,p_category text,p_description text,p_priority text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare tenant uuid; existing public.platform_support_tickets%rowtype;
begin
 perform public.assert_account_access(); tenant:=public.current_school_id();
 if tenant is null or auth.uid() is null then raise exception 'School access denied' using errcode='42501'; end if;
 if p_id is null or p_title is null or length(btrim(p_title)) not between 3 and 160
 or p_description is null or length(btrim(p_description)) not between 5 and 3000
 or p_category is null or p_category not in ('Access','Invitations','Branding','Platform','Other')
 or p_priority is null or p_priority not in ('Low','Normal','High','Urgent') then raise exception 'Complete all required problem fields'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select * into existing from public.platform_support_tickets where id=p_id;
 if found then
  if existing.created_by is distinct from auth.uid() or existing.school_id is distinct from tenant
   or existing.title is distinct from btrim(p_title) or existing.description is distinct from btrim(p_description)
   or existing.category is distinct from p_category or existing.priority is distinct from p_priority
   or existing.origin<>'School-reported' then raise exception 'Operation reference already used'; end if;
 else
  if (select count(*) from public.platform_support_tickets where created_by=auth.uid() and created_at>now()-interval '1 hour' and origin='School-reported')>=10 then raise exception 'Report limit reached. Try later.'; end if;
  insert into public.platform_support_tickets(id,school_id,title,category,description,priority,status,origin,created_by,updated_by)
  values(p_id,tenant,btrim(p_title),p_category,btrim(p_description),p_priority,'Open','School-reported',auth.uid(),auth.uid());
  insert into public.support_email_queue(ticket_id) values(p_id);
  insert into public.platform_admin_audit(actor_id,school_id,target_id,action,operation_id,reason)
  values(auth.uid(),tenant,p_id,'school_problem_reported',p_id,'School user submitted a support ticket');
 end if;
 return jsonb_build_object('id',p_id,'status','Open','email_status',(select status from public.support_email_queue where ticket_id=p_id));
end $$;
revoke all on function public.report_school_problem(uuid,text,text,text,text) from public,anon;
grant execute on function public.report_school_problem(uuid,text,text,text,text) to authenticated;
notify pgrst,'reload schema';
