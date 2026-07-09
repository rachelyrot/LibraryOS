# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**LibraryOS** — a procurement/inventory/budget management system for an Israeli municipal library (בני ברק / Bnei Brak), built on the **Base44** platform (base44.com). The UI (this repo) is a React SPA; Base44 hosts the backend (entity storage, auth, file storage, functions) and is accessed entirely through `@base44/sdk`. There is no local backend code in this repo.

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
VITE_BASE44_APP_ID=<app id>
VITE_BASE44_APP_BASE_URL=<backend url>
```

## Architecture

### Data access — no REST/fetch calls, no local API routes
All data reads/writes go through the Base44 SDK client instantiated once in [src/api/base44Client.js](src/api/base44Client.js):
- `base44.entities.<EntityName>.list(sortField, limit)`, `.filter({...}, sortField, limit)`, `.get(id)`, `.create(data)`, `.update(id, data)`
- `base44.integrations.Core.UploadFile({ file })` for file uploads
- `base44.auth.me()`, `base44.auth.logout()`, `base44.auth.redirectToLogin()`

Entity **schemas** (not code — just JSON Schema definitions Base44 reads) live in [base44/entities/*.jsonc](base44/entities). When adding/changing a field on an entity, update the corresponding `.jsonc` file there; there are no ORM models or migration files in this repo.

Key entities and how they relate: `PurchaseOrder`, `QuoteRequest`, `SupplierBookList` (+ `BookQuoteRequest`), `InventoryItem`, `Supplier`, `SupplierCredit`, `BudgetSource` → `BudgetAllocation`, `Category`, plus HR/project entities (`Employee`, `Attendance`, `Schedule`, `Branch`, `Volunteer`, `Project` and its sub-entities). See §3 of the SystemSpecification for the full field-level breakdown of each.

### Auth
[src/lib/AuthContext.jsx](src/lib/AuthContext.jsx) drives app-level auth state (checks Base44 app public settings, then `base44.auth.me()`). [src/components/ProtectedRoute.jsx](src/components/ProtectedRoute.jsx) and the `authError.type` states (`user_not_registered`, `auth_required`) in [src/App.jsx](src/App.jsx) gate rendering. `appParams` ([src/lib/app-params.js](src/lib/app-params.js)) resolves app id/token/base URL from URL params, localStorage, or env vars, in that priority order.

### Permissions — two-tier by design
Business logic authorization is centralized in [src/lib/permissions.js](src/lib/permissions.js) as plain `can*(user, ...)` functions keyed off `user.role`. Four roles: `admin` (technical superuser), `remote_manager` (approves/rejects, full financial visibility), `local_manager` (creates orders, receives goods, manages inventory, no financial approval), `user` (drafts only, no sensitive financial data).

**Every sensitive action is meant to be protected in two places**: UI (hide/disable controls) *and* wherever the actual entity mutation happens (call the `can*` helper before calling `base44.entities.X.update/create`). When adding a new permission-gated action, add a helper to `permissions.js` rather than inlining role checks, and gate both the UI and the mutation call site. Some permission checks also depend on entity status (e.g. `canEditBookList` blocks edits once a book list reaches `transferred_to_order`/`closed`) — check status transitions, not just role.

### Budget/credit side-effects are a manual state machine
There is no DB trigger — order status transitions must explicitly call into [src/lib/budgetUpdater.js](src/lib/budgetUpdater.js) (`handleBudgetOnStatusChange`, `recalcBudgetSource`, `validateBudgetSelection`). Rules baked into that file (see its header comment) that any code changing order status must preserve:
- `draft` → no budget effect
- `approved` → reserve amount against `BudgetAllocation` or `SupplierCredit` (`reserved_amount`), and set `budget_updated: true` on the order to prevent double-reservation
- `received_full`/`received_partial` → move amount from reserved to spent/used
- `cancelled` → release the reservation (and reset `budget_updated: false`)
- `BudgetSource` totals are always derived by summing its `BudgetAllocation` categories (`recalcBudgetSource`), never edited directly

Similarly, **inventory only updates on goods receipt** ([src/components/GoodsReceiptDialog.jsx](src/components/GoodsReceiptDialog.jsx)), never on order creation or approval — guarded by an `inventory_updated` flag on the order, mirroring the `budget_updated` flag pattern. Follow the existing flag-guard pattern for any new one-time side effect tied to a status transition.

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
