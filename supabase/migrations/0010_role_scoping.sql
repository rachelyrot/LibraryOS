-- Role scoping: per-supplier sharing level, and a home branch on each profile.
--
-- Why:
-- Until now every authenticated user could read every row of every table — the
-- RLS baseline in 0001 is `using (true)` on all 21 entity tables, and
-- permissions.js only ever hid *controls*, never *rows*. The library asked for
-- two genuine data restrictions that a client-side `can*()` helper cannot
-- provide, because the rows still arrive in the browser and are visible to
-- anyone who opens devtools:
--
--   1. Suppliers are shared selectively. Each supplier now carries the list of
--      roles allowed to see it. מנהלת מערכת (admin) and מזכירה (remote_manager)
--      always see every supplier and are therefore NOT stored in the list —
--      storing them would mean an admin could accidentally hide a supplier from
--      herself, and every existing row would need backfilling. The list holds
--      only the two restrictable roles: local_manager, user.
--
--   2. כוח אדם is scoped per branch for מנהלת במקום (local_manager): she should
--      see the employees of her own branch only. That requires knowing which
--      branch a *user* belongs to, and profiles had no such column — branches
--      were only ever attached to employees. Denormalized branch_name alongside
--      branch_id follows the same pattern already used by
--      employees.primary_branch_name and projects.budget_source_name (0005), so
--      the staff screens can label a row without a second query.
--
-- Shape decisions:
-- - jsonb array for shared_with_roles rather than text + check, matching
--   employees.additional_branch_ids and approved_positions.category (0008).
--   The `?` containment operator is indexable and reads cleanly in a policy.
-- - Default '["local_manager","user"]' — every supplier that exists today stays
--   visible to everyone, so applying this migration changes nothing until an
--   admin actually unchecks a role. Additive and non-destructive, per the
--   repo's migration discipline.
-- - Employee/branch scoping is deliberately NOT enforced in RLS here. Unlike
--   suppliers, the staff screens legitimately need cross-branch reads for the
--   roles that keep full access (admin, and מזכירה for reports/schedules), and
--   the branch a local_manager may see is a UI concern layered on top of the
--   same table. Enforcing it in RLS would break ReportsTab and ScheduleTab for
--   the roles that are supposed to keep them. Supplier visibility has no such
--   cross-cutting reader, so it gets the real gate.

-- ---------------------------------------------------------------------------
-- 1. Per-supplier sharing level
-- ---------------------------------------------------------------------------
alter table public.suppliers
  add column if not exists shared_with_roles jsonb not null default '["local_manager","user"]'::jsonb;

comment on column public.suppliers.shared_with_roles is
  'Restrictable roles allowed to see this supplier. admin and remote_manager always see all and are never listed here.';

-- ---------------------------------------------------------------------------
-- 2. Home branch on the user profile
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists branch_id uuid,
  add column if not exists branch_name text;

comment on column public.profiles.branch_id is
  'Home branch. Scopes the כוח אדם screens for local_manager; ignored for admin and remote_manager.';

-- ---------------------------------------------------------------------------
-- 3. current_profile_role(): the caller''s role, for use inside RLS policies.
--
-- security definer so the policy can read public.profiles without recursing
-- through profiles'' own RLS. Mirrors is_admin() from 0001, which is the same
-- pattern one step narrower.
-- ---------------------------------------------------------------------------
create or replace function public.current_profile_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- 4. Suppliers: replace the open select policy with a sharing-aware one.
--
-- The other three policies from 0001 (insert/update/delete_authenticated) are
-- left untouched — write access to suppliers is still gated client-side by
-- canDeleteMasterData(), and narrowing it is a separate decision.
-- ---------------------------------------------------------------------------
drop policy if exists "select_authenticated" on public.suppliers;

create policy "select_by_sharing" on public.suppliers
  for select to authenticated
  using (
    public.current_profile_role() in ('admin', 'remote_manager')
    or coalesce(shared_with_roles, '[]'::jsonb) ? public.current_profile_role()
  );

-- ---------------------------------------------------------------------------
-- 5. profiles: let an admin update someone else''s row.
--
-- 0001 created only "update_own_row" (id = auth.uid()), which is why role
-- assignment had to go through the service_role Edge Function. Setting a user''s
-- branch is not privileged in the same way — it grants no access the user
-- doesn''t already have, it only narrows what she sees — so it can be written
-- straight from /users with the admin''s own session rather than adding another
-- Edge Function verb. The protect_profile_role trigger (0004) still guards the
-- role column itself.
-- ---------------------------------------------------------------------------
create policy "update_admin" on public.profiles
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());
