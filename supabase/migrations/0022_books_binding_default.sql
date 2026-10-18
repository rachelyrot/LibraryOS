-- Book procurement: binding (כריכה) is checked for every book.
--
-- Why: the library always binds its books, so the admin wants כריכה marked
-- "yes" everywhere instead of ticking it book by book. The client now defaults
-- it to true for a new book and for an imported row whose file says nothing
-- (bookListImport.js); this migration brings the books already in the system
-- in line.
--
-- binding_required lives inside the `books` jsonb array of each list, so this
-- rewrites the array element by element, keeping every other field and the
-- order.
--
-- Only lists that are still being worked on, so nothing already sent to a
-- supplier changes under it:
-- - supplier_book_lists in received / in_review / books_selected (not yet
--   transferred to a quote request, not closed);
-- - book_quote_requests still in draft (not yet sent to suppliers).
-- A book can still be unticked individually afterwards.
--
-- Data-only, no schema change.

update public.supplier_book_lists
set books = (
  select coalesce(jsonb_agg(b || jsonb_build_object('binding_required', true) order by ord), '[]'::jsonb)
  from jsonb_array_elements(books) with ordinality as e(b, ord)
)
where status in ('received', 'in_review', 'books_selected')
  and jsonb_typeof(books) = 'array'
  and jsonb_array_length(books) > 0;

update public.book_quote_requests
set books = (
  select coalesce(jsonb_agg(b || jsonb_build_object('binding_required', true) order by ord), '[]'::jsonb)
  from jsonb_array_elements(books) with ordinality as e(b, ord)
)
where status = 'draft'
  and jsonb_typeof(books) = 'array'
  and jsonb_array_length(books) > 0;
