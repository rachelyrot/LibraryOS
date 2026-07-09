export const EMPLOYMENT_TYPE_LABELS = {
  permanent: 'עובדת קבועה',
  temporary: 'עובדת זמנית',
  substitute: 'ממלאת מקום',
  volunteer: 'מתנדבת',
  student: 'סטודנטית / מתלמדת',
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

export function fullName(emp) {
  if (!emp) return '-';
  return `${emp.first_name || ''} ${emp.last_name || ''}`.trim();
}