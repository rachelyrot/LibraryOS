/**
 * תכנית עבודה שנתית — חישובים משותפים לדף, לייצוא ל-Excel ולתצוגת ההדפסה.
 *
 * התכנית בנויה לפי טופס "תכנון התקציב של הספריות הציבוריות" של משרד התרבות:
 * שמונה פרמטרים קבועים, לחלקם הגבלת אחוז (מינימום או מקסימום). מתחת לכל
 * פרמטר יש שורות מפורטות — כל שורה עם סכום עירוני, סכום משרד התרבות, ותקופת
 * ניצול (מחודש עד חודש).
 *
 * "תצוגה" (view) קובעת איזה חלק מהתכנית מוצג — הכל, רק החלק העירוני או רק
 * החלק של המשרד. כל שלושת הפלטים (מסך, Excel, הדפסה) עוברים דרך הפונקציות כאן,
 * כדי שהסכומים והאחוזים יהיו זהים בכולם.
 */

/**
 * הפרמטרים של טופס המשרד, בסדר שבו הם מופיעים בטופס. השם נשמר כמו שהוא בעמודת
 * category של השורה — שינוי שם כאן ינתק שורות קיימות מהפרמטר שלהן.
 */
//
// כל הגבלה נמדדת מול הבסיס שהטופס קובע לה (base), ולא מול סך התצוגה הנוכחית:
//   'all'      — סך התקציב השוטף של הספרייה (עירוני + משרד התרבות)
//   'ministry' — סך כספי התמיכה שאושרו (עמודת משרד התרבות)
// what — איזה סכום של הפרמטר נמדד: 'all' (שני המקורות) או 'ministry'.
// group — פרמטרים שההגבלה חלה על הסכום של כולם יחד (שיווק + השתלמויות).
// הפיצול בטופס של שיווק והשתלמויות ל"מתקציב הרשות" ו"מתמיכת משרד התרבות" הוא
// שתי עמודות הסכום שכבר יש לכל שורה, ולא פרמטרים נפרדים.
export const MINISTRY_PARAMETERS = [
  {
    name: 'שכר',
    note: 'בספריות משולבות אין לכלול את עובדי המוסד החינוכי ועובדים שמשכורתם ממומנת על ידי משרד החינוך או המוסד החינוכי',
  },
  {
    name: 'רכש ספרים, כתבי עת, מדיה ומאגרי מידע',
    min: 40, base: 'all', what: 'all',
    note: 'לפחות 40% מתוך סך התקציב השוטף של הספרייה ימומש מתוך סעיף זה',
  },
  {
    // "פעולות תרבות" בטופס — השם נשאר כפי שנשמר בשורות הקיימות
    name: 'פעילות תרבות',
    min: 25, base: 'ministry', what: 'ministry',
    note: 'רכש פעולות תרבות לא יפחת מ-25% מסך כספי התמיכה שאושרו לרשות',
  },
  { name: 'רכש מחשבים, תוכנות, ריהוט וציוד משרדי', note: 'לטובת מנויי הספרייה' },
  {
    name: 'פעולות לשיווק, פרסום ומיתוג הספרייה',
    short: 'שיווק ומיתוג',
    max: 10, base: 'ministry', what: 'all', group: 'marketing_training',
    note: 'השתלמויות ושיווק ומיתוג שניהם יחד לא יעלו על 10% מסך כספי התמיכה',
  },
  {
    name: 'השתלמויות והכשרות מקצועיות למנהלי ספריות וספרנים',
    short: 'השתלמויות',
    max: 10, base: 'ministry', what: 'all', group: 'marketing_training',
    note: 'השתלמויות ושיווק ומיתוג שניהם יחד לא יעלו על 10% מסך כספי התמיכה',
  },
  {
    name: 'הוצאות אחזקת מבנה הספרייה',
    note: 'במבנה המשמש לכמה שימושים — יש לדווח רק את החלק היחסי לספרייה',
  },
  { name: 'הוצאות אחרות', note: 'יש לפרט בכל שורה מה ההוצאה' },
];

