-- Work plan rows: a budget-utilization period, from month to month.
--
-- Why: the library's plan follows משרד התרבות's budget-planning form
-- ("תכנון התקציב של הספריות הציבוריות"), and the library wants to state, for
-- each detailed row under each of the form's parameters, *when* the money will
-- be used — and to see the plan as a month-by-month utilization schedule.
--
-- The quarters column from 0012 was too coarse for that ("רבעון ב'" can't say
-- "May only"), and a jsonb list of arbitrary months would make "from–to" — the
-- way a utilization period is actually described — awkward to edit and to read
-- back. So a row gets a simple inclusive month range. A single-month row has
-- start = end; a row with neither set is shown as "לא נקבע".
--
-- Additive only: quarters stays in place, and the UI still falls back to it for
-- any row that has quarters but no month range.

alter table public.work_plan_items
  add column if not exists utilization_start_month smallint
    check (utilization_start_month between 1 and 12),
  add column if not exists utilization_end_month smallint
    check (utilization_end_month between 1 and 12);

comment on column public.work_plan_items.utilization_start_month is
  'First month (1-12) in which this row''s budget is planned to be used. Inclusive.';
comment on column public.work_plan_items.utilization_end_month is
  'Last month (1-12) in which this row''s budget is planned to be used. Inclusive; equal to start for a single month.';
