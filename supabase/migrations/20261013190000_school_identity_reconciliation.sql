-- Finish one-time reconciliation of historical actor labels. The labels remain
-- for display; ownership thereafter uses profile UUIDs, never current names.
do $$
declare w record; data jsonb; k text; row_data jsonb; rows jsonb; field text; n integer; actor uuid;
begin
 for w in select school_id,payload from school_workspaces loop
  data:=w.payload;
  foreach k in array array['staffChangeRequests','appointments','sickNotices','assessments','reports','attendanceRegisters','attendanceWeeks','reportRequests'] loop
   rows:='[]';
   for row_data in select value from jsonb_array_elements(coalesce(data->k,'[]')) loop
    foreach field in array array['requestedBy','submittedBy','teacher','reviewedBy','approvedBy'] loop
     if nullif(row_data->>(field||'Id'),'') is not null or nullif(row_data->>field,'') is null then continue; end if;
     select count(*),(array_agg(id))[1] into n,actor from profiles where school_id=w.school_id and display_name=row_data->>field;
     if n=1 then row_data:=row_data || jsonb_build_object(field||'Id',actor); end if;
    end loop;
    rows:=rows || jsonb_build_array(row_data);
   end loop;
   data:=jsonb_set(data,array[k],rows);
  end loop;
  update school_workspaces set payload=data where school_id=w.school_id;
 end loop;
end $$;

-- Management sees a reconciliation warning without exposing its underlying
-- personnel metadata to the other roles or creating another record store.
alter function public.read_school_dataset() rename to read_school_dataset_base;
revoke all on function public.read_school_dataset_base() from public,anon,authenticated;
create function public.read_school_dataset() returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare result jsonb; tenant uuid:=current_school_id();
begin
 result:=read_school_dataset_base();
 if current_app_role() in ('principal','deputy','clerk') then
  result:=result || jsonb_build_object('identityIssues',coalesce((select jsonb_agg(jsonb_build_object('kind',kind,'legacyRef',legacy_ref,'reason',reason) order by kind,legacy_ref) from school_identity_issues where school_id=tenant),'[]'));
 end if;
 return result;
end $$;
revoke all on function public.read_school_dataset() from public,anon;
grant execute on function public.read_school_dataset() to authenticated;
