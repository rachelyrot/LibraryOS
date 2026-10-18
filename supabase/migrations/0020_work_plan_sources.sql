-- Work plan sources: any number of budget sources per plan, chosen from the
-- budget sources list, instead of the fixed "municipal" and "Ministry of
-- Culture" pair.
--
-- Why: a plan was hard-wired to two funders — work_plans.municipal_/
-- ministry_budget_source_id (0014) and work_plan_items.municipal_/
-- ministry_amount (0012), with allocation picks per funder (0017). The admin
-- funds plans from other sources too (מפעל הפיס, תב"ר, קול קורא...) and wants
-- to pick each one from the list, as many as needed, with no "עירוני /
-- משרד התרבות" labels.
--
-- Shape:
-- - work_plans.sources: ordered jsonb array [{ source_id, support }]. `support`
--   marks a source as Ministry of Culture support money ("כספי התמיכה"): the
--   form's rules (culture ≥ 25%, marketing + training ≤ 10%) are measured
--   against the support total, so the plan must know which sources count.
-- - work_plan_items.amounts: { <source_id>: amount } — one amount per plan
--   source.
-- - work_plan_items.allocation_ids: { <source_id>: [budget_allocations.id] }
--   — the categories each amount draws from (replacing the per-funder 0017
--   columns).
-- jsonb (CLAUDE.md: multi-value fields are jsonb arrays/objects), keyed by
-- source id so adding or removing a source needs no schema change.
--
-- The old columns stay (additive only) and the client keeps them in step:
-- ministry_amount = the row's support total, municipal_amount = the rest. So
-- totals that read them stay correct, and nothing that still reads them
-- breaks.
--
-- Backfill: each plan's linked municipal / ministry source becomes a source
-- (the ministry one marked as support), and every row's two amounts and
-- category picks move under those source ids. A plan with no linked source
-- keeps its amounts only in the old columns until a source is chosen.
--
-- Additive only. Requires 0014 and 0017.

alter table public.work_plans
  add column if not exists sources jsonb not null default '[]'::jsonb;

alter table public.work_plan_items
  add column if not exists amounts jsonb not null default '{}'::jsonb,
  add column if not exists allocation_ids jsonb not null default '{}'::jsonb;

comment on column public.work_plans.sources is
  'Ordered plan sources: [{ source_id, support }]. support = counts as Ministry of Culture support money for the form''s rules.';
comment on column public.work_plan_items.amounts is
  'Amount per plan source: { <budget_sources.id>: number }. ministry_amount / municipal_amount are kept as the support / non-support totals.';
comment on column public.work_plan_items.allocation_ids is
  'Budget categories each source amount draws from: { <budget_sources.id>: [budget_allocations.id] }.';

-- plans: linked municipal / ministry source → sources list
update public.work_plans p
set sources = (
  select coalesce(jsonb_agg(s.entry order by s.ord), '[]'::jsonb)
  from (
    select 1 as ord, jsonb_build_object('source_id', p.municipal_budget_source_id, 'support', false) as entry
      where p.municipal_budget_source_id is not null
    union all
    select 2, jsonb_build_object('source_id', p.ministry_budget_source_id, 'support', true)
      where p.ministry_budget_source_id is not null
        and p.ministry_budget_source_id is distinct from p.municipal_budget_source_id
  ) s
)
where p.sources = '[]'::jsonb
  and (p.municipal_budget_source_id is not null or p.ministry_budget_source_id is not null);

-- rows: the two amounts and category picks → keyed by those source ids
update public.work_plan_items i
set amounts = case
      -- the same source on both sides: one key, the two amounts added
      when p.municipal_budget_source_id = p.ministry_budget_source_id
        then jsonb_build_object(p.municipal_budget_source_id::text, coalesce(i.municipal_amount, 0) + coalesce(i.ministry_amount, 0))
      else (
        case when p.municipal_budget_source_id is not null
          then jsonb_build_object(p.municipal_budget_source_id::text, coalesce(i.municipal_amount, 0)) else '{}'::jsonb end
        ||
        case when p.ministry_budget_source_id is not null
          then jsonb_build_object(p.ministry_budget_source_id::text, coalesce(i.ministry_amount, 0)) else '{}'::jsonb end
      )
    end,
    allocation_ids = (
      case when p.municipal_budget_source_id is not null
        then jsonb_build_object(p.municipal_budget_source_id::text, coalesce(i.municipal_allocation_ids, '[]'::jsonb)) else '{}'::jsonb end
      ||
      case when p.ministry_budget_source_id is not null
        then jsonb_build_object(p.ministry_budget_source_id::text, coalesce(i.ministry_allocation_ids, '[]'::jsonb)) else '{}'::jsonb end
    )
from public.work_plans p
where p.id = i.work_plan_id
  and i.amounts = '{}'::jsonb
  and (p.municipal_budget_source_id is not null or p.ministry_budget_source_id is not null);
