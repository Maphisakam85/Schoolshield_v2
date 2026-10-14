-- Avoid introducing a PostgREST many-to-many profiles -> schools relationship.
-- The existing login/profile embed must keep resolving its direct school FK.
-- One composite FK also enforces that every read belongs to the user's tenant.
alter table public.profiles add constraint notification_reader_profile_tenant unique(school_id,id);
alter table public.notification_reads drop constraint notification_reads_school_id_fkey;
alter table public.notification_reads drop constraint notification_reads_user_id_fkey;
alter table public.notification_reads add constraint notification_reader_same_school
 foreign key(school_id,user_id) references public.profiles(school_id,id);
notify pgrst,'reload schema';
