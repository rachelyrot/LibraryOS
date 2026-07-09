-- LibraryOS — Base44 to Supabase migration: initial schema
-- Implements §1 (entity tables) and §2 (profiles/auth/RLS) of
-- .claude/plans/replicated-moseying-reef.md
--
-- Table name mapping (Base44 PascalCase entity -> Postgres snake_case table):
--   ApprovedPosition -> approved_positions        Attendance -> attendances
--   BookQuoteRequest -> book_quote_requests        Branch -> branches
--   BudgetAllocation -> budget_allocations         BudgetSource -> budget_sources
--   Category -> categories                         Employee -> employees
--   InventoryItem -> inventory_items                Project -> projects
--   ProjectContact -> project_contacts              ProjectDocument -> project_documents
--   ProjectDomain -> project_domains                ProjectGoal -> project_goals
--   ProjectMember -> project_members                ProjectMilestone -> project_milestones
--   ProjectTask -> project_tasks                    PurchaseOrder -> purchase_orders
--   QuoteRequest -> quote_requests                  Schedule -> schedules
--   Supplier -> suppliers                           SupplierBookList -> supplier_book_lists
--   SupplierCredit -> supplier_credits               Volunteer -> volunteers
--   User -> profiles (auth-linked, see bottom of this file)
--
-- Conventions (see plan §1):
--   * id uuid primary key default gen_random_uuid()
--   * created_date / updated_date (NOT created_at/updated_at) to match existing
--     '-created_date' sort-string convention used by ~40 call sites in src/
--   * nested array-of-object fields (items/transactions/books/movements) -> jsonb
--   * FK columns are nullable with ON DELETE SET NULL (master data is archived via
--     status, not hard-deleted)
--   * "polymorphic" person_id columns (Schedule, ProjectMember — references either
--     an employee or a volunteer depending on person_type) are left as plain uuid
--     with no FK constraint, since Postgres can't express a conditional FK cleanly.

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────────────────────────
-- Helper functions
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.set_updated_date()
returns trigger
language plpgsql
as $$
begin
  new.updated_date = now();
  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Entity tables (no FK constraints yet — added after all tables exist, §"FK constraints")
-- ─────────────────────────────────────────────────────────────────────────────

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  name text not null,
  type text not null,
  contact_name text,
  phone text,
  email text,
  address text,
  status text not null default 'active' check (status in ('active','inactive')),
  payment_terms text,
  avg_delivery_time text,
  is_fixed boolean not null default false,
  has_credit boolean not null default false,
  credit_amount numeric not null default 0,
  notes text
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  name text not null,
  category_type text not null check (category_type in ('main','sub')),
  parent_id uuid,
  parent_name text,
  sort_order numeric not null default 0,
  status text not null default 'active' check (status in ('active','inactive'))
);

create table public.budget_sources (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  name text not null,
  funding_source_type text check (funding_source_type in ('municipal','culture_ministry','mifal_hapais','kol_kore','supplier_credit','other')),
  color text,
  total_amount numeric,
  reserved_amount numeric not null default 0,
  spent_amount numeric not null default 0,
  available_amount numeric,
  year text,
  start_date date,
  end_date date,
  notes text,
  status text not null default 'active' check (status in ('active','frozen','closed','pending'))
);

create table public.budget_allocations (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  name text not null,
  budget_source_id uuid,
  color text,
  allocated_amount numeric not null,
  reserved_amount numeric not null default 0,
  spent_amount numeric not null default 0,
  remaining_amount numeric,
  notes text,
  transactions jsonb not null default '[]'::jsonb
);

create table public.supplier_credits (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  supplier_id uuid not null,
  supplier_name text,
  credit_type text check (credit_type in ('supplier_credit','refund','other')),
  total_amount numeric not null,
  reserved_amount numeric not null default 0,
  used_amount numeric not null default 0,
  remaining_amount numeric,
  reason text,
  start_date date,
  valid_until date,
  notes text,
  status text not null default 'active' check (status in ('active','exhausted','expired','cancelled')),
  transactions jsonb not null default '[]'::jsonb
);

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  order_number text,
  title text,
  category text,
  subcategory text,
  supplier_id uuid,
  supplier_name text,
  supplier_contact text,
  order_type text,
  status text not null default 'draft' check (status in ('draft','pending_approval','approved','ordered','received_full','received_partial','cancelled','rejected')),
  created_by text,
  requested_by text,
  submitted_by text,
  submitted_date date,
  approved_by text,
  approved_date date,
  rejected_by text,
  rejected_date date,
  rejection_reason text,
  cancelled_by text,
  cancelled_date date,
  total_amount numeric,
  funding_source_type text check (funding_source_type in ('municipal','culture_ministry','mifal_hapais','kol_kore','supplier_credit','other')),
  budget_source_id uuid,
  budget_source_name text,
  budget_category_id uuid,
  budget_category_name text,
  credit_id uuid,
  budget_updated boolean not null default false,
  project_id uuid,
  project_name text,
  notes text,
  items jsonb not null default '[]'::jsonb,
  received_date date,
  receipt_confirmed_by text,
  source_quote_id uuid,
  source_book_list_id uuid,
  source_book_quote_request_id uuid,
  inventory_updated boolean not null default false,
  file_url text
);

