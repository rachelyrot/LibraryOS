-- LibraryOS — split approved_positions.approval_source into a proper category
-- (same chakal/municipality/other employer split as employees.employer_type,
-- see 0007) plus a separate free-text notes field. approval_source is left in
-- place (unused going forward) rather than repurposed in-place, since it may
-- already hold real free-text data that wouldn't fit the new check constraint.
--
-- category is jsonb (not a plain text + check) because a position can belong
-- to more than one category at once (e.g. both "חכ"ל" and "עירייה") — matches
-- the existing jsonb-array-of-strings convention used elsewhere in this schema
-- (e.g. employees.additional_branch_ids) rather than a single-value check
-- constraint, which can't express multi-select cleanly.

alter table public.approved_positions
  add column category jsonb not null default '[]'::jsonb,
  add column notes text;
