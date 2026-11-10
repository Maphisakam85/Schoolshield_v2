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