create table public.quote_requests (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  quote_number text,
  title text not null,
  request_title text,
  supplier_id uuid,
  supplier_name text,
  category text,
  subcategory text,
  open_date date,
  validity_date date,
  funding_source text,
  funding_source_type text check (funding_source_type in ('municipal','culture_ministry','mifal_hapais','kol_kore','supplier_credit','other')),
  budget_source_id uuid,
  budget_category_id uuid,
  credit_id uuid,
  status text not null default 'draft' check (status in ('draft','sent_to_supplier','received','in_review','pending_approval','approved','rejected','expired','converted_to_order')),
  total_amount numeric,
  notes text,
  file_url text,
  order_created boolean not null default false,
  linked_order_id uuid,
  selected boolean not null default false,
  items jsonb not null default '[]'::jsonb
);

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  name text not null,
  category text not null,
  subcategory text,
  current_quantity numeric,
  minimum_quantity numeric,
  unit text,
  supplier_id uuid,
  supplier_name text,
  last_purchase_order_id uuid,
  last_received_date date,
  last_supplier_id uuid,
  last_unit_price numeric,
  notes text,
  last_updated_by text,
  isbn text,
  author text,
  copies_in_agron numeric,
  movements jsonb not null default '[]'::jsonb
);

create table public.supplier_book_lists (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  title text not null,
  supplier_id uuid,
  supplier_name text,
  received_date date,
  category text,
  status text not null default 'received' check (status in ('received','in_review','books_selected','transferred_to_quote','closed')),
  linked_order_id uuid,
  linked_quote_request_id uuid,
  file_url text,
  notes text,
  books jsonb not null default '[]'::jsonb
);

create table public.book_quote_requests (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  request_number text,
  title text not null,
  source_book_list_id uuid,
  source_book_list_title text,
  status text not null default 'draft' check (status in ('draft','sent_to_suppliers','awaiting_quotes','partial_quotes','all_quotes_received','in_comparison','suppliers_selected','transferred_to_orders','closed')),
  supplier_ids jsonb not null default '[]'::jsonb,
  supplier_names jsonb not null default '[]'::jsonb,
  email_subject text,
  email_body text,
  excel_file_url text,
  sent_date date,
  created_by text,
  notes text,
  books jsonb not null default '[]'::jsonb,
  linked_order_ids jsonb not null default '[]'::jsonb
);

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  name text not null,
  address text,
  phone text,
  email text,
  manager_name text,
  notes text,
  status text not null default 'active' check (status in ('active','inactive'))
);

create table public.approved_positions (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  branch_id uuid not null,
  branch_name text,
  position_name text not null,
  scope_percentage numeric,
  weekly_hours_approved numeric,
  approved_count numeric not null default 1,
  approval_date date,
  approval_source text,
  status text not null default 'active' check (status in ('active','inactive'))
);

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  first_name text not null,
  last_name text not null,
  id_number text,
  phone text,
  email text,
  address text,
  start_date date,
  position text,
  primary_branch_id uuid,
  primary_branch_name text,
  additional_branch_ids jsonb not null default '[]'::jsonb,
  additional_branch_names jsonb not null default '[]'::jsonb,
  employment_type text check (employment_type in ('permanent','temporary','substitute','volunteer','student','other')),
  scope_percentage numeric,
  weekly_hours numeric,
  status text not null default 'active' check (status in ('active','on_leave','ended','inactive')),
  notes text
);

create table public.volunteers (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  first_name text not null,
  last_name text not null,
  phone text,
  email text,
  preferred_branch_id uuid,
  preferred_branch_name text,
  preferred_days text,
  preferred_hours text,
  activity_area text check (activity_area in ('book_arrangement','event_help','reading_to_children','technical_help','other')),
  status text not null default 'active' check (status in ('active','waiting','inactive')),
  notes text
);

