export const PROJECT_TYPE_LABELS = {
  establishment: 'הקמת ספרייה',
  renovation: 'שיפוץ / בינוי',
  large_purchase: 'רכש גדול',
  annual_plan: 'תוכנית עבודה שנתית',
  operational: 'פרויקט תפעולי',
  it: 'מחשוב / תכנות',
  hr: 'כוח אדם',
  other: 'אחר',
};

export const PROJECT_STATUS_LABELS = {
  draft: 'טיוטה',
  planning: 'בתכנון',
  active: 'פעיל',
  on_hold: 'בהמתנה',
  completed: 'הושלם',
  cancelled: 'בוטל',
};

export const PROJECT_STATUS_COLORS = {
  draft: 'bg-gray-100 text-gray-700',
  planning: 'bg-blue-100 text-blue-700',
  active: 'bg-green-100 text-green-700',
  on_hold: 'bg-amber-100 text-amber-700',
  completed: 'bg-purple-100 text-purple-700',
  cancelled: 'bg-red-100 text-red-700',
};

export const PRIORITY_LABELS = {
  high: 'גבוהה',
  medium: 'בינונית',
  low: 'נמוכה',
};

export const PRIORITY_COLORS = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-green-100 text-green-700',
};

export const TASK_STATUS_LABELS = {
  not_started: 'לא התחיל',
  in_progress: 'בתהליך',
  waiting_approval: 'ממתין לאישור',
  waiting_external: 'ממתין לגורם חיצוני',
  completed: 'הושלם',
  cancelled: 'בוטל',
  stuck: 'תקוע',
};

export const TASK_STATUS_COLORS = {
  not_started: 'bg-gray-100 text-gray-700',
  in_progress: 'bg-blue-100 text-blue-700',
  waiting_approval: 'bg-purple-100 text-purple-700',
  waiting_external: 'bg-amber-100 text-amber-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
  stuck: 'bg-red-100 text-red-700',
};

export const MILESTONE_STATUS_LABELS = {
  not_started: 'לא התחיל',
  in_progress: 'בתהליך',
  completed: 'הושלם',
  stuck: 'תקוע',
};

export const MILESTONE_STATUS_COLORS = {
  not_started: 'bg-gray-100 text-gray-700',
  in_progress: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  stuck: 'bg-red-100 text-red-700',
};

export const DOMAIN_STATUS_LABELS = {
  active: 'פעיל',
  inactive: 'לא פעיל',
};

export const DOMAIN_STATUS_COLORS = {
  active: 'bg-green-100 text-green-700',
  inactive: 'bg-gray-100 text-gray-700',
};

export const CONTACT_TYPE_LABELS = {
  responsible: 'אחראי',
  partner: 'שותף',
  executor: 'גורם מבצע',
  other: 'אחר',
};

export const CONTACT_TYPE_COLORS = {
  responsible: 'bg-purple-100 text-purple-700',
  partner: 'bg-blue-100 text-blue-700',
  executor: 'bg-amber-100 text-amber-700',
  other: 'bg-gray-100 text-gray-700',
};

export const DEFAULT_DOMAINS = [
  'בינוי',
  'יועצים ואדריכלים',
  'ריהוט',
  'ציוד כללי',
  'רכש כללי',
  'פרסום ושיווק',
  'עיצוב ושילוט',
  'תכנות / מערכות',
  'כוח אדם',
  'תקציב ואישורים',
  'פתיחה והרצה',
  'אחר',
];

export const DEFAULT_SUBDOMAINS = {
  'בינוי': ['עבודות הכנה', 'חשמל', 'מיזוג', 'נגישות', 'בטיחות', 'ניקיון והכנה לפתיחה'],
  'יועצים ואדריכלים': ['אדריכלות', 'ייעוץ בטיחות', 'ייעוץ נגישות', 'פיקוח', 'אישורים'],
  'ריהוט': ['מדפים', 'שולחנות', 'כיסאות', 'דלפק', 'ריהוט ילדים'],
  'פרסום ושיווק': ['מודעות', 'שילוט', 'אירוע פתיחה', 'פרסום עירוני', 'חומרים גרפיים'],
};

export const PROJECT_DOMAINS = DEFAULT_DOMAINS;

export const GOAL_STATUS_LABELS = {
  not_started: 'לא התחיל',
  in_progress: 'בתהליך',
  achieved: 'הושג',
  missed: 'לא הושג',
};

export const GOAL_STATUS_COLORS = {
  not_started: 'bg-gray-100 text-gray-700',
  in_progress: 'bg-blue-100 text-blue-700',
  achieved: 'bg-green-100 text-green-700',
  missed: 'bg-red-100 text-red-700',
};

export function formatDate(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('he-IL');
}

export function daysUntil(dateStr) {
  if (!dateStr) return null;
  const target = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((target - today) / (1000 * 60 * 60 * 24));
  return diff;
}

export function isOverdue(dateStr, status) {
  if (!dateStr || status === 'completed' || status === 'cancelled') return false;
  return daysUntil(dateStr) < 0;
}

export function formatCurrency(amount) {
  if (amount == null) return '₪0';
  return '₪' + Number(amount).toLocaleString('he-IL');
}

/**
 * אבני הדרך שנגזרות מהמשימות: כל משימה שהגיעה ל"הושלם" היא אבן דרך שהושגה
 * (מיגרציה 0025). באותה צורה כמו שורת project_milestones, כדי שכל מקום שמציג
 * אבני דרך יציג גם אותן; from_task מסמן שהיא נגזרת ולא נערכת ישירות.
 * החדשות קודם.
 */
export function taskMilestones(tasks) {
  return (tasks || [])
    .filter(t => t.status === 'completed')
    .map(t => ({
      id: `task-${t.id}`,
      from_task: true,
      task_id: t.id,
      name: t.task_description,
      related_domain: [t.domain, t.sub_domain].filter(Boolean).join(' · '),
      responsible: t.assignee || '',
      target_date: t.due_date || null,
      completed_date: t.completed_date || (t.updated_date ? String(t.updated_date).slice(0, 10) : null),
      status: 'completed',
      is_completed: true,
      progress_percentage: 100,
      notes: t.notes || '',
    }))
    .sort((a, b) => String(b.completed_date || '').localeCompare(String(a.completed_date || '')));
}

export function calcProgress(tasks) {
  if (!tasks || tasks.length === 0) return 0;
  const total = tasks.reduce((sum, t) => sum + (t.progress_percentage || 0), 0);
  return Math.round(total / tasks.length);
}