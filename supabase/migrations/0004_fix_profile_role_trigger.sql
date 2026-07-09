-- Fix protect_profile_role (see 0001_init_schema.sql): it was blocking legitimate
-- admin-via-SQL-Editor role updates, not just client-side self-escalation.
--
-- Root cause: is_admin() checks `role = 'admin' and id = auth.uid()`. When a query
-- runs via the Supabase Studio SQL Editor (or any direct Postgres connection), there
-- is no JWT/session context, so auth.uid() is null and is_admin() always evaluates
-- to false -- silently reverting new.role back to old.role even for a legitimate
-- admin-run UPDATE, with no error surfaced.
--
-- Fix: only enforce the block when there IS an authenticated request context
-- (auth.uid() is not null) and that user isn't an admin. A null auth.uid() means
-- the update came from a privileged direct connection (SQL Editor, migrations,
-- service role) and should be trusted implicitly -- only admins/service-role
-- credential holders have that kind of direct database access in the first place.

create or replace function public.protect_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role
     and auth.uid() is not null
     and not public.is_admin() then
    new.role = old.role;
  end if;
  return new;
end;
$$;
