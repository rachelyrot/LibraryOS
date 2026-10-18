-- project_tasks.completed_date: when a task reached "completed".
--
-- Why: a project's milestones are now derived from its tasks — every task that
-- reaches "הושלם" is a milestone achieved (the admin's choice over typing
-- milestones by hand; project_milestones stays for the ones already entered).
-- A milestone needs the date it was achieved, and tasks had none: the client
-- sets this when a task's status changes to completed and clears it when it
-- changes back.
--
-- Backfill: tasks already completed get their last update date — the closest
-- record of when they were completed.
--
-- Additive only.

alter table public.project_tasks
  add column if not exists completed_date date;

comment on column public.project_tasks.completed_date is
  'Date the task reached status completed (set by the client; shown as the milestone date).';

update public.project_tasks
set completed_date = updated_date::date
where status = 'completed' and completed_date is null;