create table public.schedules (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  date date not null,
  day_of_week text,
  branch_id uuid not null,
  branch_name text,
  person_id uuid not null, -- polymorphic: employees or volunteers depending on person_type — no FK
  person_name text,
  person_type text not null default 'employee' check (person_type in ('employee','volunteer')),
  start_time text,
  end_time text,
  role_in_shift text,
  shift_type text not null default 'full_day' check (shift_type in ('morning','afternoon','evening','full_day','replacement','reinforcement','volunteer','special_event')),
  notes text,
  status text not null default 'planned' check (status in ('planned','approved','completed','cancelled'))
);

create table public.attendances (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  date date not null,
  employee_id uuid not null,
  employee_name text,
  branch_id uuid,
  branch_name text,
  planned_start text,
  planned_end text,
  actual_start text,
  actual_end text,
  status text not null default 'present' check (status in ('present','late','absent','early_leave','vacation')),
  notes text
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  name text not null,
  description text,
  project_type text check (project_type in ('establishment','renovation','large_purchase','annual_plan','operational','it','hr','other')),
  branch_id uuid,
  branch_name text,
  manager_name text,
  start_date date,
  target_end_date date,
  status text not null default 'draft' check (status in ('draft','planning','active','on_hold','completed','cancelled')),
  priority text not null default 'medium' check (priority in ('high','medium','low')),
  progress_percentage numeric not null default 0,
  budget_planned numeric not null default 0,
  budget_approved numeric not null default 0,
  budget_used numeric not null default 0,
  budget_is_approved boolean not null default false,
  budget_approval_date date,
  budget_approver text,
  budget_approval_file_url text,
  budget_source_id uuid,
  budget_source_name text,
  notes text
);

create table public.project_contacts (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  project_id uuid not null,
  project_name text,
  task_id uuid,
  contact_name text not null,
  contact_role text,
  contact_phone text,
  contact_email text,
  contact_type text not null default 'other' check (contact_type in ('responsible','partner','executor','other')),
  notes text
);

create table public.project_documents (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  project_id uuid not null,
  project_name text,
  name text not null,
  file_url text not null,
  document_type text not null default 'other' check (document_type in ('approval','quote','plan','contract','image','other')),
  uploaded_by text,
  notes text
);

create table public.project_domains (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  project_id uuid not null,
  project_name text,
  name text not null,
  parent_domain_id uuid,
  parent_domain_name text,
  status text not null default 'active' check (status in ('active','inactive')),
  sort_order numeric not null default 0,
  notes text
);

create table public.project_goals (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  project_id uuid not null,
  project_name text,
  name text not null,
  description text,
  success_metric text,
  target_value numeric,
  current_value numeric not null default 0,
  unit text,
  progress_percentage numeric not null default 0,
  target_date date,
  status text not null default 'not_started' check (status in ('not_started','in_progress','achieved','missed'))
);

create table public.project_members (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  project_id uuid not null,
  project_name text,
  person_type text not null default 'employee' check (person_type in ('employee','volunteer')),
  person_id uuid, -- polymorphic: employees or volunteers depending on person_type — no FK
  person_name text not null,
  role_in_project text,
  branch_id uuid,
  branch_name text,
  planned_hours numeric not null default 0,
  actual_hours numeric not null default 0,
  notes text
);

create table public.project_milestones (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  project_id uuid not null,
  project_name text,
  name text not null,
  description text,
  related_domain text,
  target_date date,
  status text not null default 'not_started' check (status in ('not_started','in_progress','completed','stuck')),
  progress_percentage numeric not null default 0,
  responsible text,
  related_task_ids jsonb not null default '[]'::jsonb,
  is_completed boolean not null default false,
  completed_date date,
  notes text
);

create table public.project_tasks (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  project_id uuid not null,
  project_name text,
  phase text,
  domain text,
  sub_domain text,
  task_description text not null,
  assignee text,
  partners text,
  executing_parties text,
  contact_name text,
  contact_role text,
  contact_phone text,
  contact_email text,
  start_date date,
  due_date date,
  estimated_duration text,
  priority text not null default 'medium' check (priority in ('high','medium','low')),
  status text not null default 'not_started' check (status in ('not_started','in_progress','waiting_approval','waiting_external','completed','cancelled','stuck')),
  progress_percentage numeric not null default 0,
  notes text,
  file_urls jsonb not null default '[]'::jsonb,
  depends_on_task_id uuid,
  depends_on_task_name text
);

