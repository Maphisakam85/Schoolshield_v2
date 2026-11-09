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
