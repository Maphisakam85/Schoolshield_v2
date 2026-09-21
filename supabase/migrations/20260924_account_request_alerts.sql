create table public.account_request_notifications (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  request_id uuid not null references public.account_requests(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (request_id, recipient_id)
);

create index account_request_notifications_recipient_idx
on public.account_request_notifications(recipient_id, read_at, created_at desc);

create or replace function public.notify_account_approvers()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'pending' and (tg_op = 'INSERT' or old.status <> 'pending') then
    insert into public.account_request_notifications (school_id, request_id, recipient_id)
    select new.school_id, new.id, profile.id
    from public.profiles profile
    where profile.school_id = new.school_id
      and profile.role in ('principal', 'clerk')
    on conflict (request_id, recipient_id) do update set read_at = null, created_at = now();
  end if;
  return new;
end;
$$;

create trigger account_request_alert_created
after insert or update of status on public.account_requests
for each row execute procedure public.notify_account_approvers();

alter table public.account_request_notifications enable row level security;

create policy "recipients read account request alerts"
on public.account_request_notifications for select to authenticated
using (recipient_id = auth.uid());

create policy "recipients read their account request alerts"
on public.account_request_notifications for update to authenticated
using (recipient_id = auth.uid())
with check (recipient_id = auth.uid());
