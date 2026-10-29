begin;
do $$
declare owner_id uuid; ordinary_id uuid; first_school uuid; second_school uuid;
 sid uuid:=gen_random_uuid(); operation uuid:=gen_random_uuid(); original jsonb; saved jsonb; other jsonb; repeated jsonb;
begin
 select user_id into owner_id from public.platform_administrators where active limit 1;
 select p.id,p.school_id into ordinary_id,first_school from public.profiles p join public.schools s on s.id=p.school_id
 where p.account_status='Active' and not p.requires_setup and s.data_mode='demo' limit 1;
 select id into second_school from public.schools where id<>first_school limit 1;
 if owner_id is null or ordinary_id is null or second_school is null then raise exception 'Admin and school fixtures required'; end if;
 insert into public.platform_login_sessions values(sid,owner_id,now()+interval '5 minutes');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated','session_id',sid)::text,true);
 original:=public.platform_admin_theme(first_school);other:=public.platform_admin_theme(second_school);
 saved:=public.save_platform_school_theme(first_school,(original->>'revision')::integer,'#1c4c97','#10295b',operation,'Rollback-only theme validation');
 if saved->>'primary_color'<>'#1C4C97' or saved->>'navigation_color'<>'#10295B' then raise exception 'Colours did not persist'; end if;
 repeated:=public.save_platform_school_theme(first_school,(original->>'revision')::integer,'#1c4c97','#10295b',operation,'Rollback-only theme validation');
 if repeated is distinct from saved then raise exception 'Retry changed the result'; end if;
 if public.platform_admin_theme(second_school) is distinct from other then raise exception 'Colours leaked into another school'; end if;
 begin perform public.save_platform_school_theme(first_school,(original->>'revision')::integer,'#000000','#FFFFFF',gen_random_uuid(),'Stale theme check');raise exception 'Stale save was accepted'; exception when serialization_failure then null; end;
 begin perform public.save_platform_school_theme(first_school,(saved->>'revision')::integer,'red','#FFFFFF',gen_random_uuid(),'Invalid colour check');raise exception 'Invalid colour was accepted'; exception when raise_exception then if sqlerrm='Invalid colour was accepted' then raise; end if; end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ordinary_id,'role','authenticated','session_id',gen_random_uuid())::text,true);
 if public.get_my_school_theme()->>'school_id'<>first_school::text or public.get_my_school_theme()->>'primary_color'<>'#1C4C97' then raise exception 'School portal did not read its theme'; end if;
 begin perform public.save_platform_school_theme(second_school,0,'#000000','#FFFFFF',gen_random_uuid(),'School role denial');raise exception 'School role edited another school'; exception when insufficient_privilege then null; end;
 if has_table_privilege('authenticated','public.school_portal_themes','update') then raise exception 'Direct table writes allowed'; end if;
end $$;
rollback;
select 'Theme persistence, retry, stale-save rejection, validation, school isolation and role denial passed' as result;
