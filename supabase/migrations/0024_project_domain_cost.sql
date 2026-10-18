-- project_domains.cost: a cost per project domain.
--
-- Why: in the project's domains tab the admin wants a cost column next to each
-- domain / sub-domain (the tab also now labels the parent as "תחום" and the
-- row itself as "תת תחום" — a UI-only rename, the columns stay
-- parent_domain_id/name and name).
--
-- Plain numeric, nullable: a domain without a cost shows empty, not ₪0 as a
-- claimed figure. Not tied to budget sources — it is a planning figure on the
-- project, like the other free fields in this tab.
--
-- Additive only.

alter table public.project_domains
  add column if not exists cost numeric;

comment on column public.project_domains.cost is
  'Cost of the domain / sub-domain in ₪ (planning figure, not linked to budget).';
