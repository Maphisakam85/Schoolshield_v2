alter table public.profiles
  add column phone text,
  add column address text,
  add column emergency_contact text,
  add column onboarding_completed_at timestamptz;

-- Profile completion accepts only personal fields; school and role remain
-- server-assigned and cannot be changed by a user during onboarding.
create or replace function public.complete_my_profile(
  p_display_name text,
  p_phone text,
  p_address text default null,
  p_emergency_contact text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in is required';
  end if;
  if char_length(trim(p_display_name)) < 2 or char_length(trim(p_phone)) < 7 then
    raise exception 'Enter a full name and a valid mobile number';
  end if;
  update public.profiles
  set display_name = trim(p_display_name),
      phone = trim(p_phone),
      address = nullif(trim(coalesce(p_address, '')), ''),
      emergency_contact = nullif(trim(coalesce(p_emergency_contact, '')), ''),
      onboarding_completed_at = now()
  where id = auth.uid();
end;
$$;

revoke all on function public.complete_my_profile(text, text, text, text) from public;
grant execute on function public.complete_my_profile(text, text, text, text) to authenticated;
