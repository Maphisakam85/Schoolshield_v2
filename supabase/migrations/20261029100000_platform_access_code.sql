-- The code is configured separately by an operator; no plaintext secret in source.
create table public.platform_login_secret (
 singleton boolean primary key default true check(singleton),
 code_hash text not null
);
create table public.platform_login_attempts (
 user_id uuid primary key references auth.users(id) on delete cascade,
 failures integer not null default 0,
 window_started timestamptz not null default now()
);
create table public.platform_login_sessions (
 session_id uuid primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 expires_at timestamptz not null
);
alter table public.platform_login_secret enable row level security;
alter table public.platform_login_attempts enable row level security;
alter table public.platform_login_sessions enable row level security;
revoke all on public.platform_login_secret,public.platform_login_attempts,public.platform_login_sessions from public,anon,authenticated;

create function public.authorize_platform_login(p_access_code text) returns jsonb
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare actor uuid:=auth.uid(); sid uuid:=(auth.jwt()->>'session_id')::uuid;
 attempt public.platform_login_attempts%rowtype; secret text;
begin
 if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
 if not public.platform_administrator_allowed(actor) then
  return jsonb_build_object('platform_admin',false,'authorized',false);
 end if;
 if sid is null then return jsonb_build_object('platform_admin',true,'authorized',false); end if;
 insert into public.platform_login_attempts(user_id) values(actor) on conflict do nothing;
 select * into attempt from public.platform_login_attempts where user_id=actor for update;
 if attempt.window_started < now()-interval '15 minutes' then
  update public.platform_login_attempts set failures=0,window_started=now() where user_id=actor;
  attempt.failures:=0;
 end if;
 if attempt.failures>=5 then return jsonb_build_object('platform_admin',true,'authorized',false); end if;
 select code_hash into secret from public.platform_login_secret where singleton;
 if secret is null or p_access_code is null or length(p_access_code)>128 or crypt(p_access_code,secret) is distinct from secret then
  update public.platform_login_attempts set failures=failures+1 where user_id=actor;
  return jsonb_build_object('platform_admin',true,'authorized',false);
 end if;
 update public.platform_login_attempts set failures=0,window_started=now() where user_id=actor;
 insert into public.platform_login_sessions(session_id,user_id,expires_at)
 values(sid,actor,now()+interval '8 hours') on conflict(session_id) do update set expires_at=excluded.expires_at
 where platform_login_sessions.user_id=excluded.user_id;
 return jsonb_build_object('platform_admin',true,'authorized',true);
end $$;
revoke all on function public.authorize_platform_login(text) from public,anon,authenticated;
grant execute on function public.authorize_platform_login(text) to authenticated;

create or replace function public.is_platform_administrator() returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select public.platform_administrator_allowed(auth.uid()) and exists(
  select 1 from public.platform_login_sessions where user_id=auth.uid()
  and session_id=(auth.jwt()->>'session_id')::uuid and expires_at>now()
 )
$$;

create or replace function public.require_platform_administrator() returns void
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if not public.is_platform_administrator() then
  raise exception 'Platform access denied. Sign in with your admin access code.' using errcode='42501';
 end if;
end $$;
notify pgrst,'reload schema';
