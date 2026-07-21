<div align="center">

# 📚 LibraryOS

### Procurement · Inventory · Budget · HR management for a municipal library

<p>
  <img alt="React" src="https://img.shields.io/badge/React-18.2-61DAFB?logo=react&logoColor=white&labelColor=20232a">
  <img alt="Vite" src="https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white&labelColor=20232a">
  <img alt="Supabase" src="https://img.shields.io/badge/Supabase-Postgres%20%2B%20Auth%20%2B%20Storage-3ECF8E?logo=supabase&logoColor=white&labelColor=20232a">
  <img alt="Cloudflare" src="https://img.shields.io/badge/Cloudflare-Workers%20%2F%20Static%20Assets-F38020?logo=cloudflare&logoColor=white&labelColor=20232a">
  <img alt="Tailwind" src="https://img.shields.io/badge/Tailwind-3.4-06B6D4?logo=tailwindcss&logoColor=white&labelColor=20232a">
  <img alt="RTL" src="https://img.shields.io/badge/UI-Hebrew%20%2F%20RTL-6f42c1?labelColor=20232a">
  <img alt="License" src="https://img.shields.io/badge/license-internal-lightgrey?labelColor=20232a">
</p>

**A fully self-contained SPA** — no custom backend server beyond Postgres functions.
Every sensitive business rule (budget, credits, goods receipt) runs as a single atomic database transaction, never as sequential client-side calls.


</div>

---

## 🗂️ Table of Contents