-- ─────────────────────────────────────────────────────────────────────────────
-- updated_date triggers (all 24 entity tables above)
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  t text;
begin
  foreach t in array array[
    'suppliers','categories','budget_sources','budget_allocations','supplier_credits',
    'purchase_orders','quote_requests','inventory_items','supplier_book_lists','book_quote_requests',
    'branches','approved_positions','employees','volunteers','schedules','attendances',
    'projects','project_contacts','project_documents','project_domains','project_goals',
    'project_members','project_milestones','project_tasks'
  ]
  loop
    execute format('create trigger set_updated_date before update on public.%I for each row execute function public.set_updated_date();', t);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- FK constraints (added after all tables exist; nullable, ON DELETE SET NULL —
-- master data is archived via status, not hard-deleted; polymorphic person_id
-- columns on schedules/project_members are intentionally left unconstrained)
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.categories
  add constraint categories_parent_id_fkey foreign key (parent_id) references public.categories(id) on delete set null;

alter table public.budget_allocations
  add constraint budget_allocations_budget_source_id_fkey foreign key (budget_source_id) references public.budget_sources(id) on delete set null;

alter table public.supplier_credits
  add constraint supplier_credits_supplier_id_fkey foreign key (supplier_id) references public.suppliers(id) on delete set null;

alter table public.purchase_orders
  add constraint purchase_orders_supplier_id_fkey foreign key (supplier_id) references public.suppliers(id) on delete set null,
  add constraint purchase_orders_budget_source_id_fkey foreign key (budget_source_id) references public.budget_sources(id) on delete set null,
  add constraint purchase_orders_budget_category_id_fkey foreign key (budget_category_id) references public.budget_allocations(id) on delete set null,
  add constraint purchase_orders_credit_id_fkey foreign key (credit_id) references public.supplier_credits(id) on delete set null,
  add constraint purchase_orders_project_id_fkey foreign key (project_id) references public.projects(id) on delete set null,
  add constraint purchase_orders_source_quote_id_fkey foreign key (source_quote_id) references public.quote_requests(id) on delete set null,
  add constraint purchase_orders_source_book_list_id_fkey foreign key (source_book_list_id) references public.supplier_book_lists(id) on delete set null,
  add constraint purchase_orders_source_book_quote_request_id_fkey foreign key (source_book_quote_request_id) references public.book_quote_requests(id) on delete set null;

alter table public.quote_requests
  add constraint quote_requests_supplier_id_fkey foreign key (supplier_id) references public.suppliers(id) on delete set null,
  add constraint quote_requests_budget_source_id_fkey foreign key (budget_source_id) references public.budget_sources(id) on delete set null,
  add constraint quote_requests_budget_category_id_fkey foreign key (budget_category_id) references public.budget_allocations(id) on delete set null,
  add constraint quote_requests_credit_id_fkey foreign key (credit_id) references public.supplier_credits(id) on delete set null,
  add constraint quote_requests_linked_order_id_fkey foreign key (linked_order_id) references public.purchase_orders(id) on delete set null;

alter table public.inventory_items
  add constraint inventory_items_supplier_id_fkey foreign key (supplier_id) references public.suppliers(id) on delete set null,
  add constraint inventory_items_last_purchase_order_id_fkey foreign key (last_purchase_order_id) references public.purchase_orders(id) on delete set null,
  add constraint inventory_items_last_supplier_id_fkey foreign key (last_supplier_id) references public.suppliers(id) on delete set null;

alter table public.supplier_book_lists
  add constraint supplier_book_lists_supplier_id_fkey foreign key (supplier_id) references public.suppliers(id) on delete set null,
  add constraint supplier_book_lists_linked_order_id_fkey foreign key (linked_order_id) references public.purchase_orders(id) on delete set null,
  add constraint supplier_book_lists_linked_quote_request_id_fkey foreign key (linked_quote_request_id) references public.book_quote_requests(id) on delete set null;

alter table public.book_quote_requests
  add constraint book_quote_requests_source_book_list_id_fkey foreign key (source_book_list_id) references public.supplier_book_lists(id) on delete set null;

alter table public.approved_positions
  add constraint approved_positions_branch_id_fkey foreign key (branch_id) references public.branches(id) on delete set null;

alter table public.employees
  add constraint employees_primary_branch_id_fkey foreign key (primary_branch_id) references public.branches(id) on delete set null;

alter table public.volunteers
  add constraint volunteers_preferred_branch_id_fkey foreign key (preferred_branch_id) references public.branches(id) on delete set null;

alter table public.schedules
  add constraint schedules_branch_id_fkey foreign key (branch_id) references public.branches(id) on delete set null;

alter table public.attendances
  add constraint attendances_employee_id_fkey foreign key (employee_id) references public.employees(id) on delete set null,
  add constraint attendances_branch_id_fkey foreign key (branch_id) references public.branches(id) on delete set null;

