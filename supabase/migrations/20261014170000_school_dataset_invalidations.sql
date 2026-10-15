-- Realtime carries only an invalidation counter, never the private workspace
-- payload. Every ready member reloads its own authorised server projection.
create table school_dataset_versions(school_id uuid primary key references schools(id),version bigint not null default 0,updated_at timestamptz not null default now());
insert into school_dataset_versions(school_id) select id from schools;
alter table school_dataset_versions enable row level security;
revoke all on school_dataset_versions from public,anon,authenticated;
grant select on school_dataset_versions to authenticated;
create policy own_school_invalidation on school_dataset_versions for select to authenticated using(account_is_ready() and school_id=current_school_id());
create function publish_school_dataset_change() returns trigger language plpgsql security definer set search_path=public as $$
begin insert into school_dataset_versions(school_id,version) values(new.school_id,1) on conflict(school_id) do update set version=school_dataset_versions.version+1,updated_at=now();return null;end $$;
create trigger publish_school_dataset_change after insert or update on school_workspaces for each row execute function publish_school_dataset_change();
revoke all on function publish_school_dataset_change() from public,anon,authenticated;
do $$begin if exists(select 1 from pg_publication where pubname='supabase_realtime') then alter publication supabase_realtime add table school_dataset_versions;end if;end $$;
