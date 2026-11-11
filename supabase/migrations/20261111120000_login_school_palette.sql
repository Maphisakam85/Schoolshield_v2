-- Public visual branding only. Access codes do not authorize school access.
create function public.get_login_school_palette(p_code text) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object(
  'primary_color',coalesce(t.primary_color,'#0A8F62'),
  'navigation_color',coalesce(t.navigation_color,'#082C36'))
 from public.schools s left join public.school_portal_themes t on t.school_id=s.id
 where s.code=upper(btrim(p_code)) and length(p_code) between 1 and 64
 limit 1
$$;
revoke all on function public.get_login_school_palette(text) from public,anon,authenticated;
grant execute on function public.get_login_school_palette(text) to anon,authenticated;
comment on function public.get_login_school_palette(text) is 'Login preview: returns only two public colours; no school/user records or access grants.';