alter table public.projects
  add constraint projects_branch_id_fkey foreign key (branch_id) references public.branches(id) on delete set null,
  add constraint projects_budget_source_id_fkey foreign key (budget_source_id) references public.budget_sources(id) on delete set null;

alter table public.project_contacts
  add constraint project_contacts_project_id_fkey foreign key (project_id) references public.projects(id) on delete cascade,
  add constraint project_contacts_task_id_fkey foreign key (task_id) references public.project_tasks(id) on delete set null;

alter table public.project_documents
  add constraint project_documents_project_id_fkey foreign key (project_id) references public.projects(id) on delete cascade;

alter table public.project_domains
  add constraint project_domains_project_id_fkey foreign key (project_id) references public.projects(id) on delete cascade,
  add constraint project_domains_parent_domain_id_fkey foreign key (parent_domain_id) references public.project_domains(id) on delete set null;

alter table public.project_goals
  add constraint project_goals_project_id_fkey foreign key (project_id) references public.projects(id) on delete cascade;

alter table public.project_members
  add constraint project_members_project_id_fkey foreign key (project_id) references public.projects(id) on delete cascade,
  add constraint project_members_branch_id_fkey foreign key (branch_id) references public.branches(id) on delete set null;

alter table public.project_milestones
  add constraint project_milestones_project_id_fkey foreign key (project_id) references public.projects(id) on delete cascade;

alter table public.project_tasks
  add constraint project_tasks_project_id_fkey foreign key (project_id) references public.projects(id) on delete cascade,
  add constraint project_tasks_depends_on_task_id_fkey foreign key (depends_on_task_id) references public.project_tasks(id) on delete set null;

-- ─────────────────────────────────────────────────────────────────────────────
-- §2: profiles (User) + auth wiring
-- ─────────────────────────────────────────────────────────────────────────────

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'user' check (role in ('admin','remote_manager','local_manager','user')),
  created_date timestamptz not null default now()
);

-- Auto-create a profile row (role='user' by default) whenever a new auth user signs up.
-- security definer so it can insert into public.profiles regardless of RLS.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    'user'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- is_admin(): used by RLS policies below and by the role-protection trigger.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- Prevent a non-admin from escalating their own role via a self-service profile update.
-- Role changes must go through Supabase Studio (service role, bypasses RLS) per plan §2.
create or replace function public.protect_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role and not public.is_admin() then
    new.role = old.role;
  end if;
  return new;
end;
$$;

create trigger protect_profile_role
  before update on public.profiles
  for each row execute function public.protect_profile_role();

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────────────────────

-- Baseline (21 tables): any authenticated user may select/insert/update/delete.
-- This mirrors today's reality (everything enforced client-side only in permissions.js).
do $$
declare
  t text;
begin
  foreach t in array array[
    'suppliers','categories','purchase_orders','quote_requests','inventory_items',
    'supplier_book_lists','book_quote_requests','branches','approved_positions','employees',
    'volunteers','schedules','attendances','projects','project_contacts',
    'project_documents','project_domains','project_goals','project_members','project_milestones',
    'project_tasks'
  ]
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('create policy "select_authenticated" on public.%I for select to authenticated using (true);', t);
    execute format('create policy "insert_authenticated" on public.%I for insert to authenticated with check (true);', t);
    execute format('create policy "update_authenticated" on public.%I for update to authenticated using (true) with check (true);', t);
    execute format('create policy "delete_authenticated" on public.%I for delete to authenticated using (true);', t);
  end loop;
end $$;

-- Sensitive (3 tables): select open to authenticated, writes admin-only (plan §2/§10).
do $$
declare
  t text;
begin
  foreach t in array array['budget_sources','budget_allocations','supplier_credits']
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('create policy "select_authenticated" on public.%I for select to authenticated using (true);', t);
    execute format('create policy "insert_admin_only" on public.%I for insert to authenticated with check (public.is_admin());', t);
    execute format('create policy "update_admin_only" on public.%I for update to authenticated using (public.is_admin()) with check (public.is_admin());', t);
    execute format('create policy "delete_admin_only" on public.%I for delete to authenticated using (public.is_admin());', t);
  end loop;
end $$;

-- profiles: everyone authenticated can read the directory (names already appear
-- throughout the app in audit fields); self-service update of one's own row only
-- (role escalation blocked by the protect_profile_role trigger above); no direct
-- insert policy for authenticated (only the security-definer handle_new_user
-- trigger inserts rows).
alter table public.profiles enable row level security;
create policy "select_authenticated" on public.profiles for select to authenticated using (true);
create policy "update_own_row" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
