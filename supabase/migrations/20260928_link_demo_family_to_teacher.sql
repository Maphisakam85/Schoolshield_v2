-- Give every demonstration school one complete family workflow: the first
-- learner's parent is the demonstration parent and their class is assigned to
-- the demonstration teacher. This makes the teacher and parent portals show
-- the same learner without widening parent data access.
with demo_users as (
  select
    profile.school_id,
    max(profile.id::text) filter (where profile.role = 'parent')::uuid as parent_id,
    max(profile.display_name) filter (where profile.role = 'parent') as parent_name,
    max(profile.display_name) filter (where profile.role = 'teacher') as teacher_name
  from public.profiles profile
  join auth.users account on account.id = profile.id
  where lower(account.email) like 'parent@%.test'
     or lower(account.email) like 'teacher@%.test'
  group by profile.school_id
), updated_workspaces as (
  update public.school_workspaces workspace
  set payload = jsonb_set(
    jsonb_set(workspace.payload, '{classes,0,teacher}', to_jsonb(demo_users.teacher_name), true),
    '{learners,0,parent}', to_jsonb(demo_users.parent_name), true
  )
  from demo_users
  where workspace.school_id = demo_users.school_id
    and demo_users.parent_id is not null
    and demo_users.teacher_name is not null
  returning workspace.school_id as workspace_school_id, workspace.payload as workspace_payload
)
insert into public.parent_learner_links (school_id, parent_id, learner_ref)
select demo_users.school_id, demo_users.parent_id, updated_workspaces.workspace_payload -> 'learners' -> 0 ->> 'id'
from updated_workspaces
join demo_users on demo_users.school_id = updated_workspaces.workspace_school_id
where coalesce(updated_workspaces.workspace_payload -> 'learners' -> 0 ->> 'id', '') <> ''
on conflict (school_id, parent_id, learner_ref) do nothing;
