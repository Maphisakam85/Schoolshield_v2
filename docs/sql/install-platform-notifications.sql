-- Source SHA-256: a3a3aed5536acf9d482b757465d2ed8f894e51911b90d2fcbb021323673bdf82
BEGIN;
DO $preflight$ BEGIN
 IF EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261110110000') THEN RAISE EXCEPTION 'Migration already recorded'; END IF;
END $preflight$;
-- Owner-only action items. No credentials, raw errors or record payloads.
create function public.platform_admin_notifications(p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;begin
 perform require_platform_administrator();
 if p_offset is null or p_offset<0 then raise exception 'Invalid notification offset';end if;
 with entries as materialized (
  select t.id,t.school_id,'report'::text as kind,t.title,t.priority,t.status,t.updated_at from platform_support_tickets t where t.origin='School-reported' and t.status not in ('Resolved','Closed')
  union all
  select i.id,i.school_id,'invitation','Invitation delivery needs attention','High',i.status,i.created_at from user_invitations i
  where i.status='Failed'
   and not exists(select 1 from user_invitations newer where newer.user_id=i.user_id and newer.created_at>i.created_at and newer.status in ('Sent','Link generated'))
  union all
  select o.id,o.school_id,'account','Account request needs recovery','High',o.status,o.created_at from platform_account_operations o
  where o.status='Failed'
   and not exists(select 1 from user_invitations i where i.operation_id=o.id and i.status='Failed')
  union all
  select p.id,p.school_id,'provisioning','School provisioning needs recovery','High',p.status,p.updated_at from platform_school_provisions p where p.status='Failed'
 )
 select jsonb_build_object('total',(select count(*) from entries), 'items',coalesce((select jsonb_agg(to_jsonb(page) order by page.updated_at desc,page.kind,page.id) from (
  select e.*,s.name as school_name,s.code as school_code from entries e join schools s on s.id=e.school_id order by e.updated_at desc,e.kind,e.id limit 25 offset p_offset
 ) page),'[]'::jsonb),'offset',p_offset) into result;
 return result;
end $$;
revoke all on function public.platform_admin_notifications(integer) from public,anon,authenticated;
grant execute on function public.platform_admin_notifications(integer) to authenticated;
notify pgrst,'reload schema';

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20261110110000','platform_notifications');
COMMIT;
