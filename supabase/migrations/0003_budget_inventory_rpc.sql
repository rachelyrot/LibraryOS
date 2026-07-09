-- LibraryOS -- atomic budget/credit and goods-receipt RPCs (section 4 of
-- .claude/plans/replicated-moseying-reef.md), replacing the sequential,
-- non-atomic client-side logic in src/lib/budgetUpdater.js and
-- src/components/GoodsReceiptDialog.jsx.

-- ---------------------------------------------------------------------------
-- apply_order_budget_transition: reserve/spend/release budget or supplier
-- credit amounts when a purchase order's status changes. Locks the order row
-- (guards against a concurrent double-submit) and re-checks the budget_updated
-- guard inside the transaction rather than trusting a value the client read
-- earlier.
-- ---------------------------------------------------------------------------
create or replace function public.apply_order_budget_transition(p_order_id uuid, p_new_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_amount numeric;
  v_cat record;
  v_credit record;
  v_new_reserved numeric;
  v_new_spent numeric;
  v_new_used numeric;
  v_transaction jsonb;
begin
  select * into v_order from purchase_orders where id = p_order_id for update;
  if not found then
    raise exception 'Purchase order % not found', p_order_id;
  end if;

  if v_order.budget_category_id is null and v_order.credit_id is null then
    return;
  end if;

  if v_order.budget_updated and p_new_status = 'approved' then
    return; -- already applied; guards against double-application
  end if;

  v_amount := coalesce(v_order.total_amount, 0);
  if v_amount <= 0 then
    return;
  end if;

  if v_order.budget_category_id is not null then
    select * into v_cat from budget_allocations where id = v_order.budget_category_id for update;
    if not found then
      return;
    end if;

    if p_new_status = 'approved' then
      v_new_reserved := coalesce(v_cat.reserved_amount, 0) + v_amount;
      update budget_allocations
        set reserved_amount = v_new_reserved,
            remaining_amount = greatest(0, coalesce(v_cat.allocated_amount, 0) - v_new_reserved - coalesce(v_cat.spent_amount, 0))
        where id = v_cat.id;
      update purchase_orders set budget_updated = true where id = p_order_id;

    elsif p_new_status in ('received_full', 'received_partial') then
      v_new_reserved := greatest(0, coalesce(v_cat.reserved_amount, 0) - v_amount);
      v_new_spent := coalesce(v_cat.spent_amount, 0) + v_amount;
      v_transaction := jsonb_build_object(
        'date', to_char(now(), 'YYYY-MM-DD'),
        'amount', v_amount,
        'supplier_name', coalesce(v_order.supplier_name, ''),
        'description', 'הזמנת רכש שהתקבלה: ' || coalesce(v_order.title, v_order.id::text),
        'is_manual', false,
        'order_id', v_order.id
      );
      update budget_allocations
        set reserved_amount = v_new_reserved,
            spent_amount = v_new_spent,
            remaining_amount = greatest(0, coalesce(v_cat.allocated_amount, 0) - v_new_reserved - v_new_spent),
            transactions = coalesce(v_cat.transactions, '[]'::jsonb) || v_transaction
        where id = v_cat.id;

    elsif p_new_status = 'cancelled' then
      v_new_reserved := greatest(0, coalesce(v_cat.reserved_amount, 0) - v_amount);
      update budget_allocations
        set reserved_amount = v_new_reserved,
            remaining_amount = greatest(0, coalesce(v_cat.allocated_amount, 0) - v_new_reserved - coalesce(v_cat.spent_amount, 0))
        where id = v_cat.id;
      update purchase_orders set budget_updated = false where id = p_order_id;
    end if;

    if v_cat.budget_source_id is not null then
      perform public.recalc_budget_source(v_cat.budget_source_id);
    end if;

  elsif v_order.credit_id is not null then
    select * into v_credit from supplier_credits where id = v_order.credit_id for update;
    if not found then
      return;
    end if;

    if p_new_status = 'approved' then
      v_new_reserved := coalesce(v_credit.reserved_amount, 0) + v_amount;
      v_transaction := jsonb_build_object(
        'date', to_char(now(), 'YYYY-MM-DD'),
        'amount', v_amount,
        'order_id', v_order.id,
        'description', 'שוריין להזמנה ' || coalesce(v_order.title, v_order.id::text),
        'action', 'reserved'
      );
      update supplier_credits
        set reserved_amount = v_new_reserved,
            remaining_amount = greatest(0, coalesce(v_credit.total_amount, 0) - v_new_reserved - coalesce(v_credit.used_amount, 0)),
            transactions = coalesce(v_credit.transactions, '[]'::jsonb) || v_transaction
        where id = v_credit.id;
      update purchase_orders set budget_updated = true where id = p_order_id;

    elsif p_new_status in ('received_full', 'received_partial') then
      v_new_reserved := greatest(0, coalesce(v_credit.reserved_amount, 0) - v_amount);
      v_new_used := coalesce(v_credit.used_amount, 0) + v_amount;
      v_transaction := jsonb_build_object(
        'date', to_char(now(), 'YYYY-MM-DD'),
        'amount', v_amount,
        'order_id', v_order.id,
        'description', 'נוצל להזמנה ' || coalesce(v_order.title, v_order.id::text),
        'action', 'used'
      );
      update supplier_credits
        set reserved_amount = v_new_reserved,
            used_amount = v_new_used,
            remaining_amount = greatest(0, coalesce(v_credit.total_amount, 0) - v_new_reserved - v_new_used),
            status = case
              when greatest(0, coalesce(v_credit.total_amount, 0) - v_new_reserved - v_new_used) <= 0 and v_credit.status = 'active'
              then 'exhausted' else v_credit.status
            end,
            transactions = coalesce(v_credit.transactions, '[]'::jsonb) || v_transaction
        where id = v_credit.id;

    elsif p_new_status = 'cancelled' then
      v_new_reserved := greatest(0, coalesce(v_credit.reserved_amount, 0) - v_amount);
      v_transaction := jsonb_build_object(
        'date', to_char(now(), 'YYYY-MM-DD'),
        'amount', v_amount,
        'order_id', v_order.id,
        'description', 'שוחרר מביטול הזמנה ' || coalesce(v_order.title, v_order.id::text),
        'action', 'released'
      );
      update supplier_credits
        set reserved_amount = v_new_reserved,
            remaining_amount = greatest(0, coalesce(v_credit.total_amount, 0) - v_new_reserved - coalesce(v_credit.used_amount, 0)),
            transactions = coalesce(v_credit.transactions, '[]'::jsonb) || v_transaction
        where id = v_credit.id;
      update purchase_orders set budget_updated = false where id = p_order_id;
    end if;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- recalc_budget_source: BudgetSource totals are always derived by summing its
-- BudgetAllocation rows (direct port of the client's recalcBudgetSource reduce).
-- ---------------------------------------------------------------------------
create or replace function public.recalc_budget_source(p_source_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total numeric;
  v_reserved numeric;
  v_spent numeric;
begin
  select coalesce(sum(allocated_amount), 0), coalesce(sum(reserved_amount), 0), coalesce(sum(spent_amount), 0)
    into v_total, v_reserved, v_spent
    from budget_allocations
    where budget_source_id = p_source_id;

  update budget_sources
    set total_amount = v_total,
        reserved_amount = v_reserved,
        spent_amount = v_spent,
        available_amount = greatest(0, v_total - v_reserved - v_spent)
    where id = p_source_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- apply_goods_receipt: replaces GoodsReceiptDialog.jsx's per-item N+1 sequential
-- loop with a single atomic call -- upserts inventory_items (match by name +
-- category), appends a movement entry, and marks the order received, all in
-- one transaction.
--
-- p_received_items shape: jsonb array of { name, quantity, unit_price, isbn }
-- (already filtered client-side to items with quantity > 0).
-- ---------------------------------------------------------------------------
create or replace function public.apply_goods_receipt(
  p_order_id uuid,
  p_new_status text,
  p_received_date date,
  p_confirmed_by text,
  p_received_items jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_item jsonb;
  v_name text;
  v_qty numeric;
  v_unit_price numeric;
  v_isbn text;
  v_existing record;
  v_movement jsonb;
begin
  select * into v_order from purchase_orders where id = p_order_id for update;
  if not found then
    raise exception 'Purchase order % not found', p_order_id;
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_received_items, '[]'::jsonb))
  loop
    v_name := v_item->>'name';
    v_qty := coalesce((v_item->>'quantity')::numeric, 0);
    v_unit_price := coalesce((v_item->>'unit_price')::numeric, 0);
    v_isbn := coalesce(v_item->>'isbn', '');

    if v_qty <= 0 then
      continue;
    end if;

    v_movement := jsonb_build_object(
      'date', to_char(p_received_date, 'YYYY-MM-DD'),
      'type', 'קבלת הזמנה',
      'purchase_order_id', v_order.id,
      'supplier_name', coalesce(v_order.supplier_name, ''),
      'quantity_added', v_qty
    );

    select * into v_existing from inventory_items
      where name = v_name and category = v_order.category
      limit 1
      for update;

    if found then
      update inventory_items
        set current_quantity = coalesce(current_quantity, 0) + v_qty,
            last_purchase_order_id = v_order.id,
            last_received_date = p_received_date,
            last_supplier_id = coalesce(v_order.supplier_id, last_supplier_id),
            last_unit_price = v_unit_price,
            supplier_id = coalesce(v_order.supplier_id, supplier_id),
            supplier_name = coalesce(v_order.supplier_name, supplier_name),
            movements = coalesce(movements, '[]'::jsonb) || v_movement
        where id = v_existing.id;
    else
      insert into inventory_items (
        name, category, subcategory, current_quantity, minimum_quantity, unit,
        last_purchase_order_id, last_received_date, last_supplier_id, last_unit_price,
        supplier_id, supplier_name, isbn, movements
      ) values (
        v_name, coalesce(v_order.category, ''), coalesce(v_order.subcategory, ''), v_qty, 1, 'יחידות',
        v_order.id, p_received_date, v_order.supplier_id, v_unit_price,
        v_order.supplier_id, coalesce(v_order.supplier_name, ''), v_isbn, jsonb_build_array(v_movement)
      );
    end if;
  end loop;

  update purchase_orders
    set status = p_new_status,
        received_date = p_received_date,
        receipt_confirmed_by = p_confirmed_by,
        inventory_updated = true
    where id = p_order_id;
end;
$$;

grant execute on function public.apply_order_budget_transition(uuid, text) to authenticated;
grant execute on function public.recalc_budget_source(uuid) to authenticated;
grant execute on function public.apply_goods_receipt(uuid, text, date, text, jsonb) to authenticated;
