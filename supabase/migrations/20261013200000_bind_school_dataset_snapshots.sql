-- A queued browser snapshot must belong to the currently authenticated school,
-- even when two pilot schools originally used the same legacy record refs.
alter function public.save_school_dataset(jsonb,jsonb) rename to save_school_dataset_base;
revoke all on function public.save_school_dataset_base(jsonb,jsonb) from public,anon,authenticated;
create function public.save_school_dataset(p_before jsonb,p_after jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare tenant uuid:=current_school_id(); current_payload jsonb; collection record; r jsonb; expected jsonb;
begin
 if tenant is null then raise exception 'School dataset access denied'; end if;
 if exists(
  select 1 from (select value from jsonb_each(p_before) union all select value from jsonb_each(p_after)) collections
  cross join lateral jsonb_array_elements(case when jsonb_typeof(collections.value)='array' then collections.value else '[]' end) row_data
  where nullif(row_data->>'school_id','') is not null and row_data->>'school_id'<>tenant::text
 ) then raise exception 'Workspace snapshot belongs to another school'; end if;
 select payload into current_payload from school_workspaces where school_id=tenant for update;
 for collection in select key,value from jsonb_each(p_before) where jsonb_typeof(value)='array' loop
  for r in select value from jsonb_array_elements(collection.value) where nullif(value->>'entityId','') is not null loop
   select value into expected from jsonb_array_elements(coalesce(current_payload->collection.key,'[]')) where value->>'id'=r->>'id';
   if expected is not null and expected->>'entityId' is distinct from r->>'entityId' then raise exception 'Record UUID does not match this school dataset'; end if;
  end loop;
 end loop;
 return save_school_dataset_base(p_before,p_after);
end $$;
revoke all on function public.save_school_dataset(jsonb,jsonb) from public,anon;
grant execute on function public.save_school_dataset(jsonb,jsonb) to authenticated;
