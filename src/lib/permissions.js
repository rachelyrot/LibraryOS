/**
 * Permission helpers for the library management system.
 *
 * Business Roles (according to library specification):
 *   remote_manager  – מזכירה: approve/reject orders, procurement across the board, all suppliers
 *   local_manager   – מנהלת במקום: create/submit orders, receive goods, inventory, her own branch's staff
 *   user            – עובדת ספרייה: create drafts, submit, view own status
 *
 * Technical Role:
 *   admin           – מנהלת מערכת: full system access (technical/super user, not part of business workflow)
 *
 * `remote_manager` is displayed as "מזכירה" — the business title changed, the
 * stored role key deliberately did not. The key appears in a check constraint on
 * profiles.role, in RLS policies, and in the admin-users Edge Function; renaming
 * it would be a destructive migration across all three for a label change that
 * ROLE_DISPLAY_NAMES already delivers.
 */

export const ROLES = {
  ADMIN: 'admin',
  REMOTE_MANAGER: 'remote_manager',
  LOCAL_MANAGER: 'local_manager',
  USER: 'user',
};

/**
 * Role display names for UI (Hebrew)
 * Maps technical role names to business-friendly display names
 */
export const ROLE_DISPLAY_NAMES = {
  admin: 'מנהלת מערכת',
  remote_manager: 'מזכירה',
  local_manager: 'מנהלת במקום',
  user: 'עובדת ספרייה',
};

/**
 * Get display name for a role
 * @param {string} role - The technical role name
 * @returns {string} The Hebrew display name
 */
export function getRoleDisplayName(role) {
  return ROLE_DISPLAY_NAMES[role] || role;
}

/**
 * Check if role is a business role (not admin)
 * @param {string} role - The role to check
 * @returns {boolean} True if this is a business role
 */
export function isBusinessRole(role) {
  return role === ROLES.REMOTE_MANAGER || role === ROLES.LOCAL_MANAGER || role === ROLES.USER;
}

// ── Page access ─────────────────────────────────────────────────
//
// Which roles may reach each top-level page. This is the single source of truth
// for both the sidebar (Layout.jsx filters nav items through canAccessPage) and
// the router (App.jsx wraps every route in <RequirePage>), so a page can never
// be hidden from the menu while still reachable by typing its URL.
//
// Keys are first path segments; nested routes inherit from their parent
// ('/orders/:id' → '/orders', '/suppliers/:id' → '/suppliers').
//
// Note this gates *navigation*, not data. Blocking /credits does not stop
// OrderDetail from reading budget categories to fill its budget picker — that
// is intended, an order still has to be charged to a budget line by whoever
// creates it.

const EVERY_ROLE = [ROLES.ADMIN, ROLES.REMOTE_MANAGER, ROLES.LOCAL_MANAGER, ROLES.USER];

export const PAGE_ACCESS = {
  '/': EVERY_ROLE,
  '/orders': EVERY_ROLE,
  '/inventory': EVERY_ROLE,
  '/book-procurement': EVERY_ROLE,
  // Suppliers is open to all four roles, but the rows themselves are filtered
  // per supplier — see canViewSupplier below.
  '/suppliers': EVERY_ROLE,
  '/quotes': [ROLES.ADMIN, ROLES.REMOTE_MANAGER, ROLES.LOCAL_MANAGER],
  // local_manager sees her own branch only (see visibleBranchIds).
  '/staff': [ROLES.ADMIN, ROLES.REMOTE_MANAGER, ROLES.LOCAL_MANAGER],
  '/credits': [ROLES.ADMIN],
  '/projects': [ROLES.ADMIN],
  '/users': [ROLES.ADMIN],
  '/settings': [ROLES.ADMIN],
};

/**
 * May this user open the given path?
 * Unknown paths fall through as allowed so the 404 page still renders normally
 * instead of being masked by an access error.
 */
export function canAccessPage(user, pathname) {
  if (!user?.role) return false;
  const segment = `/${String(pathname || '/').split('/')[1] || ''}`;
  const allowed = PAGE_ACCESS[segment];
  if (!allowed) return true;
  return allowed.includes(user.role);
}

/** The first page this user is allowed to open — where to send her on a blocked route. */
export function landingPage(user) {
  return canAccessPage(user, '/') ? '/' : '/orders';
}

// ── Supplier sharing ────────────────────────────────────────────
//
// Every supplier carries `shared_with_roles` (jsonb array, migration 0010).
// admin and remote_manager always see every supplier and are never listed in
// it — only the two restrictable roles are.

