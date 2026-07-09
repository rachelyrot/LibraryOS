import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Raw Supabase client — used directly by AuthContext (needs getSession/onAuthStateChange
// and the ability to distinguish "no session" from "session but no profile row").
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// PascalCase entity name (as used everywhere in src/) -> snake_case Postgres table
// (see supabase/migrations/0001_init_schema.sql for the schema itself).
const TABLE_MAP = {
  ApprovedPosition: 'approved_positions',
  Attendance: 'attendances',
  BookQuoteRequest: 'book_quote_requests',
  Branch: 'branches',
  BudgetAllocation: 'budget_allocations',
  BudgetSource: 'budget_sources',
  Category: 'categories',
  Employee: 'employees',
  InventoryItem: 'inventory_items',
  Project: 'projects',
  ProjectContact: 'project_contacts',
  ProjectDocument: 'project_documents',
  ProjectDomain: 'project_domains',
  ProjectGoal: 'project_goals',
  ProjectMember: 'project_members',
  ProjectMilestone: 'project_milestones',
  ProjectTask: 'project_tasks',
  PurchaseOrder: 'purchase_orders',
  QuoteRequest: 'quote_requests',
  Schedule: 'schedules',
  Supplier: 'suppliers',
  SupplierBookList: 'supplier_book_lists',
  SupplierCredit: 'supplier_credits',
  Volunteer: 'volunteers',
};

function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}

// '-created_date' / 'name' sort-string convention -> .order(field, { ascending })
function applySort(query, sort) {
  if (!sort) return query;
  const descending = sort.startsWith('-');
  const field = descending ? sort.slice(1) : sort;
  return query.order(field, { ascending: !descending });
}

// Plain field-equality object -> chained .eq() calls (the only filter shape used in src/)
function applyEq(query, filters) {
  let q = query;
  for (const [key, value] of Object.entries(filters || {})) {
    q = q.eq(key, value);
  }
  return q;
}

function makeEntity(table) {
  return {
    list: (sort, limit = 1000) =>
      applySort(supabase.from(table).select('*'), sort).limit(limit).then(unwrap),
    filter: (query = {}, sort, limit = 1000) =>
      applySort(applyEq(supabase.from(table).select('*'), query), sort).limit(limit).then(unwrap),
    get: (id) =>
      supabase.from(table).select('*').eq('id', id).maybeSingle().then(unwrap),
    create: (data) =>
      supabase.from(table).insert(data).select().single().then(unwrap),
    update: (id, data) =>
      supabase.from(table).update(data).eq('id', id).select().single().then(unwrap),
    delete: (id) =>
      supabase.from(table).delete().eq('id', id).then(unwrap),
    bulkCreate: (rows) =>
      supabase.from(table).insert(rows).select().then(unwrap),
  };
}

const entities = Object.fromEntries(
  Object.entries(TABLE_MAP).map(([entityName, table]) => [entityName, makeEntity(table)])
);

// Convenience wrapper for the ~50 call sites that just want "the current user or
// reject" (they already do `.then(setUser).catch(() => {})`). AuthContext.jsx does NOT
// use this — it needs to distinguish "no session" from "session but no profile row",
// so it talks to `supabase` directly instead.
async function me() {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw userError || new Error('Not authenticated');

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile) throw new Error('User not registered');

  return { id: user.id, email: user.email, full_name: profile.full_name, role: profile.role };
}

async function logout() {
  await supabase.auth.signOut();
}

export const base44 = {
  entities,
  auth: {
    me,
    logout,
  },
  integrations: {
    Core: {
      // Supabase Storage — single public bucket (see supabase/migrations/0002_storage.sql).
      // Path is uuid-prefixed to avoid collisions without needing a lookup; call sites
      // only pass `{ file }` (no entity context), so there's no per-entity subfolder.
      UploadFile: async ({ file }) => {
        const path = `${crypto.randomUUID()}-${file.name}`;
        const { error } = await supabase.storage.from('library-files').upload(path, file);
        if (error) throw error;
        const { data } = supabase.storage.from('library-files').getPublicUrl(path);
        return { file_url: data.publicUrl };
      },
      // The Base44 AI-based Excel extraction has no Supabase equivalent; the inventory
      // importer is being replaced with a deterministic column-mapped parser in a later step.
      ExtractDataFromUploadedFile: async () => {
        throw new Error('AI-based file extraction has been removed; a deterministic Excel importer is coming in a later migration step.');
      },
    },
  },
};
