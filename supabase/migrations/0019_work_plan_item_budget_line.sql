-- work_plan_items.budget_line: the budget line (סעיף תקציבי) a work plan row
-- is charged to, typed by the admin next to the row's details.
--
-- Why a free-text column rather than a link to budget_allocations: the row
-- already links to categories through municipal_/ministry_allocation_ids
-- (0017), and those can be several per row. The budget line is the code the
-- municipality / ministry use on their own forms ("1-822-750", "01.3") — it is
-- written and reported, not computed with, so it stays text (leading zeros and
-- separators survive), matching budget_allocations.category_number (0016).
--
-- Additive only.

alter table public.work_plan_items
  add column if not exists budget_line text;

comment on column public.work_plan_items.budget_line is
  'Budget line (סעיף תקציבי) this plan row is charged to. Free text: codes keep leading zeros and separators.';
