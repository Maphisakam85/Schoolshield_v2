-- Give each demonstration parent a single learner link without exposing the
-- school-wide workspace to parent accounts. Real parent links are created by
-- an authorised school staff process.
insert into public.parent_learner_links (school_id, parent_id, learner_ref)
select profile.school_id, profile.id, workspace.payload -> 'learners' -> 0 ->> 'id'
from public.profiles profile
join auth.users account on account.id = profile.id
join public.school_workspaces workspace on workspace.school_id = profile.school_id
where profile.role = 'parent'
  and lower(account.email) like 'parent@%.test'
  and coalesce(workspace.payload -> 'learners' -> 0 ->> 'id', '') <> ''
on conflict (school_id, parent_id, learner_ref) do nothing;
