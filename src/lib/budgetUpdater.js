import { base44, supabase } from '@/api/base44Client';

/**
 * Update budget category (BudgetAllocation) or supplier credit when an order's
 * status changes.
 *
 * Rules:
 * - Draft → no effect
 * - Approved → add to reserved_amount
 * - Received (full/partial) → move from reserved to spent/used
 * - Cancelled → release from reserved
 *
 * The actual mutation happens atomically in Postgres via the
 * apply_order_budget_transition RPC (supabase/migrations/0003_budget_inventory_rpc.sql) —
 * it re-validates the budget_updated guard and locks the relevant rows itself,
 * so a stale client-side read can't cause a double-application or lost update.
 */
export async function handleBudgetOnStatusChange(order, newStatus) {
  if (!order.budget_category_id && !order.credit_id) return;
  if (order.budget_updated && newStatus === 'approved') {
    console.warn('Budget already updated for this order, skipping');
    return;
  }

  const amount = order.total_amount || 0;
  if (amount <= 0) return;

  const { error } = await supabase.rpc('apply_order_budget_transition', {
    p_order_id: order.id,
    p_new_status: newStatus,
  });
  if (error) {
    console.error('Budget update failed:', error);
    throw error;
  }
}

/**
 * Recalculate BudgetSource totals from its categories (also called internally
 * by the apply_order_budget_transition RPC after it updates a category).
 */
export async function recalcBudgetSource(sourceId) {
  const { error } = await supabase.rpc('recalc_budget_source', { p_source_id: sourceId });
  if (error) throw error;
}

/**
 * Validate budget selection for an order. Stays a plain client-side read (no
 * mutation risk) — a lightweight pre-flight UX check; the RPC above is the
 * authoritative check and will reject if this pre-check was stale.
 */
export async function validateBudgetSelection(order) {
  const amount = order.total_amount || 0;
  if (amount <= 0) return { valid: false, error: 'לא ניתן לאשר הזמנה ללא סכום.' };

  if (!order.funding_source_type) {
    return { valid: false, error: 'יש לבחור מקור מימון לפני אישור ההזמנה.' };
  }

  if (!order.budget_category_id && !order.credit_id) {
    return { valid: false, error: 'יש לבחור קטגוריית תקציב או זיכוי ספק לפני האישור.' };
  }

  if (order.budget_category_id) {
    const cats = await base44.entities.BudgetAllocation.filter({ id: order.budget_category_id });
    if (!cats[0]) return { valid: false, error: 'קטגוריית התקציב לא נמצאה.' };

    const cat = cats[0];
    const remain = cat.remaining_amount !== undefined
      ? cat.remaining_amount
      : Math.max(0, (cat.allocated_amount || 0) - (cat.reserved_amount || 0) - (cat.spent_amount || 0));

    if (amount > remain) {
      return { valid: false, error: 'אין יתרה זמינה מספקת בקטגוריית התקציב שנבחרה.' };
    }

    return { valid: true, error: null };
  }

  if (order.credit_id) {
    const crs = await base44.entities.SupplierCredit.filter({ id: order.credit_id });
    if (!crs[0]) return { valid: false, error: 'הזיכוי לא נמצא.' };

    const credit = crs[0];
    if (credit.status !== 'active') return { valid: false, error: 'הזיכוי אינו פעיל.' };
    if (credit.valid_until && new Date(credit.valid_until) < new Date()) return { valid: false, error: 'תוקף הזיכוי פג.' };

    const remaining = credit.remaining_amount !== undefined
      ? credit.remaining_amount
      : (credit.total_amount || 0) - (credit.reserved_amount || 0) - (credit.used_amount || 0);

    if (amount > remaining) return { valid: false, error: 'יתרת הזיכוי אינה מספיקה להזמנה זו.' };
    return { valid: true, error: null };
  }

  return { valid: true, error: null };
}
