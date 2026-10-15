-- Add authorization guards without changing the existing feature operations.
alter function public.persist_parent_document_notice(jsonb) rename to persist_parent_document_notice_internal;
revoke all on function public.persist_parent_document_notice_internal(jsonb) from public,anon,authenticated;
create function public.persist_parent_document_notice(p_record jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare actor public.profiles%rowtype;
begin
  select * into actor from public.profiles where id=auth.uid();
  if actor.id is null or actor.role<>'parent' then raise exception 'Parent sign-in required'; end if;
  if exists(select 1 from public.school_workspaces w cross join lateral jsonb_array_elements(coalesce(w.payload->'sickNotices','[]')) n
    where w.school_id=actor.school_id and n->>'id'=p_record->>'id') and
    not public.can_access_school_notice(actor.school_id,p_record->>'id') then raise exception 'Notice access denied'; end if;
  return public.persist_parent_document_notice_internal(p_record);
end;
$$;
revoke all on function public.persist_parent_document_notice(jsonb) from public,anon;
grant execute on function public.persist_parent_document_notice(jsonb) to authenticated;

alter function public.publish_school_announcement(text,text,text,text,text,text,integer,text) rename to publish_school_announcement_internal;
revoke all on function public.publish_school_announcement_internal(text,text,text,text,text,text,integer,text) from public,anon,authenticated;
create function public.publish_school_announcement(
  p_id text,p_title text,p_body text,p_audience_id text,p_audience text,p_delivery text,
  p_recipients integer default 0,p_action text default 'create'
) returns jsonb language plpgsql security definer set search_path=public as $$
declare actor public.profiles%rowtype; workspace jsonb; class_ids jsonb; item jsonb;
begin
  select * into actor from public.profiles where id=auth.uid();
  if actor.id is null or actor.role not in ('principal','deputy','clerk','teacher') then raise exception 'Publishing access denied'; end if;
  if actor.role='teacher' then
    select payload into workspace from public.school_workspaces where school_id=actor.school_id;
    if p_action='create' then
      select coalesce(jsonb_agg(c->>'id'),'[]') into class_ids from jsonb_array_elements(coalesce(workspace->'classes','[]')) c where c->>'teacher'=actor.display_name;
    else
      select n into item from jsonb_array_elements(coalesce(workspace->'announcements','[]')) n where n->>'id'=p_id;
      class_ids:=coalesce(item->'classIds','[]');
    end if;
    if jsonb_array_length(class_ids)=0 or exists(select 1 from jsonb_array_elements_text(class_ids) c
      where not public.can_access_school_class(actor.school_id,c)) then raise exception 'Publishing class access denied'; end if;
  end if;
  return public.publish_school_announcement_internal(p_id,p_title,p_body,p_audience_id,p_audience,p_delivery,p_recipients,p_action);
end;
$$;
revoke all on function public.publish_school_announcement(text,text,text,text,text,text,integer,text) from public,anon;
grant execute on function public.publish_school_announcement(text,text,text,text,text,text,integer,text) to authenticated;
