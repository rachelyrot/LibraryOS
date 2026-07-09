-- LibraryOS — file storage bucket for uploaded attachments (§5 of
-- .claude/plans/replicated-moseying-reef.md)
--
-- Single public bucket — this is an internal, already-authenticated staff tool,
-- object paths are unguessable (uuid-prefixed), and public URLs avoid the added
-- complexity/cost of signed-URL generation for files that must resolve indefinitely
-- (e.g. a ProjectDocument.file_url created a year ago must still work).

insert into storage.buckets (id, name, public)
values ('library-files', 'library-files', true)
on conflict (id) do nothing;

-- Public bucket: anyone with the (unguessable) object URL can read the file directly
-- via Storage's public URL endpoint — this select policy additionally allows reading
-- via the authenticated Supabase client/API, not just the public URL.
create policy "library_files_select"
on storage.objects for select
using (bucket_id = 'library-files');

-- Only authenticated (logged-in) users may upload — mirrors the baseline
-- "any authenticated user" posture used for entity tables in 0001_init_schema.sql.
create policy "library_files_insert"
on storage.objects for insert
to authenticated
with check (bucket_id = 'library-files');
