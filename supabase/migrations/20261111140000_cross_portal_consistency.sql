-- Test-branch consistency fixes. Deploy only to an isolated test project first.
-- Reuse the existing checked notice action; retarget new alerts by UUID.
alter function public.persist_parent_document_notice(jsonb) rename to persist_parent_notice_routing_base;
revoke all on function public.persist_parent_notice_routing_base(jsonb) from public,anon,authenticated;
create function public.persist_parent_document_notice(p_record jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare actor profiles%rowtype; data jsonb; saved jsonb; existed boolean; notices jsonb; recipients jsonb;
begin
 perform assert_account_access();
 select * into actor from profiles where id=auth.uid();
 if actor.role is distinct from 'parent'::app_role then raise exception 'Parent sign-in required';end if;
 select payload into data from school_workspaces where school_id=actor.school_id for update;
 existed:=exists(select 1 from jsonb_array_elements(coalesce(data->'sickNotices','[]')) n where n->>'id'=p_record->>'id');
 saved:=persist_parent_notice_routing_base(p_record);
 if existed then return saved;end if;
 select payload into data from school_workspaces where school_id=actor.school_id;
 select coalesce(jsonb_agg(n),'[]') into notices from jsonb_array_elements(coalesce(data->'notifications','[]')) n where n->>'id' is distinct from 'NTF-SICK-'||(saved->>'id');
 select coalesce(jsonb_agg(jsonb_build_object(
  'id','NTF-SICK-'||(saved->>'id')||'-'||p.id::text,'recipientId',p.id,'scope',p.role::text,
  'category','Sick notice','priority','High','title','Sick notice requires attention',
  'description','A linked learner sick notice requires review.','createdAt',now(),'read',false,
  'learnerId',saved->>'learnerId','class',l.class_ref,'sickNoticeId',saved->>'id')),'[]') into recipients
 from profiles p cross join lateral (
  select c.class_ref,c.teacher_staff_id,c.id from school_learners x join teacher_review_classes c on c.id=x.class_id and c.school_id=x.school_id
  where x.school_id=actor.school_id and x.legacy_ref=saved->>'learnerId'
 ) l
 where p.school_id=actor.school_id and p.account_status='Active' and (not p.requires_setup or p.onboarding_completed_at is not null)
 and (p.role in ('principal','deputy','clerk') or p.role='teacher' and (
  exists(select 1 from school_staff s where s.school_id=p.school_id and s.id=l.teacher_staff_id and s.profile_id=p.id)
  or exists(select 1 from teacher_teaching_contexts t where t.school_id=p.school_id and t.class_id=l.id and t.teacher_id=p.id and coalesce(t.start_date,make_date(t.academic_year,1,1))<=current_date and coalesce(t.end_date,make_date(t.academic_year,12,31))>=current_date)));
 update school_workspaces set payload=jsonb_set(data,'{notifications}',recipients||notices),updated_by=actor.id where school_id=actor.school_id;
 return saved;
end $$;
revoke all on function public.persist_parent_document_notice(jsonb) from public,anon;
grant execute on function public.persist_parent_document_notice(jsonb) to authenticated;

-- Append under the same workspace lock used by dataset mutations. The caller's
-- message UUID makes retries idempotent without a second message table.
create function public.send_parent_chat_message(p_id uuid,p_learner text,p_text text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare actor profiles%rowtype;data jsonb;child jsonb;conversation jsonb;message jsonb;items jsonb;
begin
 perform assert_account_access();select * into actor from profiles where id=auth.uid();
 if actor.role not in ('parent','teacher') or actor.id is null then raise exception 'Conversation access denied';end if;
 if p_id is null or p_learner is null or p_text is null or length(btrim(p_text)) not between 1 and 2000 then raise exception 'A learner and message up to 2,000 characters are required';end if;
 select payload into data from school_workspaces where school_id=actor.school_id for update;
 if data is null then raise exception 'School workspace is unavailable';end if;
 if not can_access_learner_reference(actor.school_id,p_learner) then raise exception 'Learner access denied';end if;
 select value into child from jsonb_array_elements(coalesce(data->'learners','[]')) where value->>'id'=p_learner;
 if child is null then raise exception 'Learner access denied';end if;
 select m into message from jsonb_array_elements(coalesce(data->'parentChat','[]')) c cross join lateral jsonb_array_elements(coalesce(c->'messages','[]')) m where m->>'id'=p_id::text;
 if message is not null then
  if message->>'senderId' is distinct from actor.id::text or message->>'text' is distinct from btrim(p_text)
   or not exists(select 1 from jsonb_array_elements(coalesce(data->'parentChat','[]')) c where c->>'learnerId'=p_learner and c->'messages' @> jsonb_build_array(message)) then raise exception 'Message retry does not match';end if;
  return jsonb_build_object('ok',true,'id',p_id,'replayed',true);
 end if;
 select value into conversation from jsonb_array_elements(coalesce(data->'parentChat','[]')) where value->>'learnerId'=p_learner;
 conversation:=coalesce(conversation,jsonb_build_object('id',gen_random_uuid(),'learnerId',p_learner,'class',child->>'class','role','Parent conversation','legacyOwner','parent','messages','[]'::jsonb));
 message:=jsonb_build_object('id',p_id,'from','me','sender',actor.display_name,'senderId',actor.id,'text',btrim(p_text),'date',to_char(now() at time zone 'Africa/Johannesburg','YYYY-MM-DD'),'sentAt',now());
 conversation:=jsonb_set(conversation,'{messages}',coalesce(conversation->'messages','[]')||jsonb_build_array(message));
 select coalesce(jsonb_agg(c),'[]') into items from jsonb_array_elements(coalesce(data->'parentChat','[]')) c where c->>'learnerId' is distinct from p_learner;
 update school_workspaces set payload=jsonb_set(data,'{parentChat}',items||jsonb_build_array(conversation)),updated_by=actor.id where school_id=actor.school_id;
 return jsonb_build_object('ok',true,'id',p_id,'replayed',false);
end $$;
revoke all on function public.send_parent_chat_message(uuid,text,text) from public,anon;
grant execute on function public.send_parent_chat_message(uuid,text,text) to authenticated;

-- Derived metrics come from the full school records before role filtering.
-- Imported summaries remain a fallback only when no recorded evidence exists.
-- No fixed 60-day attendance baseline is invented and no learner row is changed.
alter function public.school_core_payload(uuid,jsonb) rename to school_core_payload_metrics_base;
revoke all on function public.school_core_payload_metrics_base(uuid,jsonb) from public,anon,authenticated;
create function public.school_core_payload(p_school uuid,p_payload jsonb) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare data jsonb;items jsonb:='[]';child jsonb;average_mark numeric;recorded integer;missed integer;
begin
 data:=school_core_payload_metrics_base(p_school,p_payload);
 for child in select value from jsonb_array_elements(coalesce(data->'learners','[]')) loop
  select avg(case when jsonb_typeof(a->'scores'->(child->>'id'))='number' then case when (a->'scores'->>(child->>'id'))::numeric between 0 and 100 then (a->'scores'->>(child->>'id'))::numeric end end) into average_mark
  from jsonb_array_elements(coalesce(data->'assessments','[]')) a
  where a->>'class'=child->>'class' and jsonb_typeof(a->'scores'->(child->>'id'))='number';
  if average_mark is not null then child:=child||jsonb_build_object('average',round(average_mark),'averageSource','Recorded assessments');end if;
  select count(*),count(*) filter(where r->'entries'->>(child->>'id') in ('Absent','Sick','Excused')) into recorded,missed
  from jsonb_array_elements(coalesce(data->'attendanceRegisters','[]')) r
  where r->>'class'=child->>'class' and r->'entries'->>(child->>'id') in ('Present','Absent','Sick','Excused');
  if recorded>0 then child:=child||jsonb_build_object('attendance',round(100.0*(recorded-missed)/recorded),'absentDays',missed,'recordedAttendanceDays',recorded,'attendanceSource','Recorded registers');end if;
  items:=items||jsonb_build_array(child);
 end loop;
 return jsonb_set(data,'{learners}',items);
end $$;
revoke all on function public.school_core_payload(uuid,jsonb) from public,anon,authenticated;

-- Parent/teacher conversations are not leadership/SGB/security conversations.
-- Dedicated action owns author identity and append-only retry semantics.
alter function public.save_school_dataset(jsonb,jsonb) rename to save_school_dataset_consistency_base;
revoke all on function public.save_school_dataset_consistency_base(jsonb,jsonb) from public,anon,authenticated;
create function public.save_school_dataset(p_before jsonb,p_after jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform assert_account_access();
 if p_before->'parentChat' is distinct from p_after->'parentChat' then raise exception 'Use the checked conversation action';end if;
 return save_school_dataset_consistency_base(p_before,p_after);
end $$;
revoke all on function public.save_school_dataset(jsonb,jsonb) from public,anon;
grant execute on function public.save_school_dataset(jsonb,jsonb) to authenticated;
alter function public.read_school_dataset() rename to read_school_dataset_consistency_base;
revoke all on function public.read_school_dataset_consistency_base() from public,anon,authenticated;
create function public.read_school_dataset() returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;begin
 perform assert_account_access();result:=read_school_dataset_consistency_base();
 if current_app_role()<>'teacher' then result:=jsonb_set(result,'{payload,parentChat}','[]');end if;
 return result;
end $$;
revoke all on function public.read_school_dataset() from public,anon;
grant execute on function public.read_school_dataset() to authenticated;

-- Reject duplicate logical records inside the locked final workspace, including
-- two different IDs for one class/day. Never delete or merge historical rows.
create function public.validate_school_workflow_keys() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare kind text;begin
 foreach kind in array array['visitors','incidents','assessments','reports','attendanceRegisters','attendanceWeeks','sickNotices','appointments'] loop
  if new.payload->kind is not distinct from old.payload->kind then continue;end if;
  if exists(select 1 from jsonb_array_elements(coalesce(new.payload->kind,'[]')) r where nullif(r->>'id','') is not null group by r->>'id' having count(*)>1) then raise exception 'Duplicate record ID in %; refresh and review the original records',kind;end if;
 end loop;
 if new.payload->'attendanceRegisters' is distinct from old.payload->'attendanceRegisters' and exists(
  select 1 from jsonb_array_elements(coalesce(new.payload->'attendanceRegisters','[]')) r group by r->>'class',r->>'date' having count(*)>1
 ) then raise exception 'An attendance register already exists for this class and date';end if;
 return new;
end $$;
revoke all on function public.validate_school_workflow_keys() from public,anon,authenticated;
create trigger zzz_validate_school_workflow_keys before update on public.school_workspaces for each row execute function public.validate_school_workflow_keys();

-- Browser roles must use the checked projection, not bypass conversation and
-- learner privacy by selecting the complete compatibility payload directly.
-- Keep existing RLS policies; remove only the raw read grant.
revoke select on public.school_workspaces from authenticated;
do $$declare columns text;begin
 select string_agg(quote_ident(attname),',') into columns from pg_attribute
 where attrelid='public.school_workspaces'::regclass and attnum>0 and not attisdropped;
 execute format('revoke select (%s) on public.school_workspaces from authenticated',columns);
end $$;
notify pgrst,'reload schema';
