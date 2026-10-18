-- Book procurement: binding (כריכה) on for every book, in every status.
--
-- Why: 0022 turned binding on only in lists still being worked on, to avoid
-- changing what was already sent to suppliers. The admin's answer: the library
-- always needs binding, so a "בלי כריכה" anywhere is simply wrong — including
-- lists already transferred, quote requests already sent and book orders.
--
-- This sets binding_required = true on every book of:
-- - supplier_book_lists.books and book_quote_requests.books (all statuses);
-- - purchase_orders.items, only elements that carry binding_required (the
--   book lines; equipment lines don't have the key and are left alone).
-- Every other field and the array order are kept.
--
-- Supersedes 0022 (running both is harmless). Data-only, no schema change.

update public.supplier_book_lists
set books = (
  select coalesce(jsonb_agg(b || jsonb_build_object('binding_required', true) order by ord), '[]'::jsonb)
  from jsonb_array_elements(books) with ordinality as e(b, ord)
)
where jsonb_typeof(books) = 'array' and jsonb_array_length(books) > 0;

update public.book_quote_requests
set books = (
  select coalesce(jsonb_agg(b || jsonb_build_object('binding_required', true) order by ord), '[]'::jsonb)
  from jsonb_array_elements(books) with ordinality as e(b, ord)
)
where jsonb_typeof(books) = 'array' and jsonb_array_length(books) > 0;

update public.purchase_orders
set items = (
  select coalesce(jsonb_agg(
    case when b ? 'binding_required' then b || jsonb_build_object('binding_required', true) else b end
    order by ord), '[]'::jsonb)
  from jsonb_array_elements(items) with ordinality as e(b, ord)
)
where jsonb_typeof(items) = 'array'
  and exists (select 1 from jsonb_array_elements(items) x where x ? 'binding_required');