/** Roles that can be toggled per supplier. The other two always have access. */
export const SHAREABLE_ROLES = [ROLES.LOCAL_MANAGER, ROLES.USER];

/** Admin + remote_manager — always see every supplier regardless of sharing. */
export function seesAllSuppliers(user) {
  return user?.role === ROLES.ADMIN || user?.role === ROLES.REMOTE_MANAGER;
}

/**
 * May this user see this specific supplier?
 *
 * Fails **open** when `shared_with_roles` is absent rather than empty. A missing
 * field means the row predates migration 0010 (or the migration hasn't been
 * applied yet), and the column's default there is "shared with everyone" — so
 * open is the answer that matches the database. Failing closed instead would
 * blank the entire supplier list for local_manager and user the moment this ships
 * ahead of the migration.
 *
 * An explicitly empty array is different: someone unchecked every role, and that
 * choice is honoured.
 */
export function canViewSupplier(user, supplier) {
  if (!user) return false;
  if (seesAllSuppliers(user)) return true;
  if (!Array.isArray(supplier?.shared_with_roles)) return true;
  return supplier.shared_with_roles.includes(user.role);
}

/**
 * Filter a supplier list down to what this user may see.
 * RLS (migration 0010) already filters this server-side; this keeps any list
 * built from cached or joined data honest too.
 */
export function visibleSuppliers(user, suppliers) {
  if (seesAllSuppliers(user)) return suppliers || [];
  return (suppliers || []).filter(s => canViewSupplier(user, s));
}

/** Admin only — decide which roles a supplier is shared with. */
export function canManageSupplierSharing(user) {
  return user?.role === ROLES.ADMIN;
}

// ── Branch scoping ──────────────────────────────────────────────

/** Admin + remote_manager — staff data across every branch. */
export function seesAllBranches(user) {
  return user?.role === ROLES.ADMIN || user?.role === ROLES.REMOTE_MANAGER;
}

/**
 * Branch ids this user may see staff data for, or `null` meaning "all branches".
 *
 * Three cases, deliberately distinguished:
 * - admin / remote_manager → null (every branch)
 * - `branch_id === undefined` → the profiles column isn't there, i.e. migration
 *   0010 hasn't been applied. Scoping can't work at all yet, so behave exactly
 *   as before the feature existed (all branches) instead of blanking the screen.
 * - `branch_id === null` → the column exists and nobody assigned a branch. That
 *   fails closed: an unassigned manager must not silently get every branch.
 */
export function visibleBranchIds(user) {
  if (!user) return [];
  if (seesAllBranches(user)) return null;
  if (user.branch_id === undefined) return null;
  return user.branch_id ? [user.branch_id] : [];
}

/** Is this employee within the user's branch scope? */
export function canViewEmployee(user, employee) {
  const allowed = visibleBranchIds(user);
  if (allowed === null) return true;
  if (allowed.length === 0) return false;
  const extra = Array.isArray(employee?.additional_branch_ids) ? employee.additional_branch_ids : [];
  return allowed.some(id => id === employee?.primary_branch_id || extra.includes(id));
}

/** Filter any branch-stamped rows (employees, volunteers, schedules) to the user's scope. */
export function scopeToBranches(user, rows, branchField = 'primary_branch_id') {
  const allowed = visibleBranchIds(user);
  if (allowed === null) return rows || [];
  if (allowed.length === 0) return [];
  return (rows || []).filter(r => allowed.includes(r?.[branchField]));
}

/** Admin + remote_manager */
export function canApproveOrders(user) {
  return user?.role === ROLES.ADMIN || user?.role === ROLES.REMOTE_MANAGER;
}

/** Admin + remote_manager */
export function canRejectOrders(user) {
  return user?.role === ROLES.ADMIN || user?.role === ROLES.REMOTE_MANAGER;
}

/** Admin only */
export function canEditBudgets(user) {
  return user?.role === ROLES.ADMIN;
}

/** Admin only */
export function canCreateSupplierCredits(user) {
  return user?.role === ROLES.ADMIN;
}

/** Admin only */
export function canAddManualExpense(user) {
  return user?.role === ROLES.ADMIN;
}

/** Admin only */
export function canManageUsers(user) {
  return user?.role === ROLES.ADMIN;
}

/** Admin + local_manager */
export function canReceiveGoods(user) {
  return user?.role === ROLES.ADMIN || user?.role === ROLES.LOCAL_MANAGER;
}

