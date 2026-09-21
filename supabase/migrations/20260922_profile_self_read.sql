-- A signed-in user must always be able to load their own role and school
-- during session bootstrap, without relying on a school-wide profile lookup.
create policy "users read their own profile"
on public.profiles for select to authenticated
using (id = auth.uid());