const PARAMETER_BY_NAME = new Map(MINISTRY_PARAMETERS.map(p => [p.name, p]));

export const getParameter = (category) => PARAMETER_BY_NAME.get((category || '').trim()) || null;

const BASE_LABEL = { all: 'מסך התקציב השוטף', ministry: 'מכספי התמיכה' };

export function ruleLabel(param) {
  if (!param) return '';
  const base = BASE_LABEL[param.base] || '';
  const together = param.group ? 'יחד עם ' + MINISTRY_PARAMETERS
    .filter(p => p.group === param.group && p.name !== param.name)
    .map(p => p.short || p.name).join(', ') + ' — ' : '';
  if (param.min != null) return `${together}לפחות ${param.min}% ${base}`.trim();
  if (param.max != null) return `${together}עד ${param.max}% ${base}`.trim();
  return '';
}

/**
 * בדיקת ההגבלות של כל הפרמטרים מול התכנית כולה — תמיד על כל השורות, לא על
 * התצוגה, כי ההגבלות של המשרד הן על התקציב כולו.
 * @returns {Map<string, { pct: number, status: 'ok'|'below'|'above'|null }>} לפי שם פרמטר
 */
export function evaluateRules(items) {
  const totals = planTotals(items);
  const byName = new Map();
  for (const i of items) {
    const key = (i.category || '').trim();
    const e = byName.get(key) || { all: 0, ministry: 0 };
    e.all += itemTotal(i);
    e.ministry += num(i.ministry_amount);
    byName.set(key, e);
  }
  const out = new Map();
  for (const p of MINISTRY_PARAMETERS) {
    if (p.min == null && p.max == null) continue;
    const members = p.group ? MINISTRY_PARAMETERS.filter(x => x.group === p.group) : [p];
    const amount = members.reduce((s, m) => s + (byName.get(m.name)?.[p.what] || 0), 0);
    const base = p.base === 'ministry' ? totals.ministry : totals.total;
    const pct = base > 0 ? (amount / base) * 100 : 0;
    out.set(p.name, { pct, status: ruleStatus(p, pct, base > 0) });
  }
  return out;
}

/**
 * האם אחוז הפרמטר עומד בהגבלה שלו.
 * @returns {'ok'|'below'|'above'|null} null כשאין הגבלה או שאין עדיין סכומים בתכנית
 */
export function ruleStatus(param, pct, hasTotal) {
  if (!param || !hasTotal) return null;
  if (param.min != null && pct < param.min) return 'below';
  if (param.max != null && pct > param.max) return 'above';
  if (param.min == null && param.max == null) return null;
  return 'ok';
}

export const RULE_STATUS_LABELS = {
  ok: 'עומד בהגבלה',
  below: 'מתחת למינימום',
  above: 'מעל המקסימום',
};

export const PLAN_STATUSES = {
  draft: { label: 'טיוטה', className: 'bg-slate-100 text-slate-600' },
  submitted: { label: 'הוגשה למשרד', className: 'bg-blue-100 text-blue-700' },
  approved: { label: 'אושרה', className: 'bg-green-100 text-green-700' },
};

export const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

export const QUARTERS = [
  { value: 'q1', label: "רבעון א'", months: [1, 2, 3] },
  { value: 'q2', label: "רבעון ב'", months: [4, 5, 6] },
  { value: 'q3', label: "רבעון ג'", months: [7, 8, 9] },
  { value: 'q4', label: "רבעון ד'", months: [10, 11, 12] },
];

export const VIEWS = [
  { id: 'all', label: 'כל התכנית' },
  { id: 'municipal', label: 'תקציב עירוני' },
  { id: 'ministry', label: 'משרד התרבות' },
];

export const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const itemTotal = (item) => num(item.municipal_amount) + num(item.ministry_amount);

