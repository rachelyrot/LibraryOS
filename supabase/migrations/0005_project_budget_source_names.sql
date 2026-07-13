-- Projects: replace the single dropdown-selected budget_source_id/budget_source_name
-- (a real FK to budget_sources, meant for formal PurchaseOrder-style budget tracking)
-- with a free-text, multi-value list the user types directly -- a project can now
-- list several funding sources by name without them needing to exist as real
-- BudgetSource rows. The old budget_source_id/budget_source_name columns are left
-- in place (unused going forward) rather than dropped, since dropping columns is
-- destructive and nothing currently depends on removing them.

alter table public.projects
  add column budget_source_names jsonb not null default '[]'::jsonb;
