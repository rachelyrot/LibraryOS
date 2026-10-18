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
  WorkPlan: 'work_plans',
  WorkPlanItem: 'work_plan_items',
  ServiceContract: 'service_contracts',
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

// Forms across the app default unset optional fields (uuid FKs like branch_id,
// date inputs like start_date) to '' rather than omitting them or using null.
// Postgres rejects '' for uuid/date/numeric columns (though it also happens to
// tolerate it for plain text columns) — Base44's backend was lenient about this,
// Postgres via PostgREST is not. Converting '' -> null at the boundary (top-level
// fields only, not inside jsonb array blobs like items/transactions/books) avoids
// having to special-case every call site across ~40 files.
function sanitizePayload(data) {
  const sanitized = {};
  for (const [key, value] of Object.entries(data)) {
    sanitized[key] = value === '' ? null : value;
  }
  return sanitized;
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
      supabase.from(table).insert(sanitizePayload(data)).select().single().then(unwrap),
    update: (id, data) =>
      supabase.from(table).update(sanitizePayload(data)).eq('id', id).select().single().then(unwrap),
    delete: (id) =>
      supabase.from(table).delete().eq('id', id).then(unwrap),
    bulkCreate: (rows) =>
      supabase.from(table).insert(rows.map(sanitizePayload)).select().then(unwrap),
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

  // branch_id/branch_name (migration 0010) ride along because the staff screens
  // scope a local_manager to her own branch — see visibleBranchIds().
  //
  // `undefined` is preserved when the column is absent (migration not applied)
  // and is meaningfully different there from `null` (column present, nobody
  // assigned a branch) — so don't collapse it with `|| null`.
  return {
    id: user.id,
    email: user.email,
    full_name: profile.full_name,
    role: profile.role,
    branch_id: 'branch_id' in profile ? (profile.branch_id ?? null) : undefined,
    branch_name: profile.branch_name || '',
  };
}

async function logout() {
  await supabase.auth.signOut();
}

// A file name usable as a Storage key: unchanged when it is plain ASCII,
// otherwise "b64-<base64url of the name without extension>.<ext>".
const SAFE_KEY = /^[\w!\-.*'() &$@=;:+,]+$/;
function storageSafeName(name) {
  if (SAFE_KEY.test(name)) return name;
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot + 1).replace(/[^\w]/g, '') : '';
  const bytes = new TextEncoder().encode(base);
  const b64 = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `b64-${b64}${ext ? `.${ext}` : ''}`;
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
      // Storage keys must be ASCII (Supabase rejects e.g. Hebrew with "Invalid key"),
      // so a name with other characters is stored base64url-encoded as
      // "<uuid>-b64-<encoded name>.<ext>" — the extension stays readable for the
      // browser, and fileNameFromUrl (projects/grid/popoverCellEditors) decodes it.
      UploadFile: async ({ file }) => {
        const path = `${crypto.randomUUID()}-${storageSafeName(file.name)}`;
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