/** @param {number} [digits] ספרות אחרי הנקודה — 0 ללוח הניצול, שבו החלוקה לחודשים יוצרת שברים */
export const formatMoney = (v, digits = 2) => `₪${num(v).toLocaleString('he-IL', { maximumFractionDigits: digits })}`;

export const formatPct = (v) => `${(Math.round(num(v) * 10) / 10).toLocaleString('he-IL')}%`;

/**
 * החודשים (1-12) שבהם השורה מתוכננת לנצל תקציב.
 * טווח חודשים (מיגרציה 0013) קודם; שורות ישנות עם רבעונים בלבד (0012) נקראות
 * מהרבעונים. שורה בלי שניהם — מערך ריק, "לא נקבע".
 */
export function itemMonths(item) {
  const start = num(item?.utilization_start_month);
  const end = num(item?.utilization_end_month);
  if (start >= 1 && start <= 12) {
    const last = end >= start && end <= 12 ? end : start;
    return Array.from({ length: last - start + 1 }, (_, k) => start + k);
  }
  const quarters = Array.isArray(item?.quarters) ? item.quarters : [];
  return QUARTERS.filter(q => quarters.includes(q.value)).flatMap(q => q.months);
}

export function utilizationLabel(item) {
  const months = itemMonths(item);
  if (months.length === 0) return '';
  if (months.length === 12) return 'כל השנה';
  const first = months[0];
  const last = months[months.length - 1];
  const contiguous = last - first + 1 === months.length;
  if (months.length === 1) return MONTHS[first - 1];
  if (contiguous) return `${MONTHS[first - 1]}–${MONTHS[last - 1]}`;
  return months.map(m => MONTHS[m - 1]).join(', ');
}

/** עמודות הסכום שמוצגות בכל תצוגה: [{ key, label, value(item) }]. */
export function amountColumns(view) {
  const municipal = { key: 'municipal', label: 'תקציב עירוני', value: i => num(i.municipal_amount) };
  const ministry = { key: 'ministry', label: 'משרד התרבות', value: i => num(i.ministry_amount) };
  const total = { key: 'total', label: 'סה"כ', value: itemTotal };
  if (view === 'municipal') return [municipal];
  if (view === 'ministry') return [ministry];
  return [municipal, ministry, total];
}

/** הסכום של שורה בתצוגה הנתונה. */
export function viewAmount(item, view) {
  if (view === 'municipal') return num(item.municipal_amount);
  if (view === 'ministry') return num(item.ministry_amount);
  return itemTotal(item);
}

/**
 * השורות ששייכות לתצוגה. בתצוגה של גורם מממן אחד מוצגות רק שורות שיש להן
 * סכום אצל אותו גורם — שורה במימון עירוני בלבד לא תופיע בהגשה למשרד.
 */
export function itemsForView(items, view) {
  if (view === 'municipal') return items.filter(i => num(i.municipal_amount) > 0);
  if (view === 'ministry') return items.filter(i => num(i.ministry_amount) > 0);
  return items;
}

/**
 * קיבוץ לפי פרמטר. חמשת הפרמטרים של המשרד מופיעים תמיד, בסדר של הטופס — גם
 * בלי שורות — כדי שהתכנית תיראה כמו הטופס. קטגוריות אחרות (שורות ישנות עם
 * טקסט חופשי) מופיעות אחריהם, כדי ששום שורה לא תיעלם מהתצוגה.
 *
 * @returns {{ category, param, items, municipal, ministry, total }[]}
 */
