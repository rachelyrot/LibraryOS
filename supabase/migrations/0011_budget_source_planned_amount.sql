-- budget_sources.planned_amount: the amount an admin actually types in, kept
-- separate from the derived total.
--
-- Bug: "מקורות תקציב — עדכון סכום לא מופיע". Editing a budget source and setting
-- "סכום התחלתי" appeared to save (the dialog closed, the toast said עודכן) but
-- the number never showed up anywhere afterwards.
--
-- Two independent reasons, both of which had to be fixed:
--
--   1. Nothing ever displayed it. Credits.jsx renders every headline figure from
--      sourceTotals / catTotals, which are sums over budget_allocations. The
--      value written to budget_sources.total_amount was never read back.
--
--   2. It could not have survived anyway. recalc_budget_source (0003) sets
--      total_amount = sum(allocated_amount) over the source's categories, and it
--      runs on every category save and inside apply_order_budget_transition. So
--      an admin-entered total_amount is overwritten by the next category edit
--      or order approval.
--
-- Why a new column rather than "make total_amount editable": deriving the
-- source total from its categories is a deliberate invariant of this schema
-- (0003's header, and CLAUDE.md's budget rules) — the whole point is that a
-- source can never claim a total its categories don't add up to. Making it
-- writable would let the two disagree, silently, and every budget check
-- downstream reads the derived figure.
--
-- planned_amount is therefore a *different* quantity: the budget the library was
-- promised or approved for, against which the allocated categories are compared.
-- The Credits screen shows both, plus the gap between them, which is the number
-- the admin was actually looking for. recalc_budget_source is untouched and does
-- not know this column exists.
--
-- Additive only — total_amount stays exactly as it is, still derived.

alter table public.budget_sources
  add column if not exists planned_amount numeric;

comment on column public.budget_sources.planned_amount is
  'Admin-entered budget ceiling for this source. Never derived and never written by recalc_budget_source — compare against total_amount (the sum of its allocations).';
