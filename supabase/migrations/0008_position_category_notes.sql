-- LibraryOS — split approved_positions.approval_source into a proper category
-- (same chakal/municipality/other employer split as employees.employer_type,
-- see 0007) plus a separate free-text notes field. approval_source is left in
-- place (unused going forward) rather than repurposed in-place, since it may
-- already hold real free-text data that wouldn't fit the new check constraint.

alter table public.approved_positions
  add column category text check (category in ('chakal', 'municipality', 'other')),
  add column notes text;