export function groupByCategory(items, { includeEmpty = true } = {}) {
  const map = new Map();
  const ensure = (category) => {
    if (!map.has(category)) {
      map.set(category, { category, param: getParameter(category), items: [], municipal: 0, ministry: 0, total: 0 });
    }
    return map.get(category);
  };
  if (includeEmpty) MINISTRY_PARAMETERS.forEach(p => ensure(p.name));

  for (const item of items) {
    const g = ensure((item.category || 'ללא קטגוריה').trim());
    g.items.push(item);
    g.municipal += num(item.municipal_amount);
    g.ministry += num(item.ministry_amount);
    g.total += itemTotal(item);
  }

  const order = (g) => {
    const idx = MINISTRY_PARAMETERS.findIndex(p => p.name === g.category);
    return idx === -1 ? MINISTRY_PARAMETERS.length : idx;
  };
  const groups = [...map.values()].sort((a, b) => order(a) - order(b) || a.category.localeCompare(b.category, 'he'));
  for (const g of groups) g.items.sort((a, b) => num(a.sort_order) - num(b.sort_order));
  return groups;
}

export function planTotals(items) {
  return {
    municipal: items.reduce((s, i) => s + num(i.municipal_amount), 0),
    ministry: items.reduce((s, i) => s + num(i.ministry_amount), 0),
    total: items.reduce((s, i) => s + itemTotal(i), 0),
  };
}

/** סכום קבוצה בתצוגה הנתונה. */
export function groupAmount(group, view) {
  if (view === 'municipal') return group.municipal;
  if (view === 'ministry') return group.ministry;
  return group.total;
}

/**
 * שורות טופס המשרד לתצוגה: סכום, אחוז מסך התצוגה ועמידה בהגבלה לכל פרמטר.
 */
export function parameterRows(items, view) {
  const groups = groupByCategory(itemsForView(items, view));
  const total = groups.reduce((s, g) => s + groupAmount(g, view), 0);
  // ההגבלות נבדקות על התכנית כולה ומול הבסיס של כל אחת (evaluateRules), כך
  // שהעמידה בהן זהה בכל תצוגה; pct נשאר האחוז מסך התצוגה
  const rules = evaluateRules(items);
  const rows = groups.map(g => {
    const amount = groupAmount(g, view);
    const pct = total > 0 ? (amount / total) * 100 : 0;
    const r = rules.get(g.category);
    return { ...g, amount, pct, rule: ruleLabel(g.param), rulePct: r?.pct ?? null, status: r?.status ?? null };
  });
  return { rows, total };
}

/**
 * לוח ניצול חודשי: לכל פרמטר, כמה תקציב מתוכנן לכל חודש.
 *
 * סכום שורה מתחלק שווה בשווה בין החודשים בתקופת הניצול שלה — זו הנחה, כי השורה
 * לא אומרת כמה ינוצל בכל חודש. שורה בלי תקופה נספרת ב-unscheduled.
 *
 * @returns {{ groups: { category, months: number[12], unscheduled, total }[], months: number[12], unscheduled, total }}
 */
export function monthlySchedule(items, view) {
  const groups = groupByCategory(itemsForView(items, view)).map(g => {
    const months = Array(12).fill(0);
    let unscheduled = 0;
    for (const item of g.items) {
      const amount = viewAmount(item, view);
      const ms = itemMonths(item);
      if (ms.length === 0) { unscheduled += amount; continue; }
      for (const m of ms) months[m - 1] += amount / ms.length;
    }
    return { category: g.category, months, unscheduled, total: groupAmount(g, view) };
  });
  const months = Array.from({ length: 12 }, (_, k) => groups.reduce((s, g) => s + g.months[k], 0));
  return {
    groups,
    months,
    unscheduled: groups.reduce((s, g) => s + g.unscheduled, 0),
    total: groups.reduce((s, g) => s + g.total, 0),
  };
}

/**
 * מקורות התקציב שמקושרים לתכנית ורלוונטיים לתצוגה: בתצוגה עירונית רק המקור
 * העירוני, בתצוגת המשרד רק מקור המשרד, ובתצוגה המלאה שניהם (מיגרציה 0014).
 */
