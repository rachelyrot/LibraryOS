export const EMPLOYMENT_TYPE_LABELS = {
  permanent: 'עובדת קבועה',
  temporary: 'עובדת זמנית',
  substitute: 'ממלאת מקום',
  volunteer: 'מתנדבת',
  student: 'סטודנטית / מתלמדת',
  other: 'אחר',
};

// Separate from EMPLOYMENT_TYPE_LABELS (employment *status*) — this is *who
// employs* the person, an independent categorization.
export const EMPLOYER_TYPE_LABELS = {
  chakal: 'חכ"ל',
  municipality: 'עירייה',
  other: 'אחר',
};

export const EMPLOYEE_STATUS_LABELS = {
  active: 'פעילה',
  on_leave: 'בחופשה',
  ended: 'סיימה עבודה',
  inactive: 'לא פעילה',
};

export const EMPLOYEE_STATUS_COLORS = {
  active: 'bg-green-100 text-green-700',
  on_leave: 'bg-amber-100 text-amber-700',
  ended: 'bg-red-100 text-red-700',
  inactive: 'bg-gray-100 text-gray-700',
};

export const VOLUNTEER_ACTIVITY_LABELS = {
  book_arrangement: 'סידור ספרים',
  event_help: 'עזרה באירועים',
  reading_to_children: 'קריאה לילדים',
  technical_help: 'עזרה טכנית',
  other: 'אחר',
};

export const VOLUNTEER_STATUS_LABELS = {
  active: 'פעילה',
  waiting: 'בהמתנה',
  inactive: 'לא פעילה',
};

export const VOLUNTEER_STATUS_COLORS = {
  active: 'bg-green-100 text-green-700',
  waiting: 'bg-amber-100 text-amber-700',
  inactive: 'bg-gray-100 text-gray-700',
};

export const SHIFT_TYPE_LABELS = {
  morning: 'בוקר',
  afternoon: 'אחר צהריים',
  evening: 'ערב',
  full_day: 'יום מלא',
  replacement: 'החלפה',
  reinforcement: 'תגבור',
  volunteer: 'התנדבות',
  special_event: 'אירוע מיוחד',
};

export const SHIFT_TYPE_COLORS = {
  morning: 'bg-yellow-100 text-yellow-700',
  afternoon: 'bg-orange-100 text-orange-700',
  evening: 'bg-indigo-100 text-indigo-700',
  full_day: 'bg-blue-100 text-blue-700',
  replacement: 'bg-amber-100 text-amber-700',
  reinforcement: 'bg-purple-100 text-purple-700',
  volunteer: 'bg-green-100 text-green-700',
  special_event: 'bg-pink-100 text-pink-700',
};

export const SCHEDULE_STATUS_LABELS = {
  planned: 'מתוכנן',
  approved: 'אושר',
  completed: 'בוצע',
  cancelled: 'בוטל',
};

export const SCHEDULE_STATUS_COLORS = {
  planned: 'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  completed: 'bg-blue-100 text-blue-700',
  cancelled: 'bg-red-100 text-red-700',
};

export const ATTENDANCE_STATUS_LABELS = {
  present: 'נכחה',
  late: 'איחור',
  absent: 'חיסור',
  early_leave: 'יציאה מוקדמת',
  vacation: 'חופשה',
};

export const ATTENDANCE_STATUS_COLORS = {
  present: 'bg-green-100 text-green-700',
  late: 'bg-amber-100 text-amber-700',
  absent: 'bg-red-100 text-red-700',
  early_leave: 'bg-orange-100 text-orange-700',
  vacation: 'bg-blue-100 text-blue-700',
};

export const BRANCH_STATUS_LABELS = {
  active: 'פעיל',
  inactive: 'לא פעיל',
};

export const DAY_LABELS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
export const WEEKDAY_LABELS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי'];

export function getDayName(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr + 'T00:00:00');
  return DAY_LABELS[date.getDay()] || '';
}

export function calcShiftHours(start, end) {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let diff = (eh * 60 + em) - (sh * 60 + sm);
  if (diff < 0) diff += 24 * 60;
  return Math.round((diff / 60) * 10) / 10;
}

export function getWeekDates(referenceDate) {
  const ref = referenceDate ? new Date(referenceDate + 'T00:00:00') : new Date();
  const day = ref.getDay();
  const sunday = new Date(ref);
  sunday.setDate(ref.getDate() - day);
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

export function formatDate(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('he-IL');
}

// ── היקף משרה ↔ שעות ─────────────────────────────────────────────────────────
// 100% משרה = 40 שעות שבועיות. האחוז הוא המקור: השעות תמיד נגזרות ממנו
// (50% = 20 ש', 25% = 10 ש'), כדי שבשום מקום לא יוצגו אחוז ושעות שלא מסתדרים.
// רשומה ישנה בלי אחוז נקראת מהשעות שלה. סיכומים — במשרות מלאות (2.5 משרות =
// 250% = 100 ש'), כי שני תקנים של חצי משרה הם משרה אחת, לא שני אנשים.
export const FULL_TIME_HOURS = 40;
const round1 = (n) => Math.round(n * 10) / 10;
const num = (v) => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v));

export const pctToHours = (pct) => round1((num(pct) ?? 0) * FULL_TIME_HOURS / 100);
export const hoursToPct = (hours) => round1((num(hours) ?? 0) / FULL_TIME_HOURS * 100);

/** אחוז משרה של תקן אחד (בלי approved_count). תקן בלי אחוז ובלי שעות — 100%. */
export function positionPct(p) {
  if (num(p?.scope_percentage) != null) return num(p.scope_percentage);
  if (num(p?.weekly_hours_approved)) return hoursToPct(p.weekly_hours_approved);
  return 100;
}
/** כל התקנים בשורה יחד — אחוז × מספר תקנים. */
export const positionTotalPct = (p) => positionPct(p) * (num(p?.approved_count) || 1);
export const positionTotalHours = (p) => pctToHours(positionTotalPct(p));

/** אחוז משרה של עובדת. בלי אחוז — מהשעות שלה; בלי שניהם — 0. */
export function employeePct(e) {
  if (num(e?.scope_percentage) != null) return num(e.scope_percentage);
  return num(e?.weekly_hours) ? hoursToPct(e.weekly_hours) : 0;
}
export const employeeHours = (e) => pctToHours(employeePct(e));

/** "50% · 20 ש'" */
export const formatScope = (pct) => `${round1(pct)}% · ${pctToHours(pct)} ש'`;
/** סך אחוזים כמשרות מלאות: 250 → "2.5 משרות" */
export function formatFte(pct) {
  const fte = Math.round((num(pct) ?? 0) / 100 * 100) / 100;
  return fte === 1 ? 'משרה אחת' : `${fte.toLocaleString('he-IL')} משרות`;
}

export function fullName(emp) {
  if (!emp) return '-';
  return `${emp.first_name || ''} ${emp.last_name || ''}`.trim();
}