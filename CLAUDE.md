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
npm run preview          # preview production build
npm run lint            # eslint (--quiet)
npm run lint:fix          # eslint --fix
npm run typecheck         # tsc -p ./jsconfig.json (JS type-checking via checkJs, not a TS project)
```

There is no test runner configured in this repo — do not assume Jest/Vitest exist.

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

Entity **schemas** live in [supabase/migrations/*.sql](supabase/migrations) (Postgres DDL — tables, RLS policies, RPC functions), applied via the Supabase SQL Editor or `supabase db push`. `PascalCase` entity name → `snake_case` table name mapping is a static lookup (`TABLE_MAP`) at the top of `base44Client.js`. When adding/changing a field, add a new numbered migration file — don't hand-edit an already-applied one.

Key entities and how they relate: `PurchaseOrder`, `QuoteRequest`, `SupplierBookList` (+ `BookQuoteRequest`), `InventoryItem`, `Supplier`, `SupplierCredit`, `BudgetSource` → `BudgetAllocation`, `Category`, plus HR/project entities (`Employee`, `Attendance`, `Schedule`, `Branch`, `Volunteer`, `Project` and its sub-entities). See §3 of the SystemSpecification for the full field-level breakdown of each (field-level Hebrew descriptions are preserved in `docs/legacy-base44-schema/entities/*.jsonc`).

### Auth
[src/lib/AuthContext.jsx](src/lib/AuthContext.jsx) drives app-level auth state via `supabase.auth.getSession()`/`onAuthStateChange`, then looks up a matching row in the `profiles` table (created automatically on signup by a `handle_new_user` Postgres trigger). `authError.type` states gate rendering in [src/App.jsx](src/App.jsx): `auth_required` renders [src/pages/Login.jsx](src/pages/Login.jsx) (local email/password sign-in/sign-up — there is no hosted external login page), `user_not_registered` renders `UserNotRegisteredError` (authenticated with Supabase, but no `profiles` row — shouldn't normally happen given the trigger). The `user` object exposed by the context is `{ id, email, full_name, role }`.

**Role assignment has no in-app UI** — an admin changes a user's `role` directly in the `profiles` table via Supabase Studio. This is an intentional, accepted limitation for a small team (see the migration plan's §2/§10), not an oversight.

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

### Path aliases and linting scope
`@/*` maps to `src/*` ([jsconfig.json](jsconfig.json), [components.json](components.json)). Note that `jsconfig.json` and [eslint.config.js](eslint.config.js) only cover `src/components/**`, `src/pages/**`, and `src/Layout.jsx` — `src/lib`, `src/api`, and `src/components/ui` (shadcn primitives) are intentionally excluded from both typecheck and lint.

### UI kit
Uses shadcn/ui ("new-york" style, neutral base) — generated primitives live in `src/components/ui/` and should be treated as vendored (don't hand-edit conventions there; regenerate via shadcn CLI per [components.json](components.json) instead). Icons via `lucide-react`.
