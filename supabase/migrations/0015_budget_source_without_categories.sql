-- budget_sources.uses_categories: a budget source that is not split into
-- categories (e.g. משרד התרבות), while staying inside the ledger model.
--
-- Why: the admin wants some sources split into categories (עירוני) and some
-- not. Every money movement in this schema goes through budget_allocations —
-- apply_order_budget_transition (0003) reserves/spends against
-- purchase_orders.budget_category_id only, and recalc_budget_source derives the
-- source totals from its allocations. Letting orders charge a source directly
-- would mean a second ledger model in both RPCs, validateBudgetSelection,
-- Credits and the Dashboard.
--
-- Shape instead: a source with uses_categories = false owns exactly one
-- allocation (created as "כללי"), whose allocated_amount always equals the
-- source's planned_amount. The UI hides it and auto-selects it in the order /
-- quote pickers, so to the user the source simply "has an amount". Reserve /
-- spend / release keep running through the unchanged 0003 RPC.
--
-- The single allocation is kept in sync by triggers, not by client code, so
-- every path that changes planned_amount — the source dialog, the work plan
-- sync below, a manual SQL update — moves the allocation with it:
-- - budget_sources_single_allocation (after insert / update of planned_amount,
--   uses_categories): creates or updates the one allocation, refuses to cut it
--   below what orders already reserved/spent, refuses to switch off categories
--   while the source still has more than one, then re-derives the source.
--   recalc_budget_source only writes total/reserved/spent/available, so it does
--   not re-fire this trigger.
-- - budget_allocations_single_guard (before insert / update): refuses a second
--   allocation on such a source, and refuses an allocated_amount that differs
--   from the source's planned_amount (the amount is edited on the source).
--
-- sync_work_plan_budget (0014) is redefined: for a source without categories it
-- writes the plan's funder total into planned_amount and lets the trigger carry
-- it to the allocation, instead of creating one allocation per plan parameter.
-- Its all-or-nothing behaviour is unchanged — the trigger's raise aborts the
-- whole call.
--
-- Switching uses_categories back to true just turns the single allocation into
-- an ordinary category. Existing sources default to true (no behaviour change);
-- the admin switches a source off in the source dialog.
--
-- Additive only. Requires 0014.

alter table public.budget_sources
  add column if not exists uses_categories boolean not null default true;

comment on column public.budget_sources.uses_categories is
  'false = not split into categories: the source owns a single allocation whose allocated_amount mirrors planned_amount (kept in sync by budget_sources_single_allocation).';

-- ---------------------------------------------------------------------------
create or replace function public.sync_single_allocation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
  v_alloc record;
  v_amount numeric;
  v_committed numeric;
begin
  if new.uses_categories then
    return new;
  end if;

  select count(*) into v_count from budget_allocations where budget_source_id = new.id;
  if v_count > 1 then
    raise exception 'למקור "%" יש % קטגוריות. כדי לבטל את החלוקה לקטגוריות צריך שתישאר בו קטגוריה אחת בלבד.', new.name, v_count;
  end if;

  v_amount := coalesce(new.planned_amount, 0);

  select * into v_alloc from budget_allocations where budget_source_id = new.id for update;
  if found then
    v_committed := coalesce(v_alloc.reserved_amount, 0) + coalesce(v_alloc.spent_amount, 0);
    if v_amount < v_committed then
      raise exception 'לא ניתן להקטין את התקציב של "%" ל-₪% — כבר שוריינו/נוצלו ממנו ₪%.', new.name, v_amount, v_committed;
    end if;
    update budget_allocations
      set allocated_amount = v_amount,
          remaining_amount = greatest(0, v_amount - v_committed)
      where id = v_alloc.id;
  else
    insert into budget_allocations (name, budget_source_id, color, allocated_amount, remaining_amount)
      values ('כללי', new.id, new.color, v_amount, v_amount);
  end if;

  perform public.recalc_budget_source(new.id);
  return new;
end;
$$;

drop trigger if exists budget_sources_single_allocation on public.budget_sources;
create trigger budget_sources_single_allocation
  after insert or update of planned_amount, uses_categories on public.budget_sources
  for each row execute function public.sync_single_allocation();

-- ---------------------------------------------------------------------------
create or replace function public.guard_single_allocation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source record;
begin
  if new.budget_source_id is null then
    return new;
  end if;

  select * into v_source from budget_sources where id = new.budget_source_id;
  if not found or v_source.uses_categories then
    return new;
  end if;

  if exists (select 1 from budget_allocations where budget_source_id = new.budget_source_id and id <> new.id) then
    raise exception 'מקור התקציב "%" אינו מחולק לקטגוריות — אי אפשר להוסיף לו קטגוריה.', v_source.name;
  end if;

  if new.allocated_amount is distinct from coalesce(v_source.planned_amount, 0) then
    raise exception 'התקציב של "%" אינו מחולק לקטגוריות — את הסכום משנים בעריכת מקור התקציב.', v_source.name;
  end if;

  return new;
end;
$$;

drop trigger if exists budget_allocations_single_guard on public.budget_allocations;
create trigger budget_allocations_single_guard
  before insert or update of budget_source_id, allocated_amount on public.budget_allocations
  for each row execute function public.guard_single_allocation();

-- ---------------------------------------------------------------------------
-- sync_work_plan_budget: as in 0014, plus the uses_categories = false branch.
-- ---------------------------------------------------------------------------
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

    -- Source without categories: the plan's funder total becomes the source's
    -- amount; sync_single_allocation carries it to the single allocation.
    if not v_source.uses_categories then
      select coalesce(sum(case when v_funder.kind = 'municipal' then municipal_amount else ministry_amount end), 0)
        into v_total
        from work_plan_items where work_plan_id = p_plan_id;
      update budget_sources set planned_amount = v_total where id = v_funder.source_id;
      v_updated := v_updated + 1;
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
