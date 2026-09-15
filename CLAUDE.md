# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**LibraryOS** — a procurement/inventory/budget management system for an Israeli municipal library (בני ברק / Bnei Brak). The UI (this repo) is a React SPA hosted on **Cloudflare** (Workers with static assets); the backend is **Supabase** (Postgres + Auth + Storage). There is no custom backend server in this repo beyond Postgres functions (`supabase/migrations/*.sql`).

This project was migrated off the Base44 platform (base44.com), which originally hosted the backend/auth/storage. `docs/legacy-base44-schema/` preserves the original Base44 entity JSON Schemas (with Hebrew field descriptions) as frozen historical reference — it is **not** used by the running app; the live schema is `supabase/migrations/*.sql`. The full migration plan/rationale/decision log lives in `.claude/plans/replicated-moseying-reef.md`.

The full business spec (roles, workflows, entity relationships, what's implemented vs. missing) lives in [src/docs/SystemSpecification.md](src/docs/SystemSpecification.md) (Hebrew). Read it before making non-trivial changes to workflow/permission logic — it is the source of truth for intended behavior, not just documentation.

The UI is Hebrew/RTL throughout (`dir="rtl"` in [Layout.jsx](src/components/Layout.jsx)); keep new UI text in Hebrew consistent with the rest of the app.

## Commands

```bash
npm install          # install deps
npm run dev           # start Vite dev server
npm run build          # production build
npm run preview          # build, then serve via `wrangler dev` (the real Worker, not `vite preview`)
npm run deploy           # build, then `wrangler deploy` to Cloudflare
npm run lint            # eslint (--quiet)
npm run lint:fix          # eslint --fix
npm run typecheck         # tsc -p ./jsconfig.json (JS type-checking via checkJs, not a TS project)
```

There is no test runner configured in this repo — do not assume Jest/Vitest exist.

**`lint` and `typecheck` are both red on a clean checkout** — as of the last check, `npm run lint` exits 1 with ~55 `unused-imports` errors and `npm run typecheck` exits 2 with ~1350 `error TS` lines. The typecheck noise is structural: `jsconfig.json` type-checks `src/pages/**/*.jsx` but *excludes* `src/components/ui`, so every shadcn primitive resolves as an untyped component and each JSX prop passed to one is reported as an error. Neither command is a usable pass/fail gate — diff the output against the baseline instead of assuming your change caused what you see, and don't "fix" the whole backlog as a side effect of an unrelated change.

Local dev requires a `.env.local` with:
```
VITE_SUPABASE_URL=<project URL, e.g. https://xxxxx.supabase.co>
VITE_SUPABASE_ANON_KEY=<anon/publishable key>
```
The anon/publishable key is safe to expose client-side by design — **Row Level Security (RLS) policies, not key secrecy, are what protect the data** (see `supabase/migrations/0001_init_schema.sql`).

## Architecture

### Data access — Supabase, via a Base44-shaped shim
All data reads/writes go through [src/api/base44Client.js](src/api/base44Client.js), which wraps `@supabase/supabase-js` behind the same object shape the app was originally written against (kept intentionally, so ~50 call sites across the app needed zero changes when the backend was swapped):
- `base44.entities.<EntityName>.list(sortField, limit)`, `.filter({...}, sortField, limit)`, `.get(id)`, `.create(data)`, `.update(id, data)`, `.delete(id)`, `.bulkCreate(rows)` — translated internally to Supabase's query builder (`sortField`/`limit`/equality-filter conventions only, no OR/range operators anywhere in the app)
- `base44.integrations.Core.UploadFile({ file })` — uploads to a public Supabase Storage bucket (`library-files`)
- `base44.auth.me()`, `base44.auth.logout()`
- The module also exports the raw `supabase` client directly, for code that needs finer-grained session/RPC access (`AuthContext.jsx`, `budgetUpdater.js`, `GoodsReceiptDialog.jsx`)

Two shim behaviors that bite if you don't know about them:
- **`list`/`filter` silently cap at 1000 rows** (`limit = 1000` default). Pass an explicit limit for anything that can grow past that.
- **`sanitizePayload` rewrites `''` → `null` on every `create`/`update`/`bulkCreate`**, top-level fields only (not inside jsonb blobs like `items`/`books`/`transactions`). Forms across the app default unset uuid/date/numeric fields to `''`, which Postgres rejects; this is the single boundary that fixes it. A new field that must be able to hold a real empty string will not survive this — use a sentinel or handle it at the call site.
- `base44.integrations.Core.ExtractDataFromUploadedFile` **throws by design** — Base44's AI-based Excel extraction has no Supabase equivalent. The deterministic replacement is [src/lib/excelImport.js](src/lib/excelImport.js) (fuzzy Hebrew column detection, shared by the book-list and inventory importers) plus [src/lib/bookQuoteExcel.js](src/lib/bookQuoteExcel.js). Don't reintroduce a call to the throwing stub.

Entity **schemas** live in [supabase/migrations/*.sql](supabase/migrations) (Postgres DDL — tables, RLS policies, RPC functions), applied via the Supabase SQL Editor or `supabase db push`. `PascalCase` entity name → `snake_case` table name mapping is a static lookup (`TABLE_MAP`) at the top of `base44Client.js` — a new entity needs an entry there as well as the migration.

Migration conventions, visible across `0004`–`0008`:
- **New numbered file, never edit an applied one.** The `new-migration` skill scaffolds one to this repo's conventions.
- **Additive only — superseded columns are left in place, not dropped** (e.g. `projects.budget_source_id/budget_source_name` in `0005`, `approved_positions.approval_source` in `0008`). Dropping is destructive and the payoff is nil; add the new column and stop reading the old one.
- **Every migration opens with a comment block explaining the *why*** — root cause, what was tried, why this shape. Match that; the headers are the main record of schema decisions.
- Multi-value fields use `jsonb` arrays rather than a `text` + `check` constraint (`employees.additional_branch_ids`, `approved_positions.category`).

Key entities and how they relate: `PurchaseOrder`, `QuoteRequest`, `SupplierBookList` (+ `BookQuoteRequest`), `InventoryItem`, `Supplier`, `SupplierCredit`, `BudgetSource` → `BudgetAllocation`, `Category`, plus HR/project entities (`Employee`, `ApprovedPosition`, `Attendance`, `Schedule`, `Branch`, `Volunteer`, and `Project` with its `ProjectTask`/`ProjectMilestone`/`ProjectGoal`/`ProjectMember`/`ProjectContact`/`ProjectDocument`/`ProjectDomain` sub-entities). See §3 of the SystemSpecification for the full field-level breakdown of each (field-level Hebrew descriptions are preserved in `docs/legacy-base44-schema/entities/*.jsonc`).

### Auth
[src/lib/AuthContext.jsx](src/lib/AuthContext.jsx) drives app-level auth state via `supabase.auth.getSession()`/`onAuthStateChange`, then looks up a matching row in the `profiles` table (created automatically on signup by a `handle_new_user` Postgres trigger). `authError.type` states gate rendering in [src/App.jsx](src/App.jsx): `auth_required` renders [src/pages/Login.jsx](src/pages/Login.jsx), `user_not_registered` renders `UserNotRegisteredError` (authenticated with Supabase, but no `profiles` row — shouldn't normally happen given the trigger). The `user` object exposed by the context is `{ id, email, full_name, role }`.

**Sign-in only — there is no self-service signup.** `Login.jsx` calls `signInWithPassword` and nothing else; the page tells the user to ask an admin for an account ("אין לך חשבון? פני למנהל/ת המערכת ליצירתו"). There is no hosted external login page either. Don't re-add a signup form — closing it was deliberate (commit `aa34d25`).

Note that removing the form is **not** what closes signup: the anon key ships in the public bundle, so `POST /auth/v1/signup` stays reachable regardless. The actual gate is the project-level **Authentication → Sign In / Providers → "Allow new users to sign up" = off** toggle in the Supabase Dashboard. `auth.admin.createUser` still works while it's off, because `service_role` bypasses the restriction.

**Accounts and roles are managed in-app at `/users`** ([src/pages/Users.jsx](src/pages/Users.jsx), admin-only via `canManageUsers`). Two ways to hand over a first password: an **email invite** (default) or a **manual initial password** the admin dictates. The manual path exists because email depends on custom SMTP being configured — Supabase's built-in mailer is capped at 2 messages/hour and refuses to deliver to addresses outside the project team, so it cannot invite staff at all. If mail breaks, the manual path still works. Studio remains the fallback for what the screen doesn't cover (deleting a user).

**Email-driven flows all land on `/reset-password`** ([src/pages/ResetPassword.jsx](src/pages/ResetPassword.jsx)) — both the invite link and "שכחתי סיסמה" from the login screen. Two things make it work and are easy to break:
- `App.jsx` routes to it **before every auth branch**. The visitor arrives already holding a session (supabase-js exchanges the hash tokens on load), so any auth check placed first would wave them into the app without them ever setting a password.
- The redirect URL must be present in Dashboard → Authentication → **URL Configuration**, otherwise Supabase silently substitutes the Site URL and the link lands on the dashboard instead of the form.

Password resets are requested with `supabase.auth.resetPasswordForEmail` straight from the client (both in `Login.jsx` and the per-row key button in `Users.jsx`) — no elevated privileges are involved, so they don't go through the Edge Function.

Role assignment relies on `0004_fix_profile_role_trigger.sql`: the `protect_profile_role` trigger only blocks role changes when `auth.uid()` is non-null, so both SQL-Editor updates and the `service_role` calls from the Edge Function (whose JWT carries no `sub` claim) can set roles. The function re-reads the row after updating and surfaces an error if the role didn't stick, rather than letting the trigger silently revert it.

### Server-side code — `supabase/functions/`
Two Deno Edge Functions are the only server-side code here besides the plpgsql in `migrations/`. Each exists because it needs a secret that must never reach the browser.

[supabase/functions/agron-search/index.ts](supabase/functions/agron-search/index.ts) proxies the library catalog (אגרון, Libnet) for "בדוק מול אגרון" in `BookListTab`. The Libnet ApiKey lives in the function secrets `AGRON_CLIENT_ID`/`AGRON_API_KEY`, and the endpoint has no CORS anyway. Libnet has no ISBN search, so matching is title + author with Hebrew normalization, done in the function; the client side is [src/lib/agron.js](src/lib/agron.js). Any signed-in user may call it.

[supabase/functions/admin-users/index.ts](supabase/functions/admin-users/index.ts) exists because creating auth users and assigning roles needs the `service_role` key. It authorizes the caller from their JWT (never from the request body), requires `role = 'admin'`, and exposes `list` / `invite` / `create` / `set_role`.

Deployment is **not** the SQL-Editor flow used for migrations. Either paste the file into Dashboard → Edge Functions → "Deploy a new function", or run `npx supabase functions deploy admin-users` (the npm CLI has failed to install its `win32-x64` binary on this machine, so the dashboard path is the reliable one here). `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` are injected by the Edge runtime; never add them to `.env.local`. Call it from the client with `supabase.functions.invoke(...)` (the `base44` shim has no concept of functions), and note that `invoke` surfaces a non-2xx as `error` with the body unparsed — read the JSON message via `error.context.json()`, as `Users.jsx` does.

### Permissions — two-tier by design
Business logic authorization is centralized in [src/lib/permissions.js](src/lib/permissions.js) as plain `can*(user, ...)` functions keyed off `user.role`. Four roles: `admin` (technical superuser), `remote_manager` (approves/rejects, full financial visibility), `local_manager` (creates orders, receives goods, manages inventory, no financial approval), `user` (drafts only, no sensitive financial data).

**Every sensitive action is meant to be protected in two places**: UI (hide/disable controls) *and* wherever the actual entity mutation happens (call the `can*` helper before calling `base44.entities.X.update/create`). When adding a new permission-gated action, add a helper to `permissions.js` rather than inlining role checks, and gate both the UI and the mutation call site. Some permission checks also depend on entity status (e.g. `canEditBookList` blocks edits once a book list reaches `transferred_to_order`/`closed`) — check status transitions, not just role.

### Budget/credit side-effects are atomic Postgres RPCs
Order status transitions must explicitly call into [src/lib/budgetUpdater.js](src/lib/budgetUpdater.js) (`handleBudgetOnStatusChange`, `recalcBudgetSource`, `validateBudgetSelection`) — these are thin JS wrappers around `supabase.rpc(...)` calls into `plpgsql` functions defined in [supabase/migrations/0003_budget_inventory_rpc.sql](supabase/migrations/0003_budget_inventory_rpc.sql) (`apply_order_budget_transition`, `recalc_budget_source`). The actual read-modify-write happens in one Postgres transaction (row-locked via `for update`), not sequential client-side awaits — don't reintroduce client-side sequential mutation of these tables. Rules baked into the RPC (see its header comments) that any code changing order status must preserve:
- `draft` → no budget effect
- `approved` → reserve amount against `BudgetAllocation` or `SupplierCredit` (`reserved_amount`), and set `budget_updated: true` on the order to prevent double-reservation (re-checked *inside* the transaction, not trusted from the client)
- `received_full`/`received_partial` → move amount from reserved to spent/used
- `cancelled` → release the reservation (and reset `budget_updated: false`)
- `BudgetSource` totals are always derived by summing its `BudgetAllocation` categories (`recalc_budget_source`), never edited directly

Similarly, **inventory only updates on goods receipt** ([src/components/GoodsReceiptDialog.jsx](src/components/GoodsReceiptDialog.jsx) → the `apply_goods_receipt` RPC), never on order creation or approval — guarded by an `inventory_updated` flag on the order, mirroring the `budget_updated` flag pattern. Follow the existing flag-guard-inside-a-single-RPC pattern for any new one-time side effect tied to a status transition; don't add a new multi-step client-side sequence for this class of problem.

### Two parallel procurement flows — don't cross them
- **Books**: `SupplierBookList` → (optionally) `BookQuoteRequest` → `PurchaseOrder` (`source_book_list_id`/`source_book_quote_request_id`). Handled under [src/pages/BookProcurement.jsx](src/pages/BookProcurement.jsx) and [src/components/bookLists/](src/components/bookLists/), [src/components/bookProcurement/](src/components/bookProcurement/), [src/components/bookQuoteRequests/](src/components/bookQuoteRequests/).
- **Equipment/services**: `QuoteRequest` → `PurchaseOrder` (`source_quote_id`). Handled under [src/pages/Quotes.jsx](src/pages/Quotes.jsx) / [src/components/quotes/](src/components/quotes/).

Books are never routed through `QuoteRequest`, and equipment/services never through `SupplierBookList` — this separation is intentional (see spec §5.1), not an oversight to "simplify".

Duplicate-prevention flags to respect: `order_created`/`linked_order_id` on quotes/book lists prevent creating a second `PurchaseOrder` from the same source.

### Routing / pages
Routes are defined directly in [src/App.jsx](src/App.jsx) (no file-based routing) under a single `<Layout>` shell; nav items are hardcoded in [src/components/Layout.jsx](src/components/Layout.jsx) — add both when introducing a new top-level page. Pages live flat in [src/pages/](src/pages/); page-specific sub-components are grouped by feature under [src/components/](src/components/) (e.g. `budget/`, `staff/`, `projects/`).

**Dead pages — don't edit or "fix" them.** [src/pages/Categories.jsx](src/pages/Categories.jsx) and [src/pages/CategoryView.jsx](src/pages/CategoryView.jsx) have no route and no importer. They are the only consumers of the legacy hardcoded constants in [src/lib/orderCategories.js](src/lib/orderCategories.js). Live category management is the `Category` entity, edited in [src/pages/Settings.jsx](src/pages/Settings.jsx) — so a change to categories that touches `orderCategories.js` is almost certainly in the wrong file.

Note also that `/credits` ("מקורות תקציב" in the nav) is the budget page: [src/pages/Credits.jsx](src/pages/Credits.jsx) owns both `BudgetSource`/`BudgetAllocation` and `SupplierCredit`. The name is historical.

### Client state — plain `useEffect`, not React Query
`@tanstack/react-query` is installed and `QueryClientProvider` wraps the app, but **only `src/lib/PageNotFound.jsx` actually uses `useQuery`**. Every page fetches with `useEffect` + `base44.entities.*` into local `useState`, and re-fetches manually after a mutation. Follow the surrounding pattern rather than introducing query keys/caching into one page in isolation.

The one shared cache is [src/hooks/useCategories.js](src/hooks/useCategories.js) — module-level `cachedMains`/`cachedSubs` plus a single in-flight `fetchPromise`, so the `Category` list is fetched once per page load no matter how many components ask. It exposes `{ mains, subs, loading, getSubcategories, getLabel }`. Anything needing category options should use this hook; note the cache never invalidates within a session, so edits made in Settings need a reload to show up elsewhere.

### Path aliases and linting scope
`@/*` maps to `src/*` ([jsconfig.json](jsconfig.json), [components.json](components.json)). `src/lib`, `src/api`, and `src/components/ui` (shadcn primitives) are intentionally excluded from both typecheck and lint. The remaining coverage is narrower than it looks: `jsconfig.json`'s `include` is `src/components/**/*.js` (`.js` only — so no `.jsx` component is type-checked), `src/pages/**/*.jsx`, and `src/Layout.jsx` (a path that no longer exists; Layout is at `src/components/Layout.jsx`). ESLint covers `src/components/**` and `src/pages/**` for both extensions.

### UI kit
Uses shadcn/ui ("new-york" style, neutral base) — generated primitives live in `src/components/ui/` and should be treated as vendored (don't hand-edit conventions there; regenerate via shadcn CLI per [components.json](components.json) instead). Icons via `lucide-react`. Toasts go through `sonner` (`import { toast } from 'sonner'`, `<Toaster />` mounted in `App.jsx`) — the vendored `ui/toast.jsx`/`ui/use-toast.jsx` shadcn toaster is present but not what the app uses.

### Hosting / deploy
Cloudflare Workers with static assets, configured in [wrangler.jsonc](wrangler.jsonc) (`not_found_handling: "single-page-application"`, which is what makes client-side routes resolve on refresh). The Worker is wired in at build time by `@cloudflare/vite-plugin` in [vite.config.js](vite.config.js) — there is no `src/worker.js` to edit. `npm run preview` runs the real Worker locally via `wrangler dev`; `npm run deploy` publishes. Note `vite.config.js` sets `logLevel: 'error'`, so build warnings are suppressed.

## Project-local Claude assets

- `.claude/plans/replicated-moseying-reef.md` — the Base44→Supabase migration plan and decision log, and the reference several code comments point back to (`"see plan section 6"`).
- `.claude/agents/permission-check.md` — read-only auditor for this repo's non-negotiable rules (two-layer permission gating, atomic budget/inventory RPCs, procurement-flow separation, migration discipline). Worth running after any change touching order status, budget/credit amounts, inventory, or a new sensitive action.
- `.claude/skills/` — `new-migration` (scaffold a numbered migration to this repo's conventions), `run-step` (execute + log one numbered step of the migration plan), `parallel-task` (isolated git worktree + branch for an independent task).
