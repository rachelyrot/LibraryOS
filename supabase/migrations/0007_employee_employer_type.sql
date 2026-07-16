-- LibraryOS — separate "employer" categorization for employees (§ staff fixes)
--
-- employees.employment_type already covers the *status* dimension (permanent/
-- temporary/substitute/volunteer/student/other — "מ"מ, עובדת קבועה, מתנדבת" etc.).
-- It has no concept of *who employs* the person (municipality directly vs. the
-- municipal economic company vs. some other arrangement) — a separate, orthogonal
-- categorization the library staff track independently.

alter table public.employees
  add column employer_type text check (employer_type in ('chakal', 'municipality', 'other'));