export function linkedSourceIds(plan, view) {
  const ids = [];
  if (view !== 'ministry' && plan?.municipal_budget_source_id) ids.push(plan.municipal_budget_source_id);
  if (view !== 'municipal' && plan?.ministry_budget_source_id) ids.push(plan.ministry_budget_source_id);
  return [...new Set(ids)];
}

/**
 * ביצוע בפועל מול התכנית: מה הוקצה / שוריין / נוצל במקורות התקציב המקושרים,
 * לכל פרמטר. קטגוריה בתקציב שייכת לפרמטר לפי work_plan_category; קטגוריות בלי
 * שיוך נאספות ב-unlinked, כדי שהוצאה לא תיעלם מהסיכום רק כי לא שויכה. מקור
 * בלי חלוקה לקטגוריות נספר רק ב-totals.
 *
 * @returns {{ byCategory: Map<string, {allocated, reserved, spent}>, unlinked: {allocated, reserved, spent, names: string[]}, totals: {allocated, reserved, spent}, budget: number }}
 */
export function budgetActuals(plan, sources, allocations, view) {
  const ids = linkedSourceIds(plan, view);
  const empty = () => ({ allocated: 0, reserved: 0, spent: 0 });
  const byCategory = new Map();
  const unlinked = { ...empty(), names: [] };
  const totals = empty();
  // מקור בלי חלוקה לקטגוריות (מיגרציה 0015) — הביצוע שלו נספר רק בסך הכולל,
  // כי ההזמנות בו לא מתחלקות לפרמטרים, ואין לו "קטגוריה לא משויכת" להציג
  const singleIds = new Set(sources.filter(s => s.uses_categories === false).map(s => s.id));
  for (const a of allocations) {
    if (!ids.includes(a.budget_source_id)) continue;
    if (singleIds.has(a.budget_source_id)) {
      totals.allocated += num(a.allocated_amount);
      totals.reserved += num(a.reserved_amount);
      totals.spent += num(a.spent_amount);
      continue;
    }
    // קטגוריה ששמה זהה לשם פרמטר נספרת תחתיו גם בלי שיוך מפורש — כמו ש-
    // sync_work_plan_budget מאמץ אותה לפי השם
    const key = (a.work_plan_category || '').trim() || (getParameter(a.name) ? a.name.trim() : '');
    const bucket = key ? (byCategory.get(key) || byCategory.set(key, empty()).get(key)) : unlinked;
    for (const t of [bucket, totals]) {
      t.allocated += num(a.allocated_amount);
      t.reserved += num(a.reserved_amount);
      t.spent += num(a.spent_amount);
    }
    if (!key) unlinked.names.push(a.name);
  }
  // כל הכסף במקורות המקושרים = סכום כל הקטגוריות שלהם (במקור בלי קטגוריות —
  // הקטגוריה היחידה, ששווה לסכום המקור). לא planned_amount: התכנית קוראת את
  // הכסף שבפועל זמין להזמנות, והסנכרון הישן דרס את planned_amount בסכומי התכנית.
  return { byCategory, unlinked, totals, budget: totals.allocated };
}

/**
 * מאילו קטגוריות תקציב יורדת כל שורה (מיגרציה 0017). לשורה נשמרות רק הקטגוריות
 * שנבחרו, לפי הסדר; החלוקה מחושבת כאן: עוברים על השורות לפי sort_order, וכל
 * שורה ממלאת את הקטגוריות שלה לפי הסדר, כל אחת עד מה שנשאר בה אחרי השורות
 * הקודמות. מה שלא נכנס הוא shortfall — "חסרים".
 *
 * @param {'municipal'|'ministry'} funder
 * @returns {{ byItem: Map<string, { splits: {id, amount}[], shortfall: number }>, used: Map<string, number> }}
 */
/** קטגוריות המקור ששויכו לפרמטר של השורה (budget_allocations.work_plan_category). */
export function parameterAllocations(item, allocations) {
  const cat = (item.category || '').trim();
  return allocations.filter(a => (a.work_plan_category || '').trim() === cat);
}

