-- budget_allocations.category_number: an optional number/code per budget
-- category (e.g. the municipal budget line it is charged to), shown next to the
-- category name everywhere a category is picked or listed.
--
-- Why text and not numeric: budget line codes carry leading zeros, dashes and
-- dots ("0812-750", "01.3"), and are compared/searched, never summed.
--
-- A source without categories (uses_categories = false, 0015) hides its single
-- allocation, so there is nowhere in the UI to type that allocation's number.
-- budget_sources.category_number holds it instead, and sync_single_allocation is
-- redefined to copy it onto the single allocation — the same "the source owns
-- the value, the trigger carries it" shape 0015 uses for planned_amount, so the
-- number stays in sync no matter which path writes the source. For a source
-- that *is* split into categories the source-level column is unused; each
-- category carries its own number.
--
-- Additive only. Requires 0015.

alter table public.budget_allocations
  add column if not exists category_number text;

alter table public.budget_sources
  add column if not exists category_number text;

comment on column public.budget_allocations.category_number is
  'Optional budget line number/code for this category. Text: codes keep leading zeros and separators.';
comment on column public.budget_sources.category_number is
  'Only for uses_categories = false: the number of the source''s single allocation, copied onto it by sync_single_allocation.';

-- ---------------------------------------------------------------------------
-- sync_single_allocation: as in 0015, plus copying category_number.
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
          remaining_amount = greatest(0, v_amount - v_committed),
          category_number = new.category_number
      where id = v_alloc.id;
  else
    insert into budget_allocations (name, budget_source_id, color, allocated_amount, remaining_amount, category_number)
      values ('כללי', new.id, new.color, v_amount, v_amount, new.category_number);
  end if;

  perform public.recalc_budget_source(new.id);
  return new;
end;
$$;

drop trigger if exists budget_sources_single_allocation on public.budget_sources;
create trigger budget_sources_single_allocation
  after insert or update of planned_amount, uses_categories, category_number on public.budget_sources
  for each row execute function public.sync_single_allocation();
