-- Work plan ↔ budget sources: link a plan to the live budget ledger, so the
-- plan shows how much of each parameter was actually used, and an approved plan
-- can write its amounts into the ledger.
--
-- Why: the library sets its yearly budget in תכנית עבודה שנתית (0012/0013) and
-- tracks real spending in מקורות תקציב (budget_sources/budget_allocations, 0003).
-- The two never met — the admin asked "where do I set the total, and out of it
-- what was used?" and the answer was "type the plan twice, and compare by eye".
--
-- 0012 deliberately kept the plan out of the ledger, because a plan is a
-- proposal and writing it there makes unapproved money look spendable in the
-- order budget picker. That reason still holds, so the sync is:
--   - read-only by default: the plan page *reads* the linked sources'
--     allocations to show reserved/spent per parameter; nothing is written.
--   - write only on explicit request, and only once the plan's status is
--     'approved' (checked inside the RPC, not trusted from the client).
--
-- Shape:
-- - work_plans gets one source per funder (municipal / ministry), matching the
--   plan's two amount columns. A plan row's municipal_amount goes to the
--   municipal source, ministry_amount to the ministry source.
-- - budget_allocations.work_plan_category says which plan parameter a ledger
--   category reports under. Text, not an FK, because the plan's parameters are
--   text too (work_plan_items.category, see 0012). Nullable: allocations that
--   aren't part of any plan stay as they are.
--
-- sync_work_plan_budget is all-or-nothing: if any parameter's new amount would
-- drop below what orders already reserved/spent against it, the whole call
-- raises and nothing is written — a half-synced ledger is worse than none.
-- Allocations are row-locked (for update) while being checked and written, the
-- same pattern as apply_order_budget_transition, so a concurrent order approval
-- can't slip in between the check and the update. Source totals are re-derived
-- with recalc_budget_source; planned_amount (0011) is set to the plan's total
-- for that funder, since an approved plan *is* the approved budget.
--
-- Additive only.

alter table public.work_plans
  add column if not exists municipal_budget_source_id uuid references public.budget_sources(id) on delete set null,
  add column if not exists ministry_budget_source_id uuid references public.budget_sources(id) on delete set null;

alter table public.budget_allocations
  add column if not exists work_plan_category text;

comment on column public.work_plans.municipal_budget_source_id is
  'Budget source that funds this plan''s municipal_amount column.';
comment on column public.work_plans.ministry_budget_source_id is
  'Budget source that funds this plan''s ministry_amount column.';
comment on column public.budget_allocations.work_plan_category is
  'Work plan parameter (work_plan_items.category) this ledger category reports under. Null = not part of a plan.';

create or replace function public.sync_work_plan_budget(p_plan_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan record;
  v_funder record;
  v_row record;
  v_alloc record;
  v_committed numeric;
  v_total numeric;
  v_created int := 0;
  v_updated int := 0;
  v_blocked text := '';
begin
  if not public.is_admin() then
    raise exception 'אין הרשאה לסנכרן תכנית עבודה עם מקורות התקציב';
  end if;

  select * into v_plan from work_plans where id = p_plan_id for update;
  if not found then
    raise exception 'תכנית העבודה לא נמצאה';
  end if;
  if v_plan.status <> 'approved' then
    raise exception 'ניתן לעדכן את מקורות התקציב רק מתכנית בסטטוס "אושרה"';
  end if;

  for v_funder in
    select v_plan.municipal_budget_source_id as source_id, 'municipal' as kind
    union all
    select v_plan.ministry_budget_source_id, 'ministry'
  loop
    continue when v_funder.source_id is null;
    perform 1 from budget_sources where id = v_funder.source_id for update;
    if not found then
      continue;
    end if;

    v_total := 0;

    -- Every parameter the plan funds from this source, plus every allocation
    -- already linked to a parameter (so a parameter removed from the plan is
    -- set to its plan amount, 0, rather than left stale).
    for v_row in
      select cat, coalesce(sum(amount), 0) as amount from (
        select trim(category) as cat,
               case when v_funder.kind = 'municipal' then municipal_amount else ministry_amount end as amount
          from work_plan_items where work_plan_id = p_plan_id
        union all
        select work_plan_category, 0 from budget_allocations
          where budget_source_id = v_funder.source_id and work_plan_category is not null
      ) s
      group by cat
      order by cat
    loop
      v_total := v_total + v_row.amount;

      select * into v_alloc from budget_allocations
        where budget_source_id = v_funder.source_id and work_plan_category = v_row.cat
        order by created_date limit 1 for update;
      if not found then
        -- adopt an existing, unlinked category with the same name instead of duplicating it
        select * into v_alloc from budget_allocations
          where budget_source_id = v_funder.source_id and work_plan_category is null and trim(name) = v_row.cat
          order by created_date limit 1 for update;
      end if;

      if found then
        v_committed := coalesce(v_alloc.reserved_amount, 0) + coalesce(v_alloc.spent_amount, 0);
        if v_row.amount < v_committed then
          v_blocked := v_blocked || format(E'\n%s: מתוכנן ₪%s, אבל כבר שוריין/נוצל ₪%s', v_row.cat, v_row.amount, v_committed);
          continue;
        end if;
        update budget_allocations
          set allocated_amount = v_row.amount,
              remaining_amount = greatest(0, v_row.amount - v_committed),
              work_plan_category = v_row.cat
          where id = v_alloc.id;
        v_updated := v_updated + 1;
      elsif v_row.amount > 0 then
        insert into budget_allocations (name, budget_source_id, allocated_amount, remaining_amount, work_plan_category)
          values (v_row.cat, v_funder.source_id, v_row.amount, v_row.amount, v_row.cat);
        v_created := v_created + 1;
      end if;
    end loop;

    update budget_sources set planned_amount = v_total where id = v_funder.source_id;
    perform public.recalc_budget_source(v_funder.source_id);
  end loop;

  if v_blocked <> '' then
    raise exception 'לא בוצע עדכון — סכום בתכנית נמוך ממה שכבר שוריין/נוצל:%', v_blocked;
  end if;

  return jsonb_build_object('created', v_created, 'updated', v_updated);
end;
$$;

grant execute on function public.sync_work_plan_budget(uuid) to authenticated;
