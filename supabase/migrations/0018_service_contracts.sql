-- service_contracts: security and cleaning contractors, per branch, under
-- כוח אדם → "אבטחה" / "ניקיון".
--
-- Why a separate table rather than employees with a department: these people
-- are not library staff. An outside company is contracted per branch and
-- sends its own workers; the library tracks the company, its contact, which
-- days/hours it covers, what it costs and when the contract ends. Putting them
-- in employees would count them against approved_positions (תקנים) and in the
-- 100% = 40h staffing totals, which is exactly what must not happen.
--
-- One table for both services, keyed by service_type, since the two tabs
-- record the same shape. A third service later is one value in the check.
--
-- Shape:
-- - branch_id/branch_name: FK + denormalized name, the pattern used by
--   employees.primary_branch_name and approved_positions.branch_name.
-- - workers, days: jsonb arrays (CLAUDE.md: multi-value fields are jsonb, see
--   employees.additional_branch_ids). workers = [{ name, phone }], days =
--   weekday indexes 0 (ראשון) .. 5 (שישי), the same numbering as WEEKDAY_LABELS.
-- - start_time/end_time as text "HH:MM", like schedules, so calcShiftHours
--   works on them unchanged.
-- - monthly_cost: shown only to roles with sensitive financial access (client
--   side, canViewSensitiveBudgetData).
--
-- RLS: read for any authenticated user (a branch manager needs to know who
-- guards and cleans her branch), writes admin-only — the same split as
-- budget_sources (0001), and matching canManageServiceContracts in
-- permissions.js.
--
-- Additive only.

create table if not exists public.service_contracts (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  service_type text not null check (service_type in ('security','cleaning')),
  branch_id uuid references public.branches(id) on delete set null,
  branch_name text,
  company_name text not null,
  contact_name text,
  contact_phone text,
  contact_email text,
  workers jsonb not null default '[]'::jsonb,
  days jsonb not null default '[]'::jsonb,
  start_time text,
  end_time text,
  monthly_cost numeric,
  contract_start date,
  contract_end date,
  status text not null default 'active' check (status in ('active','ended')),
  notes text
);

create index if not exists service_contracts_type_idx on public.service_contracts (service_type);

create trigger set_updated_date before update on public.service_contracts
  for each row execute function public.set_updated_date();

alter table public.service_contracts enable row level security;
create policy "select_authenticated" on public.service_contracts for select to authenticated using (true);
create policy "insert_admin_only" on public.service_contracts for insert to authenticated with check (public.is_admin());
create policy "update_admin_only" on public.service_contracts for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "delete_admin_only" on public.service_contracts for delete to authenticated using (public.is_admin());
