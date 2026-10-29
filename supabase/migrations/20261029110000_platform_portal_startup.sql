-- Platform owners do not have school profiles. Preserve the platform gate and
-- append-only audit contract without the school lifecycle wrapper.
create or replace function public.open_platform_admin_portal(p_operation uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform public.require_platform_administrator();
 if p_operation is null then raise exception 'Operation ID is required'; end if;
 if exists(select 1 from public.platform_admin_audit where actor_id=auth.uid() and operation_id=p_operation and action<>'portal_opened') then
  raise exception 'Operation belongs to another action';
 end if;
 insert into public.platform_admin_audit(actor_id,action,operation_id,reason)
 values(auth.uid(),'portal_opened',p_operation,'Authenticated platform portal access')
 on conflict(actor_id,operation_id) do nothing;
end $$;
revoke all on function public.open_platform_admin_portal(uuid) from public,anon;
grant execute on function public.open_platform_admin_portal(uuid) to authenticated;
notify pgrst,'reload schema';
