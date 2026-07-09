import { base44 } from '@/api/base44Client';

/**
 * Update budget category (BudgetAllocation) when order status changes.
 * 
 * Rules:
 * - Draft → no effect
 * - Approved → add to category.reserved_amount
 * - Received (full/partial) → move from reserved to spent
 * - Cancelled → release from reserved
 * 
 * BudgetSource totals are always auto-computed from categories on the Credits page.
 */

export async function handleBudgetOnStatusChange(order, newStatus) {
  if (!order.budget_category_id && !order.credit_id) return;
  if (order.budget_updated && newStatus === 'approved') {
    console.warn('Budget already updated for this order, skipping');
    return;
  }

  const amount = order.total_amount || 0;
  if (amount <= 0) return;

  try {
    if (order.budget_category_id) {
      await updateBudgetCategory(order, newStatus, amount);
    } else if (order.credit_id) {
      await updateSupplierCredit(order, newStatus, amount);
    }
  } catch (e) {
    console.error('Budget update failed:', e);
    throw e;
  }
}

async function updateBudgetCategory(order, newStatus, amount) {
  const cats = await base44.entities.BudgetAllocation.filter({ id: order.budget_category_id });
  if (!cats[0]) return;

  const cat = cats[0];
  let updates = {};
  let transactionEntry = null;

  if (newStatus === 'approved') {
    updates.reserved_amount = (cat.reserved_amount || 0) + amount;
    await base44.entities.PurchaseOrder.update(order.id, { budget_updated: true });

  } else if (newStatus === 'received_full' || newStatus === 'received_partial') {
    updates.reserved_amount = Math.max(0, (cat.reserved_amount || 0) - amount);
    updates.spent_amount = (cat.spent_amount || 0) + amount;

    transactionEntry = {
      date: new Date().toISOString().split('T')[0],
      amount,
      supplier_name: order.supplier_name || '',
      description: `הזמנת רכש שהתקבלה: ${order.title || order.id}`,
      is_manual: false,
      order_id: order.id,
    };

  } else if (newStatus === 'cancelled') {
    updates.reserved_amount = Math.max(0, (cat.reserved_amount || 0) - amount);
    await base44.entities.PurchaseOrder.update(order.id, { budget_updated: false });
  }

  if (Object.keys(updates).length > 0) {
    const newReserved = updates.reserved_amount !== undefined ? updates.reserved_amount : (cat.reserved_amount || 0);
    const newSpent = updates.spent_amount !== undefined ? updates.spent_amount : (cat.spent_amount || 0);
    updates.remaining_amount = Math.max(0, (cat.allocated_amount || 0) - newReserved - newSpent);

    if (transactionEntry) {
      updates.transactions = [...(cat.transactions || []), transactionEntry];
    }

    await base44.entities.BudgetAllocation.update(cat.id, updates);
  }

  // Recalculate BudgetSource totals
  if (cat.budget_source_id) {
    await recalcBudgetSource(cat.budget_source_id);
  }
}

async function updateSupplierCredit(order, newStatus, amount) {
  const crs = await base44.entities.SupplierCredit.filter({ id: order.credit_id });
  if (!crs[0]) return;

  const credit = crs[0];
  let updates = {};

  if (newStatus === 'approved') {
    updates.reserved_amount = (credit.reserved_amount || 0) + amount;
    await base44.entities.PurchaseOrder.update(order.id, { budget_updated: true });

    updates.transactions = [...(credit.transactions || []), {
      date: new Date().toISOString().split('T')[0],
      amount,
      order_id: order.id,
      description: `שוריין להזמנה ${order.title || order.id}`,
      action: 'reserved',
    }];

  } else if (newStatus === 'received_full' || newStatus === 'received_partial') {
    updates.reserved_amount = Math.max(0, (credit.reserved_amount || 0) - amount);
    updates.used_amount = (credit.used_amount || 0) + amount;

    updates.transactions = [...(credit.transactions || []), {
      date: new Date().toISOString().split('T')[0],
      amount,
      order_id: order.id,
      description: `נוצל להזמנה ${order.title || order.id}`,
      action: 'used',
    }];

  } else if (newStatus === 'cancelled') {
    updates.reserved_amount = Math.max(0, (credit.reserved_amount || 0) - amount);
    await base44.entities.PurchaseOrder.update(order.id, { budget_updated: false });

    updates.transactions = [...(credit.transactions || []), {
      date: new Date().toISOString().split('T')[0],
      amount,
      order_id: order.id,
      description: `שוחרר מביטול הזמנה ${order.title || order.id}`,
      action: 'released',
    }];
  }

  if (Object.keys(updates).length > 0) {
    const newReserved = updates.reserved_amount !== undefined ? updates.reserved_amount : credit.reserved_amount;
    const newUsed = updates.used_amount !== undefined ? updates.used_amount : credit.used_amount;
    updates.remaining_amount = Math.max(0, (credit.total_amount || 0) - (newReserved || 0) - (newUsed || 0));

    if (updates.remaining_amount !== undefined && updates.remaining_amount <= 0 && credit.status === 'active') {
      updates.status = 'exhausted';
    }

    await base44.entities.SupplierCredit.update(credit.id, updates);
  }
}

/**
 * Recalculate BudgetSource totals from its categories.
 */
export async function recalcBudgetSource(sourceId) {
  const cats = await base44.entities.BudgetAllocation.filter({ budget_source_id: sourceId }, 'name', 200);
  const total = cats.reduce((s, c) => s + (c.allocated_amount || 0), 0);
  const reserved = cats.reduce((s, c) => s + (c.reserved_amount || 0), 0);
  const spent = cats.reduce((s, c) => s + (c.spent_amount || 0), 0);
  const available = Math.max(0, total - reserved - spent);

  await base44.entities.BudgetSource.update(sourceId, {
    total_amount: total,
    reserved_amount: reserved,
    spent_amount: spent,
    available_amount: available,
  });
}

/**
 * Validate budget selection for an order.
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