- [What is this](#-what-is-this)
- [Core capabilities](#-core-capabilities)
- [Architecture at a glance](#️-architecture-at-a-glance)
- [Two parallel procurement flows](#-two-parallel-procurement-flows--dont-cross-them)
- [Roles & permissions](#-roles--permissions)
- [Getting started](#-getting-started)
- [Available commands](#-available-commands)
- [Project structure](#-project-structure)
- [Core principles](#-core-principles-dont-break-these)
- [Deployment](#️-deployment)

---

## 🧭 What is this

**LibraryOS** manages the full operational lifecycle of a municipal library: purchase orders, quote requests, book-list imports, inventory, budget sources and allocations, supplier credits, staff attendance and scheduling, and organizational projects — all behind a full Hebrew (RTL) interface, fast, with no dedicated backend server.

The project originally ran on **Base44** and was fully migrated to an independent stack: **Supabase** (Postgres + Auth + Storage) on the server side, and **Cloudflare** (Workers with static assets) hosting the UI.

## ✨ Core capabilities

| Area | What it does |
|---|---|
| 🛒 **Procurement & orders** | Create → submit → approve → receive, with full status tracking |
| 💰 **Budget** | Budget sources → per-category allocations, atomic real-time reserve/spend |
| 🧾 **Supplier credits** | Manage credit balances against suppliers as an alternative to a budget source |
| 📦 **Inventory** | Stock only updates on actual goods receipt — never on order creation or approval |
| 📖 **Book procurement** | Supplier book lists → dedicated book quote requests → purchase order |
| 🧑‍💼 **HR / staff** | Employees, approved positions, branches, attendance, scheduling |
| 🏗️ **Projects** | Per-source budgets, tasks, milestones, contacts, documents — all in an editable grid |
| 📊 **Dashboards** | Clickable summary cards with drilldown to a filtered list, categorical pie charts |

## 🏛️ Architecture at a glance

```
┌─────────────────────────────┐        ┌──────────────────────────┐
│   React 18 SPA (Vite 6)     │        │        Supabase          │
│   Cloudflare Workers/Assets │◄──────►│  Postgres + Auth + Storage│
│                              │  REST  │  RLS policies            │
│  src/api/base44Client.js    │  RPC   │  plpgsql transactions     │
│  (Base44-shaped shim)       │        │  (supabase/migrations/*.sql)│
└─────────────────────────────┘        └──────────────────────────┘
```

Every read/write goes through `src/api/base44Client.js` — a thin wrapper around `@supabase/supabase-js` that keeps the **exact same object shape** the app was originally written against (`base44.entities.X.list/filter/get/create/update/delete`), so ~50 call sites across the app needed zero changes when the backend was swapped.

Sensitive operations (order status changes, goods receipt) are never a sequence of client-side calls — they call a single `plpgsql` function (`supabase.rpc(...)`) that performs an **atomic read-modify-write** with `for update` row locking, with guard flags (`budget_updated`, `inventory_updated`) re-checked *inside* the transaction — never trusted from what the client already believes.

## 🔀 Two parallel procurement flows — don't cross them

```
Books:               SupplierBookList ──► BookQuoteRequest ──► PurchaseOrder
Equipment/services:  QuoteRequest ─────────────────────────────► PurchaseOrder
```

This separation is **intentional** — books never go through `QuoteRequest`, and equipment/services never through `SupplierBookList`. Flags like `order_created`/`linked_order_id` prevent creating a duplicate order from the same source.

## 🔐 Roles & permissions

| Role | Allowed to |
|---|---|
| `admin` | Technical superuser, including changing a user's `role` in Supabase Studio |
| `remote_manager` | Approve/reject orders, full financial visibility |
| `local_manager` | Create orders, receive goods, manage inventory — no financial approval |
| `user` | Drafts only, no sensitive financial data |

Every sensitive action is protected **in two places**: in the UI (hide/disable controls) *and* at the actual mutation call site to `base44.entities.X.update/create` (via the helpers in [`src/lib/permissions.js`](src/lib/permissions.js)) — UI-only protection is never enough on its own.

## 🚀 Getting started

```bash
git clone <repo-url>
cd bnei-brak-library
npm install
```

Create `.env.local`:

```env
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=<anon/publishable key>
```

> 🔓 The anon key is safe to expose client-side by design — **Row Level Security (RLS) policies, not key secrecy**, are what actually protect the data.

```bash
npm run dev
```

## 🛠️ Available commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server (Vite) |
| `npm run build` | Production build |
| `npm run preview` | Preview the production build |
| `npm run lint` | ESLint (`--quiet`) |
| `npm run lint:fix` | ESLint with auto-fix |
| `npm run typecheck` | Type checking (`tsc`, `checkJs`, not a full TS project) |

There is no test runner configured in this repo — don't assume Jest/Vitest exist.

## 📁 Project structure

```
src/
├─ api/base44Client.js      # single data-access layer for Supabase (Base44-shaped shim)
├─ lib/
│  ├─ AuthContext.jsx       # session + profiles gate
│  ├─ permissions.js        # can*(user, ...) — every permission check goes through here
│  └─ budgetUpdater.js      # RPC wrappers for budget/credit
├─ pages/                   # flat pages, routes defined in App.jsx
├─ components/
│  ├─ budget/ staff/ projects/ bookLists/ bookProcurement/ quotes/ ...
│  └─ ui/                   # shadcn/ui — vendored, don't hand-edit
└─ docs/SystemSpecification.md   # source of truth for workflows & permissions (Hebrew)

supabase/migrations/*.sql   # the live schema of record — DDL, RLS, RPC
docs/legacy-base44-schema/  # original Base44 schema, frozen, historical reference only
```

## 📐 Core principles (don't break these)

- 🔒 **Permissions in two layers** — UI, and the actual mutation call site.
- ⚛️ **Atomic RPC, not sequential calls** — any status change affecting budget/inventory must go through a single Postgres function with row locking.
- 📦 **Inventory only updates on actual goods receipt** — never on order creation, never on approval.
- 🚫 **Books ↔ equipment never mix** — two separate procurement flows, by design.
- 🗄️ **New migration, never an edit** — never hand-edit a migration that's already been applied; add a new numbered file instead.
- 🌐 **Everything is RTL and Hebrew** — new UI text stays in Hebrew, consistent with the rest of the app.

## ☁️ Deployment

The frontend runs on **Cloudflare** (Workers + static assets). Build command is `npm run build`, output is `dist/`. There's no dependency on a custom server — all server-side logic is Postgres (`plpgsql`) in Supabase.

---

<div align="center">

Built with ☕, RTL, and an unreasonable amount of care for budget-transaction atomicity.

</div>
