-- Unambiguous date-only legacy formats are normalized without rewriting identities.
-- Display labels are retained. Missing historical audit timestamps are never invented.
create function public.normalize_operational_records() returns trigger language plpgsql security definer set search_path=public as $$
declare collection text;items jsonb;item jsonb;previous jsonb;field text;parsed date;
 actor uuid:=auth.uid();audit_key text;entries jsonb;entry jsonb;idx integer;old_count integer;
begin
 foreach collection in array array['visitors','incidents','announcements','notifications','attendanceRegisters','attendanceWeeks','reports','sickNotices','appointments','reportRequests','staffChangeRequests','teacherAssignments'] loop
  if new.payload->collection is not distinct from old.payload->collection then continue;end if;
  items:='[]';
  for item in select value from jsonb_array_elements(coalesce(new.payload->collection,'[]')) loop
   select value into previous from jsonb_array_elements(coalesce(old.payload->collection,'[]')) where value->>'id'=item->>'id';
   if item->>'id' is not null then
    item:=item||jsonb_build_object('entityId',school_alias(new.school_id,collection,item->>'id'),'school_id',new.school_id);
   end if;
   foreach field in array array['date','shiftDate','scheduledDate','weekStart'] loop
    if item->>field is not null then
     parsed:=school_date_only(item->>field);
     if parsed is null and (previous is null or previous->field is distinct from item->field) then raise exception 'Enter an unambiguous YYYY-MM-DD date for %',field;end if;
     if parsed is not null and item->>field<>parsed::text then
      item:=item||jsonb_build_object('legacy_'||field,item->field,field,parsed::text);
     end if;
    end if;
   end loop;
   if actor is not null and exists(select 1 from profiles where id=actor and school_id=new.school_id) then
    if previous is null then item:=item||jsonb_build_object('createdBy',actor,'createdAt',clock_timestamp());
    else
     if previous ? 'createdBy' then item:=item||jsonb_build_object('createdBy',previous->'createdBy');end if;
     if previous ? 'createdAt' then item:=item||jsonb_build_object('createdAt',previous->'createdAt');end if;
    end if;
    if previous is distinct from item then item:=item||jsonb_build_object('updatedBy',actor,'updatedAt',clock_timestamp());end if;
    if collection='incidents' then
     if previous is null then item:=item||jsonb_build_object('reporterId',actor);
     elsif previous ? 'reporterId' then item:=item||jsonb_build_object('reporterId',previous->'reporterId');end if;
    end if;
    if collection='sickNotices' then
     if previous is null then item:=item||jsonb_build_object('submittedById',actor);
     elsif previous ? 'submittedById' then item:=item||jsonb_build_object('submittedById',previous->'submittedById');end if;
    end if;
    foreach audit_key in array array['comments','audit'] loop
     if jsonb_typeof(item->audit_key)='array' then
      entries:='[]';idx:=0;old_count:=jsonb_array_length(coalesce(previous->audit_key,'[]'));
      for entry in select value from jsonb_array_elements(item->audit_key) loop
       if idx<old_count and entry is distinct from previous->audit_key->idx then raise exception 'Historical audit entries cannot be changed';end if;
       if idx>=old_count then entry:=entry||jsonb_build_object('id',gen_random_uuid(),'authorId',actor,'createdAt',clock_timestamp());end if;
       entries:=entries||jsonb_build_array(entry);idx:=idx+1;
      end loop;
      item:=jsonb_set(item,array[audit_key],entries);
     end if;
    end loop;
   end if;
   if collection='incidents' then
    if nullif(item->>'staffId','') is not null and (previous is null or previous->'staffId' is distinct from item->'staffId') and not exists(select 1 from school_staff s where s.school_id=new.school_id and s.id::text=item->>'staffId') then raise exception 'Staff identity is not in this school';end if;
    if nullif(item->>'staffId','') is not null then item:=item||jsonb_build_object('staffProfileId',(select profile_id from school_staff s where s.school_id=new.school_id and s.id::text=item->>'staffId'));end if;
    if nullif(item->>'officerId','') is not null and (previous is null or previous->'officerId' is distinct from item->'officerId') and not exists(select 1 from school_security_officers o where o.school_id=new.school_id and o.id::text=item->>'officerId') then raise exception 'Officer identity is not in this school';end if;
   end if;
   if nullif(item->>'learnerId','') is not null and (previous is null or previous->'learnerId' is distinct from item->'learnerId') and not exists(select 1 from school_learners l where l.school_id=new.school_id and item->>'learnerId' in(l.legacy_ref,l.id::text)) then raise exception 'Learner identity is not in this school';end if;
   items:=items||jsonb_build_array(item);
  end loop;
  new.payload:=jsonb_set(new.payload,array[collection],items);
 end loop;return new;
end $$;
revoke all on function normalize_operational_records() from public,anon,authenticated;
create trigger normalize_operational_records before update on school_workspaces for each row execute function normalize_operational_records();

-- Backfill dates through the same trigger, with no authenticated actor: no fabricated audits.
do $$declare w record;collection text;items jsonb;item jsonb;parsed date;data jsonb;begin
 for w in select school_id,payload from school_workspaces loop
  data:=w.payload;
  foreach collection in array array['visitors','incidents','announcements','notifications','attendanceRegisters','reports','sickNotices','appointments'] loop
   items:='[]';
   for item in select value from jsonb_array_elements(coalesce(data->collection,'[]')) loop
    parsed:=school_date_only(item->>'date');
    if parsed is not null and item->>'date'<>parsed::text then item:=item||jsonb_build_object('legacy_date',item->'date','date',parsed::text);end if;
    items:=items||jsonb_build_array(item);
   end loop;
   if data ? collection then data:=jsonb_set(data,array[collection],items);end if;
  end loop;
  update school_workspaces set payload=data,version=version+1 where school_id=w.school_id and payload is distinct from data;
 end loop;end $$;

-- New announcements store ISO date-only values; the publication RPC still owns its audits.
do $$declare body text;begin
 body:=pg_get_functiondef('public.publish_school_announcement(text,text,text,text,text,text,integer,text)'::regprocedure);
 body:=replace(body,'''DD Mon YYYY''','''YYYY-MM-DD''');execute body;
end $$;

-- Announcement alerts follow the already-authorized announcement audience.
-- Older projection logic required scope even though publication uses audienceId.
alter function read_school_dataset() rename to read_school_dataset_notification_base;
revoke all on function read_school_dataset_notification_base() from public,anon,authenticated;
create function public.read_school_dataset() returns jsonb language plpgsql stable security definer set search_path=public as $$
declare result jsonb;notices jsonb;extra jsonb;begin
 perform assert_account_access();result:=read_school_dataset_notification_base();
 notices:=coalesce(result->'payload'->'notifications','[]');
 select coalesce(jsonb_agg(n),'[]') into extra from school_workspaces w,jsonb_array_elements(coalesce(w.payload->'notifications','[]')) n
 where w.school_id=current_school_id() and n->>'announcementId' is not null
 and (nullif(n->>'recipientId','') is null or n->>'recipientId'=auth.uid()::text)
 and (nullif(n->>'recipient','') is null or n->>'recipientId'=auth.uid()::text)
 and exists(select 1 from jsonb_array_elements(coalesce(result->'payload'->'announcements','[]')) a where a->>'id'=n->>'announcementId')
 and not exists(select 1 from jsonb_array_elements(notices) old where old->>'id'=n->>'id');
 return jsonb_set(result,'{payload,notifications}',notices||extra);
end $$;
revoke all on function read_school_dataset() from public,anon;grant execute on function read_school_dataset() to authenticated;
