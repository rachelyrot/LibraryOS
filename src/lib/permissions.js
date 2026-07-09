/**
 * Permission helpers for the library management system.
 *
 * Business Roles (according to library specification):
 *   remote_manager  – מנהלת מרחוק: approve/reject orders, full read access, no data management
 *   local_manager   – מנהלת במקום: create/submit orders, receive goods, view inventory/suppliers/quotes
 *   user            – עובדת ספרייה: create drafts, submit, view own status
 *
 * Technical Role:
 *   admin           – מנהלת מערכת: full system access (technical/super user, not part of business workflow)
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
  remote_manager: 'מנהלת מרחוק',
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

/** Admin, remote_manager, local_manager — view budgets (read-only for non-admin) */
export function canViewBudgets(user) {
  return user?.role === ROLES.ADMIN || user?.role === ROLES.REMOTE_MANAGER || user?.role === ROLES.LOCAL_MANAGER;
}

/** Admin + remote_manager — view sensitive budget data (full financial details) */
export function canViewSensitiveBudgetData(user) {
  return user?.role === ROLES.ADMIN || user?.role === ROLES.REMOTE_MANAGER;
}

/**
 * Edit book list — depends on status and role
 * admin: always
 * remote_manager: always (can edit even after transfer for admin overrides)
 * local_manager: only before transferred_to_order
 * user: only before transferred_to_order
 */
export function canEditBookList(user, bookList) {
  if (!user) return false;
  if (user.role === ROLES.ADMIN) return true;
  if (user.role === ROLES.REMOTE_MANAGER) return true;
  
  // local_manager and user can edit only before transfer
  const blockedStatuses = ['transferred_to_order', 'closed'];
  if (blockedStatuses.includes(bookList?.status)) return false;
  
  return user.role === ROLES.LOCAL_MANAGER || user.role === ROLES.USER;
}

/** Archive/delete book list — admin only */
export function canArchiveBookList(user) {
  return user?.role === ROLES.ADMIN;
}

/** Mark books for order — everyone before transfer */
export function canMarkBooksForOrder(user, bookList) {
  if (!user) return false;
  if (bookList?.status === 'transferred_to_order' || bookList?.status === 'closed') return false;
  return true;
}

/** Create order from book list — everyone if no order exists */
export function canCreateOrderFromBookList(user, bookList) {
  if (!user) return false;
  if (bookList?.linked_order_id) return false;
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

/** Everyone — mark books for quote request */
export function canMarkBooksForQuoteRequest(user, bookList) {
  if (!user) return false;
  if (bookList?.status === 'transferred_to_order' || bookList?.status === 'closed') return false;
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

/** Admin + remote_manager + local_manager — view all projects */
export function canViewAllProjects(user) {
  return user?.role === ROLES.ADMIN || user?.role === ROLES.REMOTE_MANAGER || user?.role === ROLES.LOCAL_MANAGER;
}

/** Admin + remote_manager — create/edit projects */
export function canCreateProjects(user) {
  return user?.role === ROLES.ADMIN || user?.role === ROLES.REMOTE_MANAGER;
}

/** Admin + remote_manager — edit project details */
export function canEditProjects(user) {
  return user?.role === ROLES.ADMIN || user?.role === ROLES.REMOTE_MANAGER;
}

/** Admin + remote_manager — close/complete projects */
export function canCloseProjects(user) {
  return user?.role === ROLES.ADMIN || user?.role === ROLES.REMOTE_MANAGER;
}

/** Admin + remote_manager — manage project budget */
export function canManageProjectBudget(user) {
  return user?.role === ROLES.ADMIN || user?.role === ROLES.REMOTE_MANAGER;
}

/** Admin + remote_manager — view project budget (sensitive) */
export function canViewProjectBudget(user) {
  return user?.role === ROLES.ADMIN || user?.role === ROLES.REMOTE_MANAGER;
}

/** Admin + remote_manager — link purchase orders to projects */
export function canLinkPurchaseOrders(user) {
  return user?.role === ROLES.ADMIN || user?.role === ROLES.REMOTE_MANAGER;
}

/** Admin + remote_manager + local_manager — create tasks */
export function canCreateTasks(user) {
  return user?.role === ROLES.ADMIN || user?.role === ROLES.REMOTE_MANAGER || user?.role === ROLES.LOCAL_MANAGER;
}

/** Admin + remote_manager + local_manager + user — update task status (user: own tasks only) */
export function canUpdateTaskStatus(user) {
  return !!user;
}

/** Admin + remote_manager + local_manager — assign personnel to projects */
export function canAssignPersonnel(user) {
  return user?.role === ROLES.ADMIN || user?.role === ROLES.REMOTE_MANAGER || user?.role === ROLES.LOCAL_MANAGER;
}

/** Admin + remote_manager — view project reports */
export function canViewProjectReports(user) {
  return user?.role === ROLES.ADMIN || user?.role === ROLES.REMOTE_MANAGER;
}