/**
 * תכנית עבודה שנתית — חישובים משותפים לדף, לייצוא ל-Excel ולתצוגת ההדפסה.
 *
 * התכנית בנויה לפי טופס "תכנון התקציב של הספריות הציבוריות" של משרד התרבות:
 * חמישה פרמטרים קבועים, לכל אחד הגבלת אחוז (מינימום או מקסימום). מתחת לכל
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
export const MINISTRY_PARAMETERS = [
  { name: 'רכש ספרים, כתבי עת, מדיה ומאגרי מידע', min: 40 },
  { name: 'פעילות תרבות', min: 25 },
  { name: 'רכש מחשבים, תוכנות, ריהוט וציוד משרדי' },
  { name: 'פעולות לשיווק, פרסום ומיתוג הספרייה', max: 10 },
  { name: 'השתלמויות והכשרות מקצועיות למנהלי ספריות וספרנים', max: 10 },
];

const PARAMETER_BY_NAME = new Map(MINISTRY_PARAMETERS.map(p => [p.name, p]));

export const getParameter = (category) => PARAMETER_BY_NAME.get((category || '').trim()) || null;

export function ruleLabel(param) {
  if (!param) return '';
  if (param.min != null) return `לא יפחת מ-${param.min}%`;
  if (param.max != null) return `לא יעלה על ${param.max}%`;
  return '';
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
  const rows = groups.map(g => {
    const amount = groupAmount(g, view);
    const pct = total > 0 ? (amount / total) * 100 : 0;
    return { ...g, amount, pct, rule: ruleLabel(g.param), status: ruleStatus(g.param, pct, total > 0) };
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

/** צבירה של לוח חודשי לרבעונים. */
export const toQuarters = (months) => QUARTERS.map(q => q.months.reduce((s, m) => s + months[m - 1], 0));
