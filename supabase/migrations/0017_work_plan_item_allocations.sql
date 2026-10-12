-- work_plan_items.<funder>_allocation_ids: a plan row draws from budget
-- categories the admin picks, instead of the sync creating a category per plan
-- parameter.
--
-- Why: with 0014's sync, an approved plan row of ₪200 under a parameter with no
-- linked category made the sync *create* a new ₪200 category next to the
-- source's existing ones (₪122 + ₪123), and set the source's planned_amount to
-- ₪200 — while ₪445 sat in categories the plan never mentioned. The admin's
-- model is the opposite: the categories already hold the money, and a plan row
-- says which of them it comes out of, possibly several combined ("122 from one
-- + 78 from the other") as long as together they have enough.
--
-- Shape: an ordered jsonb array of budget_allocations ids per funder column.
-- Only ids are stored, not per-category amounts: the split is derived on the
-- client (workPlan.js planAllocationSplits) by filling the chosen categories in
-- order, each up to what earlier rows in the plan have left in it. Storing
-- amounts would go stale the moment a row amount or a category amount changes.
-- jsonb array rather than a join table, matching employees.additional_branch_ids
-- (CLAUDE.md: multi-value fields use jsonb arrays). No FK on array elements; a
-- deleted category simply stops matching and the row shows a shortfall.
--
-- sync_work_plan_budget is redefined so that, for a source split into
-- categories, rows that chose categories are left out of the per-parameter
-- category writes — the plan draws from those categories, it does not set
-- them. If any row of that funder chose categories, the source's planned_amount
-- is also left alone (the plan total is no longer "the source's budget"; the
-- categories are). Rows that chose nothing keep 0014's behaviour. Sources
-- without categories (0015) are unchanged: their single allocation still
-- mirrors the plan total.
--
-- Additive only. Requires 0015/0016.

alter table public.work_plan_items
  add column if not exists municipal_allocation_ids jsonb not null default '[]'::jsonb,
  add column if not exists ministry_allocation_ids jsonb not null default '[]'::jsonb;

comment on column public.work_plan_items.municipal_allocation_ids is
  'Ordered budget_allocations ids this row''s municipal_amount draws from (split client-side, filling each in order). Empty = 0014 per-parameter sync.';
comment on column public.work_plan_items.ministry_allocation_ids is
  'Ordered budget_allocations ids this row''s ministry_amount draws from (split client-side, filling each in order). Empty = 0014 per-parameter sync.';

create or replace function public.sync_work_plan_budget(p_plan_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan record;
  v_funder record;
  v_source record;
  v_row record;
  v_alloc record;
  v_committed numeric;
  v_total numeric;
  v_uses_picked boolean;
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
    select * into v_source from budget_sources where id = v_funder.source_id for update;
    if not found then
      continue;
    end if;

    -- Source without categories (0015): the plan's funder total becomes the
    -- source's amount; sync_single_allocation carries it to the allocation.
    if not v_source.uses_categories then
      select coalesce(sum(case when v_funder.kind = 'municipal' then municipal_amount else ministry_amount end), 0)
        into v_total
        from work_plan_items where work_plan_id = p_plan_id;
      update budget_sources set planned_amount = v_total where id = v_funder.source_id;
      v_updated := v_updated + 1;
      continue;
    end if;

    select exists (
      select 1 from work_plan_items
        where work_plan_id = p_plan_id
          and jsonb_array_length(case when v_funder.kind = 'municipal' then municipal_allocation_ids else ministry_allocation_ids end) > 0
    ) into v_uses_picked;

    v_total := 0;

    -- Every parameter funded by rows that did NOT pick categories, plus every
    -- allocation already linked to a parameter (so a parameter no longer
    -- funded this way is set to 0 rather than left stale).
    for v_row in
      select cat, coalesce(sum(amount), 0) as amount from (
        select trim(category) as cat,
               case when v_funder.kind = 'municipal' then municipal_amount else ministry_amount end as amount
          from work_plan_items
          where work_plan_id = p_plan_id
            and jsonb_array_length(case when v_funder.kind = 'municipal' then municipal_allocation_ids else ministry_allocation_ids end) = 0
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

    if not v_uses_picked then
      update budget_sources set planned_amount = v_total where id = v_funder.source_id;
    end if;
    perform public.recalc_budget_source(v_funder.source_id);
  end loop;

  if v_blocked <> '' then
    raise exception 'לא בוצע עדכון — סכום בתכנית נמוך ממה שכבר שוריין/נוצל:%', v_blocked;
  end if;

  return jsonb_build_object('created', v_created, 'updated', v_updated);
end;
$$;

grant execute on function public.sync_work_plan_budget(uuid) to authenticated;