/** Admin only */
export function canEditSettings(user) {
  return user?.role === ROLES.ADMIN;
}

/** Anyone with an account */
export function canCreateOrders(user) {
  return !!user;
}

/** Admin + remote_manager */
export function canCancelOrders(user) {
  return user?.role === ROLES.ADMIN || user?.role === ROLES.REMOTE_MANAGER;
}

/** Admin + local_manager + user — draft editing */
export function canEditDraft(user) {
  return !!user;
}

/** Admin + local_manager + user */
export function canSubmitForApproval(user) {
  return !!user;
}

/** Admin + local_manager — managing inventory */
export function canManageInventory(user) {
  return user?.role === ROLES.ADMIN || user?.role === ROLES.LOCAL_MANAGER;
}

/** Admin only — delete master data (suppliers, categories, etc.) */
export function canDeleteMasterData(user) {
  return user?.role === ROLES.ADMIN;
}

/** Admin + remote_manager — approve quotes */
export function canApproveQuotes(user) {
  return user?.role === ROLES.ADMIN || user?.role === ROLES.REMOTE_MANAGER;
}

/** Admin + remote_manager — convert quote to purchase order */
export function canConvertQuoteToOrder(user) {
  return user?.role === ROLES.ADMIN || user?.role === ROLES.REMOTE_MANAGER;
}

/**
 * Admin only — the budget domain (מקורות תקציב) is closed to every other role.
 * Order totals are not covered by this; they stay visible wherever an order is.
 */
export function canViewBudgets(user) {
  return user?.role === ROLES.ADMIN;
}

/** Admin only — view sensitive budget data (full financial details, supplier credits) */
export function canViewSensitiveBudgetData(user) {
  return user?.role === ROLES.ADMIN;
}

/**
 * Edit book list — depends on status and role
 * admin / remote_manager: always
 * local_manager / user: any status except 'closed'
 *
 * A book list is a reusable catalogue, not a one-shot form: books get added to
 * it mid-process and after orders have already gone out, and each batch is sent
 * as its own quote-request cycle. So sending a cycle does NOT freeze the list —
 * only closing it explicitly does.
 *
 * ('transferred_to_order' used to be listed as blocking here, but no such status
 * exists — supplier_book_lists.status is constrained to received / in_review /
 * books_selected / transferred_to_quote / closed, so that arm was dead.)
 */
export function canEditBookList(user, bookList) {
  if (!user) return false;
  if (user.role === ROLES.ADMIN) return true;
  if (user.role === ROLES.REMOTE_MANAGER) return true;

  if (bookList?.status === 'closed') return false;

  return user.role === ROLES.LOCAL_MANAGER || user.role === ROLES.USER;
}

/** Archive/delete book list — admin only */
export function canArchiveBookList(user) {
  return user?.role === ROLES.ADMIN;
}

/** Mark books for order — everyone, until the list is closed */
export function canMarkBooksForOrder(user, bookList) {
  if (!user) return false;
  if (bookList?.status === 'closed') return false;
  return true;
}

/**
 * Create order from book list — everyone, until the list is closed.
 * Deliberately does NOT block on an existing linked_order_id: the same list is
 * meant to produce several rounds of orders as more books are added to it.
 */
export function canCreateOrderFromBookList(user, bookList) {
  if (!user) return false;
  if (bookList?.status === 'closed') return false;
  return true;
}

/** Everyone */
export function canViewAllData(user) {
  return !!user;
}

/** Is the user an admin? (convenience — prefer the specific helpers above) */
export function isAdmin(user) {
  return user?.role === ROLES.ADMIN;
}

// ── Book Quote Request permissions ──────────────────────────────

/** Everyone — create a book list */
export function canCreateBookList(user) {
  return !!user;
}

/** Everyone — mark books for quote request, until the list is closed */
export function canMarkBooksForQuoteRequest(user, bookList) {
  if (!user) return false;
  if (bookList?.status === 'closed') return false;
  return true;
}

/** Admin + remote_manager + local_manager — create/send book quote request to suppliers */
export function canCreateBookQuoteRequest(user) {
  return user?.role === ROLES.ADMIN || user?.role === ROLES.REMOTE_MANAGER || user?.role === ROLES.LOCAL_MANAGER;
}

/** Admin + remote_manager + local_manager — send quote request emails to suppliers */
export function canSendQuoteRequestEmails(user) {
  return user?.role === ROLES.ADMIN || user?.role === ROLES.REMOTE_MANAGER || user?.role === ROLES.LOCAL_MANAGER;
}