/**
 * הקטגוריות שהשורה יורדת מהן בפועל: מה שנבחר לה במפורש, ואם לא נבחר כלום —
 * כל הקטגוריות ששויכו לפרמטר שלה, לפי הסדר.
 */
export function effectiveAllocationIds(item, funder, allocations) {
  const ids = Array.isArray(item[`${funder}_allocation_ids`]) ? item[`${funder}_allocation_ids`] : [];
  return ids.length ? ids : parameterAllocations(item, allocations).map(a => a.id);
}

export function planAllocationSplits(items, allocations, funder) {
  const amountField = `${funder}_amount`;
  const capacity = new Map(allocations.map(a => [a.id, num(a.allocated_amount)]));
  const used = new Map();
  const byItem = new Map();
  const ordered = [...items].sort((a, b) => num(a.sort_order) - num(b.sort_order));
  for (const item of ordered) {
    const ids = effectiveAllocationIds(item, funder, allocations);
    if (ids.length === 0) continue;
    let left = num(item[amountField]);
    const splits = [];
    for (const id of ids) {
      if (!capacity.has(id)) continue; // קטגוריה שנמחקה או לא שייכת למקור המקושר
      const take = Math.min(Math.max(0, capacity.get(id) - (used.get(id) || 0)), left);
      splits.push({ id, amount: take });
      used.set(id, (used.get(id) || 0) + take);
      left -= take;
    }
    byItem.set(item.id, { splits, shortfall: Math.max(0, left) });
  }
  return { byItem, used };
}

/**
 * כמה מתוכנן בתכניות העבודה מכל קטגוריית תקציב — לתצוגה במסך מקורות תקציב.
 * לכל תכנית ולכל גורם מממן שלה: במקור מחולק לקטגוריות לפי planAllocationSplits,
 * ובמקור בלי קטגוריות (0015) כל סכום הגורם נספר על הקטגוריה היחידה.
 * טיוטה לא נספרת. תכנית שהוגשה נספרת ב-submitted (מתוכנן בלבד), ותכנית
 * שאושרה ב-approved — הסכום שיורד מהקטגוריה (ראה allocationCommitted).
 *
 * @returns {Map<string, { approved: number, submitted: number, plans: string[] }>} לפי budget_allocations.id
 */
export function plannedByAllocation(plans, itemsByPlan, sources, allocations) {
  const out = new Map();
  let bucket = 'approved';
  const add = (id, amount, title) => {
    if (amount <= 0.005) return;
    const e = out.get(id) || { approved: 0, submitted: 0, plans: [] };
    e[bucket] += amount;
    if (!e.plans.includes(title)) e.plans.push(title);
    out.set(id, e);
  };
  const funders = [
    { field: 'municipal_budget_source_id', funder: 'municipal' },
    { field: 'ministry_budget_source_id', funder: 'ministry' },
  ];
  for (const plan of plans) {
    if (plan.status !== 'approved' && plan.status !== 'submitted') continue;
    bucket = plan.status;
    const items = itemsByPlan.get(plan.id) || [];
    const title = `${plan.title}${plan.year ? ` (${plan.year})` : ''} — ${plan.status === 'approved' ? 'אושרה' : 'הוגשה'}`;
    for (const { field, funder } of funders) {
      const source = sources.find(s => s.id === plan[field]);
      if (!source) continue;
      const allocs = allocations.filter(a => a.budget_source_id === source.id);
      if (source.uses_categories === false) {
        if (allocs[0]) add(allocs[0].id, items.reduce((s, i) => s + num(i[`${funder}_amount`]), 0), title);
        continue;
      }
      const { byItem } = planAllocationSplits(items, allocs, funder);
      for (const { splits } of byItem.values()) for (const s of splits) add(s.id, s.amount, title);
    }
  }
  return out;
}

