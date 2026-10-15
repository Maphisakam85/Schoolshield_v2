-- Live is the safe default. Original fixture-only schools are labelled once;
-- existing useful records are retained, including mixed live/demo histories.
alter table schools add column data_mode text not null default 'live' check(data_mode in ('live','demo','qa'));
update schools s set data_mode='demo' where s.code in ('SMM-001','LLT-002','SEE-003','LER-004','NTE-005') and exists(select 1 from profiles where school_id=s.id) and not exists(select 1 from profiles p join auth.users u on u.id=p.id where p.school_id=s.id and coalesce(u.email,'') !~ '\.test$');
update schools s set data_mode='qa' from pilot_school_provisions p where p.school_id=s.id and p.fields->>'purpose'='qa';
alter function reserve_pilot_school(uuid,uuid,jsonb) rename to reserve_pilot_school_mode_base;
revoke all on function reserve_pilot_school_mode_base(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
create function reserve_pilot_school(p_actor uuid,p_operation uuid,p_fields jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;begin
 if coalesce(p_fields->>'purpose','pilot') not in ('pilot','demo','qa') then raise exception 'Select live, demo or QA school mode';end if;
 result:=reserve_pilot_school_mode_base(p_actor,p_operation,p_fields);
 update schools set data_mode=case p_fields->>'purpose' when 'qa' then 'qa' when 'demo' then 'demo' else 'live' end where id=(result->>'school_id')::uuid;
 return result;
end $$;
revoke all on function reserve_pilot_school(uuid,uuid,jsonb) from public,anon,authenticated;grant execute on function reserve_pilot_school(uuid,uuid,jsonb) to service_role;

-- Older relational notice/link policies permitted every staff role to read
-- family information. Membership alone is insufficient for these tables.
create function can_access_learner_reference(p_school uuid,p_ref text) returns boolean language plpgsql stable security definer set search_path=public as $$
begin
 if not account_is_ready() or p_school is distinct from current_school_id() then return false;end if;
 if current_app_role() in ('principal','deputy','clerk') then return true;end if;
 if current_app_role()='parent' then return exists(select 1 from parent_learner_links where school_id=p_school and parent_id=auth.uid() and learner_ref=p_ref);end if;
 return current_app_role()='teacher' and exists(select 1 from school_learners l join teacher_review_classes c on c.id=l.class_id and c.school_id=l.school_id where l.school_id=p_school and (l.legacy_ref=p_ref or l.id::text=p_ref) and (exists(select 1 from school_staff s where s.school_id=p_school and s.id=c.teacher_staff_id and s.profile_id=auth.uid()) or exists(select 1 from teacher_teaching_contexts t where t.school_id=p_school and t.class_id=c.id and t.teacher_id=auth.uid() and coalesce(t.start_date,make_date(t.academic_year,1,1))<=current_date and coalesce(t.end_date,make_date(t.academic_year,12,31))>=current_date)));
end $$;
revoke all on function can_access_learner_reference(uuid,text) from public,anon;grant execute on function can_access_learner_reference(uuid,text) to authenticated;
alter table parent_learner_links enable row level security;
revoke insert,update,delete on parent_learner_links from anon,authenticated;
create policy scoped_family_link_reads on parent_learner_links for select to authenticated using(account_is_ready() and school_id=current_school_id() and (current_app_role() in ('principal','deputy','clerk') or current_app_role()='parent' and parent_id=auth.uid() or current_app_role()='teacher' and can_access_learner_reference(school_id,learner_ref)));
create policy family_link_privacy on parent_learner_links as restrictive for select to authenticated using(account_is_ready() and school_id=current_school_id() and (current_app_role() in ('principal','deputy','clerk') or current_app_role()='parent' and parent_id=auth.uid() or current_app_role()='teacher' and can_access_learner_reference(school_id,learner_ref)));
alter table sick_notices enable row level security;
create policy scoped_notice_reads on sick_notices for select to authenticated using(can_access_learner_reference(school_id,learner_ref) and (current_app_role()<>'parent' or submitted_by=auth.uid()));
create policy notice_learner_privacy on sick_notices as restrictive for all to authenticated using(can_access_learner_reference(school_id,learner_ref) and (current_app_role()<>'parent' or submitted_by=auth.uid())) with check(can_access_learner_reference(school_id,learner_ref) and (current_app_role()<>'parent' or submitted_by=auth.uid()));

create function school_integrity_report() returns jsonb language plpgsql stable security definer set search_path=public as $$
declare tenant uuid:=current_school_id();checks jsonb;warnings jsonb;mode text;
begin
 perform assert_account_access();if current_app_role() not in ('principal','deputy','clerk') then raise exception 'Integrity audit access denied';end if;
 select data_mode into mode from schools where id=tenant;
 checks:=jsonb_build_object(
 'profiles_without_auth',(select count(*) from profiles p left join auth.users u on u.id=p.id where p.school_id=tenant and u.id is null),
 'assigned_auth_without_profile',(select count(*) from auth.users u join schools s on s.code=u.raw_app_meta_data->>'school_code' left join profiles p on p.id=u.id where s.id=tenant and p.id is null),
 'active_auth_assignment_mismatch',(select count(*) from profiles p join schools s on s.id=p.school_id join auth.users u on u.id=p.id where p.school_id=tenant and p.account_status='Active' and (u.raw_app_meta_data->>'role' is distinct from p.role::text or u.raw_app_meta_data->>'school_code' is distinct from s.code)),
 'staff_profile_orphans',(select count(*) from school_staff s left join profiles p on p.id=s.profile_id and p.school_id=s.school_id where s.school_id=tenant and s.profile_id is not null and p.id is null),
 'teachers_without_staff_identity',(select count(*) from profiles p where p.school_id=tenant and p.role='teacher' and not exists(select 1 from school_staff s where s.school_id=tenant and s.profile_id=p.id)),
 'class_teacher_orphans',(select count(*) from teacher_review_classes c left join school_staff s on s.id=c.teacher_staff_id and s.school_id=c.school_id where c.school_id=tenant and c.teacher_staff_id is not null and s.id is null),
 'learner_class_orphans',(select count(*) from school_learners l left join teacher_review_classes c on c.id=l.class_id and c.school_id=l.school_id where l.school_id=tenant and l.class_id is not null and c.id is null),
 'family_relationship_orphans',(select count(*) from school_learner_guardians x left join school_learners l on l.id=x.learner_id and l.school_id=x.school_id left join school_guardians g on g.id=x.guardian_id and g.school_id=x.school_id where x.school_id=tenant and (g.id is null or l.id is null)),
 'guardian_account_mismatch',(select count(*) from school_guardians g left join profiles p on p.id=g.profile_id and p.school_id=g.school_id where g.school_id=tenant and g.profile_id is not null and (p.id is null or p.role<>'parent')),
 'teaching_context_orphans',(select count(*) from teacher_teaching_contexts t left join profiles p on p.id=t.teacher_id and p.school_id=t.school_id left join teacher_review_subjects s on s.id=t.subject_id and s.school_id=t.school_id left join teacher_review_classes c on c.id=t.class_id and c.school_id=t.school_id where t.school_id=tenant and (p.id is null or s.id is null or c.id is null)),
 'notification_recipient_mismatch',(select count(*) from account_request_notifications n left join profiles p on p.id=n.recipient_id and p.school_id=n.school_id where n.school_id=tenant and p.id is null),
 'operational_tenant_mismatch',(select count(*) from school_workspaces w cross join lateral jsonb_array_elements(coalesce(w.payload->'visitors','[]')||coalesce(w.payload->'incidents','[]')) r where w.school_id=tenant and r->>'school_id' is distinct from tenant::text),
 'attachment_record_orphans',(select count(*) from document_attachments a where a.school_id=tenant and not exists(select 1 from school_workspaces w cross join lateral jsonb_array_elements(coalesce(w.payload->case a.entity_type when 'visitor' then 'visitors' when 'incident' then 'incidents' else 'sickNotices' end,'[]')) r where w.school_id=tenant and r->>'id'=a.record_id)),
 'ready_files_missing',(select count(*) from document_attachments a where a.school_id=tenant and a.status='ready' and not exists(select 1 from storage.objects o where o.bucket_id='school-documents' and o.name=a.storage_path)));
 warnings:=jsonb_build_object(
 'unlinked_staff_contacts',(select count(*) from school_staff where school_id=tenant and profile_id is null),
 'unassigned_learners',(select count(*) from school_learners where school_id=tenant and class_id is null),
 'learners_without_guardians',(select count(*) from school_learners l where l.school_id=tenant and not exists(select 1 from school_learner_guardians x where x.school_id=tenant and x.learner_id=l.id)),
 'unresolved_legacy_identities',(select count(*) from school_identity_issues where school_id=tenant),
 'legacy_notices_without_recipient_uuid',(select count(*) from school_workspaces w cross join lateral jsonb_array_elements(coalesce(w.payload->'notifications','[]')) n where w.school_id=tenant and nullif(n->>'recipient','') is not null and nullif(n->>'recipientId','') is null),
 'unreferenced_private_objects',(select count(*) from storage.objects o where o.bucket_id='school-documents' and split_part(o.name,'/',1)=tenant::text and not exists(select 1 from document_attachments a where a.school_id=tenant and a.storage_path=o.name) and not exists(select 1 from sick_notice_attachments a where a.school_id=tenant and a.storage_path=o.name)));
 return jsonb_build_object('school_id',tenant,'data_mode',mode,'checked_at',now(),'critical_issue_count',(select sum(value::integer) from jsonb_each_text(checks)),'checks',checks,'warnings',warnings,'source','Supabase normalized school records and private Storage');
end $$;
revoke all on function school_integrity_report() from public,anon;grant execute on function school_integrity_report() to authenticated;
