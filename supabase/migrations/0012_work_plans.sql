-- Annual work plan (תכנית עבודה שנתית) — the document the library prepares and
-- submits to משרד התרבות.
--
-- Why a new pair of tables rather than reusing budget_sources/budget_allocations:
-- the budget tables are the *live* ledger — orders reserve and spend against
-- budget_allocations through apply_order_budget_transition (0003), and every
-- row there is money that is actually available. A work plan is a proposal:
-- it is written before the money is approved, it describes activities rather
-- than spendable lines, and a single activity is typically funded partly by
-- the municipality and partly by the ministry. Writing it into the ledger would
-- make unapproved money look spendable in OrderDetail's budget picker. So the
-- plan is deliberately a separate planning document with no budget side-effects;
-- comparing plan to actual can be layered on later by reading both.
--
-- Shape decisions:
-- - One row per activity, with municipal_amount and ministry_amount side by
--   side, rather than one row per (activity, source). The ministry submission
--   needs both "the whole plan" and "only the ministry part" from the same
--   rows, and a split row keeps an activity's two halves from drifting apart.
-- - category is free text, not a FK to categories: the plan's headings
--   (ספרים, רכש, פעילות…) are the ministry's reporting headings and don't have
--   to match the order categories one-to-one. The UI suggests the existing
--   main categories.
-- - quarters is a jsonb array (e.g. ["q1","q3"]), matching the multi-value
--   convention of employees.additional_branch_ids / approved_positions.category.
-- - work_plan_items.work_plan_id cascades on delete: items have no meaning
--   without their plan, unlike the "parent data is never deleted" FKs elsewhere.
--
-- Access: admin only, for read and write. This is financial planning data, and
-- the page is admin-only in PAGE_ACCESS alongside מקורות תקציב — the same
-- restriction is enforced here so it isn't only a hidden menu item. To open it
-- to מזכירה later, widen both this policy and PAGE_ACCESS together.

create table if not exists public.work_plans (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  year text not null,
  title text not null,
  status text not null default 'draft' check (status in ('draft','submitted','approved')),
  submitted_date date,
  notes text
);

create table if not exists public.work_plan_items (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  work_plan_id uuid not null references public.work_plans(id) on delete cascade,
  category text not null,
  activity_name text not null,
  description text,
  target_audience text,
  expected_participants numeric,
  quarters jsonb not null default '[]'::jsonb,
  municipal_amount numeric not null default 0,
  ministry_amount numeric not null default 0,
  notes text,
  sort_order numeric not null default 0
);

create index if not exists work_plan_items_plan_idx on public.work_plan_items (work_plan_id);

do $$
declare
  t text;
begin
  foreach t in array array['work_plans','work_plan_items']
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('create policy "select_admin_only" on public.%I for select to authenticated using (public.is_admin());', t);
    execute format('create policy "insert_admin_only" on public.%I for insert to authenticated with check (public.is_admin());', t);
    execute format('create policy "update_admin_only" on public.%I for update to authenticated using (public.is_admin()) with check (public.is_admin());', t);
    execute format('create policy "delete_admin_only" on public.%I for delete to authenticated using (public.is_admin());', t);
  end loop;
end $$;
