-- Order category "חומרים" (materials).
--
-- Why: the admin asked for a "חומרים" main category in purchase orders. Order
-- categories are rows in public.categories (read by useCategories, edited in
-- Settings), not code constants, so adding one is a data change. Done as a
-- migration rather than by hand in Settings so every environment gets it.
--
-- Placed just before "אחר", which stays last in the list. Idempotent: does
-- nothing if an active or inactive main category with that name exists.
--
-- Additive only.

do $$
declare
  v_other numeric;
begin
  if exists (select 1 from public.categories where category_type = 'main' and name = 'חומרים') then
    return;
  end if;

  select sort_order into v_other
  from public.categories
  where category_type = 'main' and name = 'אחר'
  limit 1;

  if v_other is null then
    insert into public.categories (name, category_type, sort_order, status)
    select 'חומרים', 'main', coalesce(max(sort_order), 0) + 1, 'active'
    from public.categories where category_type = 'main';
  else
    -- "אחר" moves to the end, "חומרים" takes its place
    update public.categories
    set sort_order = (select max(sort_order) + 1 from public.categories where category_type = 'main')
    where category_type = 'main' and name = 'אחר';

    insert into public.categories (name, category_type, sort_order, status)
    values ('חומרים', 'main', v_other, 'active');
  end if;
end $$;
