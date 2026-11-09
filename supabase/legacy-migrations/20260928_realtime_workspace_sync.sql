-- Broadcast each school workspace update to authenticated members of that school.
-- The existing Row Level Security SELECT policy continues to control who can
-- receive a change event; the client also filters by its active school ID.
alter publication supabase_realtime add table public.school_workspaces;
