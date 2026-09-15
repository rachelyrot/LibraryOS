/**
 * תכנית עבודה שנתית — חישובים משותפים לדף, לייצוא ל-Excel ולתצוגת ההדפסה.
 *
 * כל שורה בתכנית היא פעילות אחת עם שני סכומים: עירוני ומשרד התרבות. "תצוגה"
 * (view) קובעת איזה חלק מהתכנית מוצג — הכל, רק החלק העירוני או רק החלק של
 * המשרד — כך שאותן שורות משמשות גם לתכנית המלאה וגם להגשה נפרדת לכל גורם.
 * כל שלושת הפלטים (מסך, Excel, הדפסה) עוברים דרך הפונקציות כאן, כדי שהסכומים
 * יהיו זהים בכולם.
 */

export const PLAN_STATUSES = {
  draft: { label: 'טיוטה', className: 'bg-slate-100 text-slate-600' },
  submitted: { label: 'הוגשה למשרד', className: 'bg-blue-100 text-blue-700' },
  approved: { label: 'אושרה', className: 'bg-green-100 text-green-700' },
};

export const QUARTERS = [
  { value: 'q1', label: "רבעון א'" },
  { value: 'q2', label: "רבעון ב'" },
  { value: 'q3', label: "רבעון ג'" },
  { value: 'q4', label: "רבעון ד'" },
];

/** קטגוריות שמוצעות תמיד, בנוסף לקטגוריות הראשיות שמוגדרות בהגדרות. */
export const SUGGESTED_CATEGORIES = ['ספרים', 'רכש', 'פעילות', 'ציוד', 'תחזוקה', 'הדרכות והשתלמויות'];

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

export const formatMoney = (v) => `₪${num(v).toLocaleString('he-IL')}`;

export function quartersLabel(quarters) {
  const list = Array.isArray(quarters) ? quarters : [];
  if (list.length === 0) return '';
  if (list.length === QUARTERS.length) return 'כל השנה';
  return QUARTERS.filter(q => list.includes(q.value)).map(q => q.label).join(', ');
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

/**
 * השורות ששייכות לתצוגה. בתצוגה של גורם מממן אחד מוצגות רק פעילויות שיש להן
 * סכום אצל אותו גורם — פעילות במימון עירוני בלבד לא תופיע בהגשה למשרד.
 */
export function itemsForView(items, view) {
  if (view === 'municipal') return items.filter(i => num(i.municipal_amount) > 0);
  if (view === 'ministry') return items.filter(i => num(i.ministry_amount) > 0);
  return items;
}

/** הסכום של שורה בתצוגה הנתונה — העמודה האחרונה ב-amountColumns. */
export function viewAmount(item, view) {
  const cols = amountColumns(view);
  return cols[cols.length - 1].value(item);
}

/**
 * קיבוץ לפי קטגוריה, בסדר קבוע (א-ב), עם סכומי ביניים.
 * @returns {{ category: string, items: object[], municipal: number, ministry: number, total: number }[]}
 */
export function groupByCategory(items) {
  const map = new Map();
  for (const item of items) {
    const key = (item.category || 'ללא קטגוריה').trim();
    if (!map.has(key)) map.set(key, { category: key, items: [], municipal: 0, ministry: 0, total: 0 });
    const g = map.get(key);
    g.items.push(item);
    g.municipal += num(item.municipal_amount);
    g.ministry += num(item.ministry_amount);
    g.total += itemTotal(item);
  }
  const groups = [...map.values()].sort((a, b) => a.category.localeCompare(b.category, 'he'));
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
