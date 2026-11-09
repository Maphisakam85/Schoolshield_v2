-- Append/update announcements atomically in the existing workspace payload.
create or replace function public.publish_school_announcement(
  p_id text, p_title text, p_body text, p_audience_id text,
  p_audience text, p_delivery text, p_recipients integer default 0,
  p_action text default 'create'
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  actor public.profiles%rowtype;
  workspace jsonb;
  items jsonb;
  item jsonb;
  class_ids jsonb := '[]';
  saved jsonb;
  notices jsonb;
begin
  select * into actor from public.profiles where id = auth.uid();
  if actor.id is null or actor.role not in ('principal','deputy','clerk','teacher') then
    raise exception 'You are not permitted to publish announcements';
  end if;
  if p_action not in ('create','update','delete') or p_action is null then raise exception 'Invalid announcement action'; end if;
  if p_id is null or length(p_id) not between 5 and 100 then raise exception 'Invalid announcement ID'; end if;
  if p_action <> 'delete' and (p_title is null or length(btrim(p_title, E' \t\r\n')) not between 1 and 140 or p_body is null or length(btrim(p_body, E' \t\r\n')) not between 1 and 2000) then
    raise exception 'Enter a title and a message (maximum 140 and 2000 characters)';
  end if;
  select payload into workspace from public.school_workspaces where school_id = actor.school_id for update;
  if workspace is null then raise exception 'School workspace is unavailable'; end if;
  items := coalesce(workspace->'announcements','[]'::jsonb);
  select value into item from jsonb_array_elements(items) where value->>'id' = p_id;
  if item is not null then
    if coalesce(item->>'authorId', '') <> actor.id::text and not (item->>'authorId' is null and item->>'author' = actor.display_name) then raise exception 'Only the author can change this announcement'; end if;
    if p_action = 'create' then return item; end if; -- idempotent retry
  elsif p_action <> 'create' then raise exception 'Announcement not found';
  end if;
  if p_action = 'create' then
    if p_delivery is null or p_delivery not in ('In-app notification','In-app + SMS','In-app + Email') then raise exception 'Select a delivery method'; end if;
    if actor.role = 'teacher' and p_audience_id is distinct from 'my-classes-parents' then raise exception 'Teachers may only contact their class parents'; end if;
    if actor.role = 'clerk' and (p_audience_id is null or p_audience_id not in ('all-parents','whole-school','all-staff')) then raise exception 'Audience is not permitted'; end if;
    if actor.role in ('principal','deputy') and (p_audience_id is null or not (
      p_audience_id in ('whole-school','all-parents','all-learners','all-staff','teachers','leadership','sgb','security','administration')
      or exists (select 1 from jsonb_array_elements(coalesce(workspace->'classes','[]')) c where p_audience_id = 'class-' || (c->>'id') or p_audience_id = 'grade-' || replace(c->>'grade',' ','-'))
    )) then raise exception 'Audience is not permitted'; end if;
    if p_audience_id = 'my-classes-parents' then
      select coalesce(jsonb_agg(c->>'id'),'[]') into class_ids from jsonb_array_elements(coalesce(workspace->'classes','[]')) c where c->>'teacher' = actor.display_name;
      if jsonb_array_length(class_ids) = 0 then raise exception 'No teaching classes are assigned'; end if;
    end if;
    saved := jsonb_build_object('id',p_id,'title',btrim(p_title,E' \t\r\n'),'body',btrim(p_body,E' \t\r\n'),
      'audienceId',p_audience_id,'audience',p_audience,'classIds',class_ids,'recipients',greatest(coalesce(p_recipients,0),0),
      'delivery',p_delivery,'author',actor.display_name,'authorId',actor.id,
      'date',to_char(now() at time zone 'Africa/Johannesburg','DD Mon YYYY'),'createdAt',now());
    items := jsonb_build_array(saved) || items;
  else
    saved := item || jsonb_build_object('title',btrim(p_title,E' \t\r\n'),'body',btrim(p_body,E' \t\r\n'));
    select coalesce(jsonb_agg(case when value->>'id' = p_id then saved else value end),'[]') into items from jsonb_array_elements(items) where p_action <> 'delete' or value->>'id' <> p_id;
  end if;
  notices := coalesce(workspace->'notifications','[]'::jsonb);
  if p_action = 'create' then
    notices := jsonb_build_array(saved || jsonb_build_object('id','NOTICE-' || p_id,'announcementId',p_id,
      'description',btrim(p_body,E' \t\r\n'),'reporter',actor.display_name,'category','Announcement','priority','Medium','read',false)) || notices;
  else
    select coalesce(jsonb_agg(case when value->>'announcementId' = p_id then value || jsonb_build_object('title',p_title,'description',p_body) else value end),'[]') into notices
      from jsonb_array_elements(notices) where p_action <> 'delete' or value->>'announcementId' is distinct from p_id;
  end if;
  update public.school_workspaces set payload = jsonb_set(jsonb_set(workspace,'{announcements}',items),'{notifications}',notices), updated_by = actor.id where school_id = actor.school_id;
  return saved;
end;
$$;
revoke all on function public.publish_school_announcement(text,text,text,text,text,text,integer,text) from public;
grant execute on function public.publish_school_announcement(text,text,text,text,text,text,integer,text) to authenticated;