/**
 * כמה יורד מקטגוריה לפי סטטוס התכניות: טיוטה — כלום; הוגשה למשרד — משוריין;
 * אושרה — נוצל. הזמנות של הפעילויות יורדות מתוך התכנית ולא פעם נוספת, ולכן
 * הסך שיורד הוא הגבוה מבין סכום התכניות לבין מה שההזמנות שריינו/ניצלו; הזמנה
 * מעבר לתכנית מורידה רק את מה שמעבר.
 *   committed — כל מה שיורד; יתרה = מוקצה − committed
 *   spentShown — "נוצל": התכנית המאושרת, או מה שהזמנות ניצלו אם זה יותר
 *   reservedShown — "משוריין": השאר (תכנית שהוגשה + הזמנות פתוחות מעבר)
 *   leftInPlan — מה שנשאר בתכניות להזמנות
 * תצוגה בלבד — הבדיקה של הזמנה (מוקצה − משוריין − נוצל של ההזמנות) לא
 * משתנה, כי הכסף שבתכנית נועד בדיוק להזמנות האלה.
 */
export function allocationCommitted(alloc, approvedPlanned, submittedPlanned = 0) {
  const approved = num(approvedPlanned);
  const plan = approved + num(submittedPlanned);
  const orders = num(alloc.reserved_amount) + num(alloc.spent_amount);
  const committed = Math.max(plan, orders);
  const spentShown = Math.min(committed, Math.max(approved, num(alloc.spent_amount)));
  return {
    committed,
    spentShown,
    reservedShown: committed - spentShown,
    leftInPlan: Math.max(0, plan - orders),
  };
}

/**
 * מצב מקור תקציב אחד אחרי כל התכניות המאושרות — אותו חשבון בדיוק כמו במסך
 * מקורות תקציב, כדי ששני המסכים יראו את אותה יתרה. מקבל את קטגוריות המקור
 * ואת התוצאה של plannedByAllocation.
 * יתרה = מוקצה − משוריין − נוצל, כשמשוריין כולל את התכניות המאושרות.
 */
export function sourceLedger(allocs, planned) {
  const out = { allocated: 0, reserved: 0, spent: 0, balance: 0, approved: 0, submitted: 0, plans: [] };
  for (const a of allocs) {
    const e = planned.get(a.id);
    const c = allocationCommitted(a, e?.approved || 0, e?.submitted || 0);
    out.allocated += num(a.allocated_amount);
    out.spent += c.spentShown;
    out.reserved += c.reservedShown;
    out.balance += Math.max(0, num(a.allocated_amount) - c.committed);
    out.approved += e?.approved || 0;
    out.submitted += e?.submitted || 0;
    for (const p of e?.plans || []) if (!out.plans.includes(p)) out.plans.push(p);
  }
  return out;
}

/**
 * הסכום המקסימלי שהשורה יכולה לקבל מהקטגוריות שלה: מה שפנוי בהן אחרי כל
 * השורות האחרות. null — לשורה אין קטגוריות, ואין הגבלה.
 */
export function rowAllocationLimit(item, funder, allocations, splits) {
  const ids = effectiveAllocationIds(item, funder, allocations);
  if (ids.length === 0) return null;
  const own = new Map((splits.byItem.get(item.id)?.splits || []).map(s => [s.id, s.amount]));
  return ids.reduce((sum, id) => {
    const a = allocations.find(x => x.id === id);
    if (!a) return sum;
    const usedByOthers = (splits.used.get(id) || 0) - (own.get(id) || 0);
    return sum + Math.max(0, num(a.allocated_amount) - usedByOthers);
  }, 0);
}

/**
 * כותרות לוח הניצול באחוזי שנה: כל חודש הוא 100/12, והכותרת היא האחוז המצטבר
 * בסופו — 8.3%, 16.7%, 25% ... 100%. עמודה אחת לכל חודש, אותם סכומים.
 */
export const YEAR_PCT_LABELS = MONTHS.map((_, k) => formatPct(((k + 1) * 100) / 12));
