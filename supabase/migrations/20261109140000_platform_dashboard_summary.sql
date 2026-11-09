-- Aggregate administrative metadata only; no academic or family datasets.
create function public.platform_admin_dashboard() returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare metrics jsonb; attention jsonb;
begin
 perform require_platform_administrator();
 select jsonb_build_object(
 'schools_total',(select count(*) from schools),
 'schools_active',(select count(*) from schools where lifecycle_status='active'),
 'schools_onboarding',(select count(*) from schools where lifecycle_status='onboarding'),
 'schools_pilot',(select count(*) from schools where lifecycle_status='pilot'),
 'schools_suspended',(select count(*) from schools where lifecycle_status='suspended'),
 'schools_live',(select count(*) from schools where data_mode='live'),
 'schools_test',(select count(*) from schools where data_mode in ('qa','demo')),
 'accounts_total',(select count(*) from profiles),
 'accounts_active',(select count(*) from profiles where account_status='Active'),
 'accounts_inactive',(select count(*) from profiles where account_status='Inactive'),
 'setup_pending',(select count(*) from profiles where requires_setup and onboarding_completed_at is null and account_status='Active'),
 'reports_open',(select count(*) from platform_support_tickets where origin='School-reported' and status not in ('Resolved','Closed')),
 'reports_urgent',(select count(*) from platform_support_tickets where origin='School-reported' and status not in ('Resolved','Closed') and priority='Urgent'),
 'invitations_failed',(select count(*) from user_invitations where status='Failed' and created_at>=now()-interval '30 days'),
 'provisioning_incomplete',(select count(*) from platform_school_provisions where status<>'Completed'),
 'account_operations_failed',(select count(*) from platform_account_operations where status='Failed' and created_at>=now()-interval '30 days'),
 'email_pending',(select count(*) from support_email_queue where status='Pending'),
 'push_devices',(select count(*) from web_push_subscriptions),
 'push_pending',(select count(*) from web_push_outbox where status in ('pending','sending')),
 'push_failed',(select count(*) from web_push_outbox where status='failed' and created_at>=now()-interval '30 days'),
 'audit_today',(select count(*) from platform_admin_audit where created_at>=now()-interval '24 hours')) into metrics;
 select coalesce(jsonb_agg(to_jsonb(a) order by a.updated_at desc,a.id),'[]') into attention from (
  select t.id,t.school_id,s.name as school_name,s.code as school_code,t.title,t.priority,t.status,t.updated_at
  from platform_support_tickets t join schools s on s.id=t.school_id
  where t.origin='School-reported' and t.status not in ('Resolved','Closed')
  order by t.updated_at desc,t.id limit 50
 ) a;
 return jsonb_build_object('metrics',metrics,'reports',attention,'generated_at',now());
end $$;
revoke all on function public.platform_admin_dashboard() from public,anon,authenticated;
grant execute on function public.platform_admin_dashboard() to authenticated;
notify pgrst,'reload schema';
