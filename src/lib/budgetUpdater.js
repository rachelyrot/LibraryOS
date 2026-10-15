import { base44, supabase } from '@/api/base44Client';
import { plannedByAllocation, projectCommitments, mergeCommitments, allocationCommitted } from '@/lib/workPlan';

/**
 * כמה תכניות עבודה ופרויקטים לוקחים מכל קטגוריית תקציב — אותו חשבון שמסך
 * מקורות תקציב מציג, במקום אחד, כדי שכל מסך שמציג יתרה (מקורות תקציב, הזמנה)
 * יראה את אותו מספר. כל חלק נטען לבד: כשל בתכניות (שהן לאדמין בלבד) לא מסתיר
 * את הפרויקטים.
 * @returns {Promise<Map<string, {approved, submitted, plans}>>} לפי budget_allocations.id
 */
export async function loadBudgetCommitments(sources, allocations) {
  const fromPlans = async () => {
    try {
      const plans = (await base44.entities.WorkPlan.list('-created_date', 50))
        .filter(p => p.municipal_budget_source_id || p.ministry_budget_source_id);
      const lists = await Promise.all(plans.map(p => base44.entities.WorkPlanItem.filter({ work_plan_id: p.id }, 'sort_order', 2000)));
      return plannedByAllocation(plans, new Map(plans.map((p, k) => [p.id, lists[k]])), sources, allocations);
    } catch { return new Map(); }
  };
  const fromProjects = async () => {
    try { return projectCommitments(await base44.entities.Project.list('-created_date', 500), sources, allocations); }
    catch { return new Map(); }
  };
  const [a, b] = await Promise.all([fromPlans(), fromProjects()]);
  return mergeCommitments(a, b);
}

/**
 * מצב קטגוריה לבחירה בהזמנה, באותו חשבון כמו במקורות תקציב:
 *   balance    — היתרה שמוצגת במקורות תקציב (אחרי תכניות ופרויקטים)
 *   leftInPlan — מה שתכניות/פרויקטים שמרו בה ועוד לא הוזמן
 *   orderable  — כמה הזמנה יכולה לקחת: balance + leftInPlan, כי הזמנה של
 *                פעילות מתוכננת יורדת מתוך התכנית ולא פעם נוספת
 */
export function allocationStanding(cat, commitments) {
  const e = commitments?.get(cat.id);
  const c = allocationCommitted(cat, e?.approved || 0, e?.submitted || 0);
  const balance = Math.max(0, (Number(cat.allocated_amount) || 0) - c.committed);
  return { balance, leftInPlan: c.leftInPlan, orderable: allocationRemaining(cat), plans: e?.plans || [] };
}

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
 * Write an approved work plan's per-parameter amounts into its linked budget
 * sources' categories. All-or-nothing, in the sync_work_plan_budget RPC
 * (migration 0014) — it refuses to cut a category below what orders already
 * reserved/spent, and re-derives the source totals itself.
 * @returns {Promise<{ created: number, updated: number }>}
 */
export async function syncWorkPlanBudget(planId) {
  const { data, error } = await supabase.rpc('sync_work_plan_budget', { p_plan_id: planId });
  if (error) throw error;
  return data;
}

/** שם קטגוריה לתצוגה, עם מספר הקטגוריה לפניו אם הוזן (מיגרציה 0016). */
export function allocationLabel(cat) {
  if (!cat) return '';
  const num = (cat.category_number || '').trim();
  return num ? `${num} · ${cat.name}` : cat.name;
}

/** What is still free in one budget category (BudgetAllocation). */
export function allocationRemaining(cat) {
  return cat.remaining_amount != null
    ? cat.remaining_amount
    : Math.max(0, (cat.allocated_amount || 0) - (cat.reserved_amount || 0) - (cat.spent_amount || 0));
}

/**
 * Budget sources of one funding type, each annotated with whether it has any
 * categories and how much its categories have left. Orders and quotes can only
 * be charged to a category, so a source without categories can't fund anything
 * — pickers use this to say so instead of offering it as "יתרה ₪0".
 */
export function budgetSourceOptions(budgetSources, allCategories, fundingType) {
  // מקורות שנשמרו בלי סוג מימון (או עם סוג אחר) לא הופיעו בכלל והרשימה נשארה
  // ריקה. כמו בתכנית העבודה: אין מקור מהסוג — מציגים את כולם.
  const matching = budgetSources.filter(bs => bs.funding_source_type === fundingType);
  return (matching.length ? matching : budgetSources)
    .map(bs => {
      const cats = allCategories.filter(c => c.budget_source_id === bs.id);
      return { ...bs, hasCategories: cats.length > 0, remaining: cats.reduce((s, c) => s + allocationRemaining(c), 0) };
    });
}

/**
 * מקור שאינו מחולק לקטגוריות (uses_categories = false, מיגרציה 0015) מחזיק
 * קטגוריה אחת בלבד, שהטריגר בבסיס הנתונים מסנכרן עם סכום המקור. הבוררים
 * בהזמנה ובהצעת מחיר בוחרים אותה אוטומטית במקום להציג בחירת קטגוריה.
 * @returns {object|null} הקטגוריה היחידה, או null למקור שמחולק לקטגוריות
 */
export function singleAllocationFor(source, allCategories) {
  if (!source || source.uses_categories !== false) return null;
  return allCategories.find(c => c.budget_source_id === source.id) || null;
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
