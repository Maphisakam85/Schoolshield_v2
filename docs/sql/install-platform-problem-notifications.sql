-- Source SHA-256: 2374f8a85dd01992277f0784997065db26dafc73b0f00f2764c21b4f82b73ff2
BEGIN;
DO $preflight$ BEGIN
 IF EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261109130000') THEN RAISE EXCEPTION 'Migration already recorded'; END IF;
 IF to_regprocedure('public.platform_admin_problem_notifications(integer)') IS NOT NULL THEN RAISE EXCEPTION 'Existing function requires reconciliation'; END IF;
 IF to_regprocedure('public.require_platform_administrator()') IS NULL THEN RAISE EXCEPTION 'Platform authorization missing'; END IF;
END $preflight$;
-- Owner-only, live unresolved school-report projection; opening is not dismissal.
create index platform_support_active_school_reports on public.platform_support_tickets(updated_at desc,id)
 where origin='School-reported' and status not in ('Resolved','Closed');
create function public.platform_admin_problem_notifications(p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare items jsonb; total bigint;
begin
 perform public.require_platform_administrator();
 if p_offset is null or p_offset<0 then raise exception 'Invalid notification offset'; end if;
 select count(*) into total from platform_support_tickets
 where origin='School-reported' and status not in ('Resolved','Closed');
 select coalesce(jsonb_agg(to_jsonb(t) order by updated_at desc,id),'[]') into items from (
  select t.id,t.school_id,s.name as school_name,s.code as school_code,t.title,t.priority,t.status,t.updated_at
  from platform_support_tickets t join schools s on s.id=t.school_id
  where t.origin='School-reported' and t.status not in ('Resolved','Closed')
  order by t.updated_at desc,t.id limit 25 offset p_offset
 ) t;
 return jsonb_build_object('total',total,'items',items,'offset',p_offset);
end $$;
revoke all on function public.platform_admin_problem_notifications(integer) from public,anon,authenticated;
grant execute on function public.platform_admin_problem_notifications(integer) to authenticated;
notify pgrst,'reload schema';

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20261109130000','platform_problem_notifications');
COMMIT;
