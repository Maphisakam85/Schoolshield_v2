-- Run against a provisioned test/development database; every change rolls back.
begin;
do $$
declare owner_id uuid; ordinary_id uuid; sid uuid:=gen_random_uuid(); result jsonb; i integer;
begin
 select a.user_id into owner_id from public.platform_administrators a where a.active and public.platform_administrator_allowed(a.user_id) limit 1;
 select p.id into ordinary_id from public.profiles p where not exists(select 1 from public.platform_administrators a where a.user_id=p.id) limit 1;
 if owner_id is null or ordinary_id is null then raise exception 'Verified admin and ordinary school fixtures required'; end if;
 insert into public.platform_login_secret values(true,extensions.crypt('fixture-private-code',extensions.gen_salt('bf',4)))
 on conflict(singleton) do update set code_hash=excluded.code_hash;
 delete from public.platform_login_attempts where user_id=owner_id;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated','session_id',sid)::text,true);
 if public.is_platform_administrator() then raise exception 'Membership alone bypassed code'; end if;
 begin perform public.platform_admin_context();raise exception 'Portal bypassed code'; exception when insufficient_privilege then null; end;
 result:=public.authorize_platform_login('wrong');
 if (result->>'authorized')::boolean then raise exception 'Incorrect code accepted'; end if;
 result:=public.authorize_platform_login('fixture-private-code');
 if not (result->>'authorized')::boolean or not public.is_platform_administrator() then raise exception 'Correct code rejected'; end if;
 perform public.platform_admin_context();
 perform public.open_platform_admin_portal(gen_random_uuid());
 if jsonb_typeof(public.platform_admin_directory()->'schools')<>'array' then raise exception 'Directory startup failed'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated','session_id',gen_random_uuid())::text,true);
 if public.is_platform_administrator() then raise exception 'Authorization leaked into another session'; end if;
 for i in 1..5 loop perform public.authorize_platform_login('wrong'); end loop;
 result:=public.authorize_platform_login('fixture-private-code');
 if (result->>'authorized')::boolean then raise exception 'Attempt limit bypassed'; end if;
 update public.platform_login_attempts set window_started=now()-interval '16 minutes' where user_id=owner_id;
 result:=public.authorize_platform_login('fixture-private-code');
 if not (result->>'authorized')::boolean then raise exception 'Lock did not expire'; end if;
 update public.platform_login_sessions set expires_at=now()-interval '1 minute' where user_id=owner_id;
 if public.is_platform_administrator() then raise exception 'Expired gate accepted'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ordinary_id,'role','authenticated','session_id',sid)::text,true);
 result:=public.authorize_platform_login('fixture-private-code');
 if (result->>'platform_admin')::boolean or public.is_platform_administrator() then raise exception 'School user obtained platform access'; end if;
 if has_table_privilege('authenticated','public.platform_login_secret','select') then raise exception 'Secret readable by authenticated users'; end if;
 if has_function_privilege('anon','public.authorize_platform_login(text)','execute') then raise exception 'Anonymous gate allowed'; end if;
end $$;
rollback;
select 'Access-code authorization, RPC protection, session isolation, expiry, throttling and role denial passed' as result;
