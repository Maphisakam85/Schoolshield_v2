-- Source SHA-256: 43eb68a013265e8f65b1bf88f6108e3d7d61f0af6056ce1d48760801f078aa7c
BEGIN;
DO $preflight$ BEGIN
 IF EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261109160000') THEN RAISE EXCEPTION 'Migration already recorded'; END IF;
 IF to_regprocedure('public.preserve_reported_problem_details()') IS NOT NULL THEN RAISE EXCEPTION 'Existing protection requires reconciliation'; END IF;
END $preflight$;
-- The reporter's original submission is evidence. Owners manage status/notes,
-- not the submitted title, category, priority, description or attribution.
create function public.preserve_reported_problem_details() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
 if old.origin='School-reported' or new.origin='School-reported' then
  if row(new.id,new.school_id,new.origin,new.created_by,new.created_at,new.title,new.category,new.priority,new.description)
   is distinct from row(old.id,old.school_id,old.origin,old.created_by,old.created_at,old.title,old.category,old.priority,old.description) then
   raise exception 'The original school report is read-only. Update status and internal notes only.' using errcode='42501';
  end if;
 end if;
 return new;
end $$;
revoke all on function public.preserve_reported_problem_details() from public,anon,authenticated;
create trigger preserve_reported_problem_details before update on public.platform_support_tickets
for each row execute function public.preserve_reported_problem_details();
notify pgrst,'reload schema';

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20261109160000','preserve_reported_problem_details');
COMMIT;
