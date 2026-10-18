-- project_documents.domain / sub_domain: documents filed in domain folders.
--
-- Why: the project's files tab is now organised as folders — one per domain
-- and, inside it, one per sub-domain (from the domains tab). A task's files show
-- in its domain / sub-domain folder by themselves; a document uploaded straight
-- to the tab needs to know which folder it belongs to.
--
-- Stored as names, like project_tasks.domain / sub_domain, so a document and a
-- task in the same folder match the same way. Both nullable: a document with
-- no domain sits in "ללא תחום".
--
-- Additive only.

alter table public.project_documents
  add column if not exists domain text,
  add column if not exists sub_domain text;

comment on column public.project_documents.domain is
  'Domain folder (project_domains.name of a top-level domain), like project_tasks.domain.';
comment on column public.project_documents.sub_domain is
  'Sub-domain folder inside the domain, like project_tasks.sub_domain.';
