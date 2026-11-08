-- Return only the authenticated person's context; never infer approval from email/metadata.
create function public.school_login_context(p_school_code text) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare p profiles%rowtype; s schools%rowtype;
begin
 if auth.uid() is null then raise exception 'Sign in first' using errcode='42501'; end if;
 select * into p from profiles where id=auth.uid();
 if not found then raise exception 'Your account exists but its approved school profile is missing. Ask the administrator to recover the original account; do not register again.'; end if;
 if p.account_status is distinct from 'Active' then raise exception 'This account is inactive. Contact your school administrator.'; end if;
 if p.requires_setup and p.onboarding_completed_at is null then raise exception 'Complete account setup using your invitation. Ask the administrator to resend it if expired.'; end if;
 select * into s from schools where id=p.school_id;
 if not found then raise exception 'Your approved school is unavailable. Contact your administrator.'; end if;
 if upper(btrim(s.code)) is distinct from upper(btrim(p_school_code)) then raise exception 'The school code does not match your approved account. Use the code in your invitation.'; end if;
 perform assert_account_access();
 return jsonb_build_object('userId',p.id,'schoolId',s.id,'schoolCode',s.code,'schoolName',s.name,'schoolMode',s.data_mode,'role',p.role,'displayName',p.display_name);
end $$;
revoke all on function public.school_login_context(text) from public,anon;
grant execute on function public.school_login_context(text) to authenticated;

-- Existing codes remain valid: never silently rename a school's access code.
create function public.validate_new_school_code() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if TG_OP='UPDATE' and new.code is not distinct from old.code then return new; end if;
 new.code:=upper(btrim(new.code));
 if new.code is null or new.code !~ '^[A-Z]{3}-[0-9]{3}$' then raise exception 'School code must use CCC-000 format, for example SMM-001'; end if;
 return new;
end $$;
create trigger validate_school_code before insert or update of code on public.schools for each row execute function public.validate_new_school_code();
