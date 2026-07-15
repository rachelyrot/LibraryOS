-- LibraryOS — per-source budget breakdown for projects (§11 follow-up request)
--
-- projects.budget_source_names was a plain array of free-text strings (see
-- 0005_project_budget_source_names.sql). It now needs a planned/approved/used
-- amount per source, with the project-level budget_planned/budget_approved/
-- budget_used totals becoming a sum of the per-source amounts (computed and
-- written together client-side on every source edit — see gridSave.js
-- computeExtra usage in src/pages/Projects.jsx — not enforced in SQL, matching
-- this table's existing "any authenticated user" trust posture).
--
-- Same column name is kept (only the JSON element shape changes, from a plain
-- string to an object) to avoid touching every call site's field name.

update projects
set budget_source_names = (
  select coalesce(
    jsonb_agg(
      case jsonb_typeof(elem)
        when 'string' then jsonb_build_object('name', elem #>> '{}', 'planned', 0, 'approved', 0, 'used', 0)
        else elem
      end
    ),
    '[]'::jsonb
  )
  from jsonb_array_elements(budget_source_names) as elem
)
where jsonb_typeof(budget_source_names) = 'array';
