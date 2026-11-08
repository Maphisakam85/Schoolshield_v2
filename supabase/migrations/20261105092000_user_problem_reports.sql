alter table public.platform_support_tickets drop constraint platform_support_tickets_origin_check;
alter table public.platform_support_tickets add constraint platform_support_tickets_origin_check check(origin in ('Owner-created','User-reported'));
alter table public.platform_support_tickets add column page_path text not null default '', add column email_status text not null default 'Not requested' check(email_status in ('Not requested','Sending','Sent','Failed','Unconfigured'));
create function public.report_school_problem(p_id uuid,p_title text,p_category text,p_description text,p_page text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare actor profiles%rowtype; t platform_support_tickets%rowtype;
begin
 select * into actor from profiles where id=auth.uid();
 -- Allow an existing school member to report setup/access faults even when the
 -- school is suspended. This grants no access to school records or other tickets.
 if actor.id is null or actor.school_id is null then raise exception 'Sign in with an assigned school account to report a problem' using errcode='42501';end if;
 if p_id is null or p_title is null or p_description is null or length(btrim(p_title)) not between 3 and 160 or length(btrim(p_description)) not between 5 and 3000 or p_category is null or p_category not in ('Access','Invitations','Branding','Platform','Other') or p_page is null or length(p_page)>160 or p_page !~ '^/?[A-Za-z0-9_./-]*$' then raise exception 'Complete the required problem details';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor.id::text,0));
 select * into t from platform_support_tickets where id=p_id;
 if found then
  if t.created_by<>actor.id or t.school_id<>actor.school_id or t.origin<>'User-reported' or t.title<>btrim(p_title) or t.description<>btrim(p_description) or t.category<>p_category or t.page_path<>p_page then raise exception 'Ticket reference already used';end if;
 else
  if (select count(*) from platform_support_tickets where created_by=actor.id and origin='User-reported' and created_at>now()-interval '1 hour')>=10 then raise exception 'Please wait before submitting more reports';end if;
  insert into platform_support_tickets(id,school_id,title,category,description,priority,status,origin,created_by,updated_by,page_path)
  values(p_id,actor.school_id,btrim(p_title),p_category,btrim(p_description),'Normal','Open','User-reported',actor.id,actor.id,p_page) returning * into t;
 end if;
 return jsonb_build_object('id',t.id,'status',t.status,'email_status',t.email_status);
end $$;
create function public.claim_problem_email(p_id uuid,p_actor uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare t platform_support_tickets%rowtype;
begin
 update platform_support_tickets set email_status='Sending' where id=p_id and created_by=p_actor and origin='User-reported' and email_status in ('Not requested','Unconfigured','Failed') returning * into t;
 if t.id is null then return null;end if;
 return jsonb_build_object('id',t.id,'school_id',t.school_id,'title',t.title,'category',t.category,'description',t.description,'page_path',t.page_path);
end $$;
revoke all on function public.report_school_problem(uuid,text,text,text,text),public.claim_problem_email(uuid,uuid) from public,anon,authenticated;
grant execute on function public.report_school_problem(uuid,text,text,text,text) to authenticated;
grant execute on function public.claim_problem_email(uuid,uuid) to service_role;