/** Admin + remote_manager + local_manager — receive/upload price quotes from suppliers */
export function canReceiveQuotePrices(user) {
  return user?.role === ROLES.ADMIN || user?.role === ROLES.REMOTE_MANAGER || user?.role === ROLES.LOCAL_MANAGER;
}

/** Admin + remote_manager + local_manager + user (view only) — view price comparison */
export function canComparePrices(user) {
  return !!user;
}

/** Admin + remote_manager — final supplier selection per book */
export function canSelectSuppliers(user) {
  return user?.role === ROLES.ADMIN || user?.role === ROLES.REMOTE_MANAGER;
}

/** Admin + remote_manager — create purchase orders grouped by supplier */
export function canCreateOrdersFromQuoteRequest(user) {
  return user?.role === ROLES.ADMIN || user?.role === ROLES.REMOTE_MANAGER;
}

// ── Staff / HR permissions ──────────────────────────────────────

/** Admin + remote_manager + local_manager — view all staff data */
export function canViewAllStaff(user) {
  return user?.role === ROLES.ADMIN || user?.role === ROLES.REMOTE_MANAGER || user?.role === ROLES.LOCAL_MANAGER;
}

/** Admin + remote_manager + local_manager — manage schedules */
export function canManageSchedule(user) {
  return user?.role === ROLES.ADMIN || user?.role === ROLES.REMOTE_MANAGER || user?.role === ROLES.LOCAL_MANAGER;
}

/** Admin + remote_manager — approve schedules */
export function canApproveSchedule(user) {
  return user?.role === ROLES.ADMIN || user?.role === ROLES.REMOTE_MANAGER;
}

/** Admin only — manage branches */
export function canManageBranches(user) {
  return user?.role === ROLES.ADMIN;
}

/** Admin only — manage approved positions */
export function canManagePositions(user) {
  return user?.role === ROLES.ADMIN;
}

/** Admin only — full CRUD on employees */
export function canManageEmployees(user) {
  return user?.role === ROLES.ADMIN;
}

/** Admin only — delete employees */
export function canDeleteEmployee(user) {
  return user?.role === ROLES.ADMIN;
}

/** Admin + local_manager — manage volunteers */
export function canManageVolunteers(user) {
  return user?.role === ROLES.ADMIN || user?.role === ROLES.LOCAL_MANAGER;
}

/** Admin + remote_manager — view staff reports */
export function canViewStaffReports(user) {
  return user?.role === ROLES.ADMIN || user?.role === ROLES.REMOTE_MANAGER;
}

/** Everyone — view own schedule */
export function canViewOwnSchedule(user) {
  return !!user;
}

// ── Project Management permissions ──────────────────────────────
//
// ניהול פרויקטים is an admin-only page (see PAGE_ACCESS), so every helper here
// resolves to admin. They are kept as separate named helpers rather than
// collapsed into isAdmin() because they mark distinct actions — if the project
// module is later reopened to מזכירה, this is the list to widen.

/** Admin only — view all projects */
export function canViewAllProjects(user) {
  return user?.role === ROLES.ADMIN;
}

/** Admin only — create/edit projects */
export function canCreateProjects(user) {
  return user?.role === ROLES.ADMIN;
}

/** Admin only — edit project details */
export function canEditProjects(user) {
  return user?.role === ROLES.ADMIN;
}

/** Admin only — close/complete projects */
export function canCloseProjects(user) {
  return user?.role === ROLES.ADMIN;
}

/** Admin only — manage project budget */
export function canManageProjectBudget(user) {
  return user?.role === ROLES.ADMIN;
}

/** Admin only — view project budget (sensitive) */
export function canViewProjectBudget(user) {
  return user?.role === ROLES.ADMIN;
}

/** Admin only — link purchase orders to projects */
export function canLinkPurchaseOrders(user) {
  return user?.role === ROLES.ADMIN;
}

/** Admin only — create tasks */
export function canCreateTasks(user) {
  return user?.role === ROLES.ADMIN;
}

/**
 * Anyone with an account — update task status (user: own tasks only).
 * Left open deliberately: task status is the one project action the spec keeps
 * for עובדת ספרייה, even though the projects page itself is admin-only today.
 */
export function canUpdateTaskStatus(user) {
  return !!user;
}

/** Admin only — assign personnel to projects */
export function canAssignPersonnel(user) {
  return user?.role === ROLES.ADMIN;
}

/** Admin only — view project reports */
export function canViewProjectReports(user) {
  return user?.role === ROLES.ADMIN;
}