import { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Plus, Trash2, FileSpreadsheet, Printer, ClipboardList, Copy, CheckCircle2, AlertTriangle, CalendarRange, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import PageHeader from '@/components/PageHeader';
import WorkPlanGrid from '@/components/workPlan/WorkPlanGrid';
import { canViewWorkPlan, canEditWorkPlan, canViewBudgets } from '@/lib/permissions';
import {
  PLAN_STATUSES, MONTHS, RULE_STATUS_LABELS, amountColumns, itemsForView, groupByCategory,
  groupAmount, planTotals, parameterRows, monthlySchedule, YEAR_PCT_LABELS, planAllocationSplits, plannedByAllocation, projectCommitments, mergeCommitments, sourceLedger, formatMoney, formatPct, num,
  linkedSourceIds, budgetActuals, planSources, planSourceIds, planViews, legacyAmounts, itemTotal, amountOf,
} from '@/lib/workPlan';
import { exportWorkPlanExcel, printWorkPlan } from '@/lib/workPlanExport';

const NO_COPY = '__none__';

// צבע לכל כרטיס מקור, לפי הסדר בתכנית
const ACCENTS = [
  { accent: 'text-sky-600', bar: 'border-t-sky-400' },
  { accent: 'text-violet-600', bar: 'border-t-violet-400' },
  { accent: 'text-emerald-600', bar: 'border-t-emerald-400' },
  { accent: 'text-amber-600', bar: 'border-t-amber-400' },
  { accent: 'text-rose-600', bar: 'border-t-rose-400' },
  { accent: 'text-teal-600', bar: 'border-t-teal-400' },
];

const sourceName = (s) => `${s.name}${s.year ? ` · ${s.year}` : ''}`;

function RuleBadge({ status }) {
  if (!status) return <span className="text-xs text-muted-foreground">-</span>;
  const ok = status === 'ok';
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap', ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600')}>
      {ok ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
      {RULE_STATUS_LABELS[status]}
    </span>
  );
}

export default function WorkPlan() {
  const [user, setUser] = useState(null);
  const [plans, setPlans] = useState([]);
  const [activePlanId, setActivePlanId] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [view, setView] = useState('all');
  const [scheduleMode, setScheduleMode] = useState('percent');
  const [budgetSources, setBudgetSources] = useState([]);
  const [allocations, setAllocations] = useState([]);

  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [planForm, setPlanForm] = useState({ year: '', title: '', copyFrom: NO_COPY });
  const [savingPlan, setSavingPlan] = useState(false);

  const canEdit = canEditWorkPlan(user);
  const activePlan = plans.find(p => p.id === activePlanId) || null;

  const loadPlans = async (selectId) => {
    try {
      const list = await base44.entities.WorkPlan.list('-year', 50);
      setPlans(list);
      // ברירת המחדל היא תכנית השנה הנוכחית, לא האחרונה שנוצרה (שעשויה להיות של
      // השנה הבאה). אין לשנה הנוכחית תכנית — האחרונה שלפניה, ואם אין — הראשונה.
      const thisYear = new Date().getFullYear();
      const byYear = (p) => Number(p.year) || 0;
      const current = list.find(p => byYear(p) === thisYear)
        || list.filter(p => byYear(p) && byYear(p) < thisYear).sort((a, b) => byYear(b) - byYear(a))[0]
        || list[0];
      setActivePlanId(selectId || current?.id || null);
      setLoadError(null);
    } catch (e) {
      // הטבלה לא קיימת עדיין — מיגרציה 0012 לא הורצה
      setLoadError(e?.message || 'שגיאה בטעינת תכניות העבודה');
    } finally {
      setLoading(false);
    }
  };

  // הביצוע בפועל מגיע ממקורות התקציב; כשל כאן לא מפיל את התכנית עצמה
  const loadBudget = async () => {
    try {
      const [srcs, allocs] = await Promise.all([
        base44.entities.BudgetSource.list('-created_date', 200),
        base44.entities.BudgetAllocation.list('name', 2000),
      ]);
      setBudgetSources(srcs);
      setAllocations(allocs);
    } catch {
      setBudgetSources([]);
      setAllocations([]);
    }
    // פרויקטים שיורדים מאותם מקורות — לאותו חשבון כמו במקורות תקציב
    base44.entities.Project.list('-created_date', 500).then(setProjects).catch(() => setProjects([]));
  };
  const [projects, setProjects] = useState([]);

  useEffect(() => {
    base44.auth.me().then(u => {
      setUser(u);
      if (canViewWorkPlan(u)) {
        loadPlans();
        if (canViewBudgets(u)) loadBudget();
      } else setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  // הוצאות והזמנות נרשמות במסך אחר (מקורות תקציב / הזמנות) — טוענים מחדש בכל
  // חזרה ללשונית, כדי שהניצול כאן לא יישאר תקוע על מה שנטען בפתיחת הדף
  useEffect(() => {
    if (!canViewBudgets(user)) return;
    const refresh = () => { if (document.visibilityState === 'visible') loadBudget(); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [user]);

  useEffect(() => {
    if (!activePlanId) { setItems([]); return; }
    base44.entities.WorkPlanItem.filter({ work_plan_id: activePlanId }, 'sort_order', 2000)
      .then(setItems)
      .catch(() => setItems([]));
  }, [activePlanId]);

  // שורות של שאר התכניות (שהוגשו/אושרו ומקושרות למקור) — כדי שהיתרה בכרטיס
  // המקור תחשב גם תכניות אחרות שמשריינות מאותו מקור, כמו במסך מקורות תקציב
  const [otherItems, setOtherItems] = useState(() => new Map());
  const otherPlanIds = plans
    .filter(p => p.id !== activePlanId && (p.status === 'approved' || p.status === 'submitted')
      && planSourceIds(p).length > 0)
    .map(p => p.id).join(',');
  useEffect(() => {
    const ids = otherPlanIds ? otherPlanIds.split(',') : [];
    Promise.all(ids.map(id => base44.entities.WorkPlanItem.filter({ work_plan_id: id }, 'sort_order', 2000)))
      .then(lists => setOtherItems(new Map(ids.map((id, k) => [id, lists[k]]))))
      .catch(() => setOtherItems(new Map()));
  }, [otherPlanIds]);
  const plannedAll = useMemo(() => {
    const byPlan = new Map(otherItems);
    if (activePlanId) byPlan.set(activePlanId, items);
    return mergeCommitments(
      plannedByAllocation(plans, byPlan, budgetSources, allocations),
      projectCommitments(projects, budgetSources, allocations),
    );
  }, [otherItems, items, activePlanId, plans, budgetSources, allocations, projects]);

  // מקורות התכנית — כמה שצריך, כל אחד נבחר מתוך מקורות התקציב (מיגרציה 0020).
  // source — שורת המקור ממקורות התקציב (חסרה אם המקור נמחק משם)
  const planSrcList = useMemo(() => planSources(activePlan), [activePlan]);
  const supportIds = useMemo(() => planSrcList.filter(s => s.support).map(s => s.source_id), [planSrcList]);
  const sources = useMemo(() => planSrcList.map((ps, k) => {
    const source = budgetSources.find(s => s.id === ps.source_id);
    return { id: ps.source_id, support: !!ps.support, source, name: source ? sourceName(source) : `מקור ${k + 1}`, ...ACCENTS[k % ACCENTS.length] };
  }), [planSrcList, budgetSources]);
  const views = planViews(sources);
  // מקור שהוסר מהתכנית — חוזרים לכל התכנית
  useEffect(() => { if (view !== 'all' && !planSrcList.some(s => s.source_id === view)) setView('all'); }, [view, planSrcList]);

  // שורה שנערכה או נוספה בתצוגה של מקור אחד נשארת גלויה גם כשהסכום שלה שם
  // עדיין/כבר 0, כדי שלא תיעלם מתחת ליד באמצע עריכה. מתאפס במעבר תצוגה.
  const [pinnedIds, setPinnedIds] = useState(() => new Set());
  useEffect(() => { setPinnedIds(new Set()); }, [view, activePlanId]);
  const groups = useMemo(() => {
    const visible = new Set(itemsForView(items, view).map(i => i.id));
    return groupByCategory(items.filter(i => visible.has(i.id) || pinnedIds.has(i.id)));
  }, [items, view, pinnedIds]);
  const totals = useMemo(() => planTotals(items, supportIds), [items, supportIds]);
  const form = useMemo(() => parameterRows(items, view, supportIds), [items, view, supportIds]);
  const schedule = useMemo(() => monthlySchedule(items, view), [items, view]);
  const cols = amountColumns(view, sources);
  const viewLabel = views.find(v => v.id === view)?.label;
  const violations = form.rows.filter(r => r.status === 'below' || r.status === 'above');
  const hasLinkedSources = linkedSourceIds(activePlan, view).length > 0;
  const actuals = useMemo(() => budgetActuals(activePlan, budgetSources, allocations, view), [activePlan, budgetSources, allocations, view]);
  const actualUsed = actuals.totals.reserved + actuals.totals.spent;
  // מאילו קטגוריות יורדת כל שורה — רק למקור שמחולק לקטגוריות. מקור בלי
  // קטגוריות (0015) הוא סכום אחד ואין בו מה לבחור.
  const funding = useMemo(() => {
    const out = {};
    for (const s of sources) {
      if (!s.source || s.source.uses_categories === false) continue;
      const options = allocations.filter(a => a.budget_source_id === s.id);
      out[s.id] = { options, splits: planAllocationSplits(items, options, s.id) };
    }
    return out;
  }, [sources, allocations, items]);

  // כמה כסף יש בכל מקור (סכום הקטגוריות שלו) מול כמה התכנית מתכננת ממנו —
  // לבדיקת חריגה בכל שורה, גם במקור בלי קטגוריות ובשורה בלי קטגוריות
  const sourceBudgets = useMemo(() => {
    const out = {};
    for (const s of sources) {
      if (!s.source) continue;
      const available = allocations.filter(a => a.budget_source_id === s.id)
        .reduce((sum, a) => sum + (Number(a.allocated_amount) || 0), 0);
      out[s.id] = { available, planned: totals.bySource[s.id] || 0, name: s.name };
    }
    return out;
  }, [sources, allocations, totals]);

  // שתי תצוגות של אותם סכומים חודשיים: אחוזים — הכותרות הן אחוז השנה (כל חודש
  // 100/12, דצמבר = 100%); חודשים — שמות החודשים
  const scheduleColumns = (scheduleMode === 'percent' ? YEAR_PCT_LABELS : MONTHS)
    .map((label, k) => ({ label, value: row => row.months[k] }));

  // ── Plans ────────────────────────────────────────────────────
  const openNewPlan = () => {
    const nextYear = String(new Date().getFullYear() + 1);
    setPlanForm({ year: nextYear, title: `תכנון התקציב של הספרייה לשנת ${nextYear}`, copyFrom: plans[0]?.id || NO_COPY });
    setPlanDialogOpen(true);
  };

  const createPlan = async () => {
    if (!canEditWorkPlan(user)) return;
    if (!planForm.year.trim() || !planForm.title.trim()) { toast.error('יש להזין שנה וכותרת'); return; }
    setSavingPlan(true);
    try {
      // תכנית שמועתקת לוקחת גם את המקורות, כי הסכומים בשורות שמורים לפיהם
      const copyPlan = plans.find(p => p.id === planForm.copyFrom);
      const created = await base44.entities.WorkPlan.create({
        year: planForm.year.trim(), title: planForm.title.trim(), status: 'draft',
        ...(copyPlan ? { sources: planSources(copyPlan) } : {}),
      });
      if (planForm.copyFrom !== NO_COPY) {
        const source = await base44.entities.WorkPlanItem.filter({ work_plan_id: planForm.copyFrom }, 'sort_order', 2000);
        if (source.length) {
          await base44.entities.WorkPlanItem.bulkCreate(source.map(({ id, created_date, updated_date, work_plan_id, ...rest }) => ({
            ...rest, work_plan_id: created.id,
          })));
        }
      }
      toast.success('התכנית נוצרה');
      setPlanDialogOpen(false);
      await loadPlans(created.id);
    } catch (e) {
      toast.error(e?.message || 'שגיאה ביצירת התכנית');
    } finally {
      setSavingPlan(false);
    }
  };

  const updatePlan = async (updates) => {
    if (!canEditWorkPlan(user) || !activePlan) return;
    setPlans(list => list.map(p => (p.id === activePlan.id ? { ...p, ...updates } : p)));
    try {
      await base44.entities.WorkPlan.update(activePlan.id, updates);
      return true;
    } catch (e) {
      toast.error(e?.message || 'שגיאה בעדכון התכנית');
      return false;
    }
  };

  const changeStatus = async (status) => {
    const updates = { status };
    if (status === 'submitted' && !activePlan?.submitted_date) updates.submitted_date = new Date().toISOString().split('T')[0];
    await updatePlan(updates);
  };

  const deletePlan = async () => {
    if (!canEditWorkPlan(user) || !activePlan) return;
    if (!window.confirm(`למחוק את "${activePlan.title}" על כל השורות שבה? לא ניתן לשחזר.`)) return;
    try {
      await base44.entities.WorkPlan.delete(activePlan.id); // השורות נמחקות ב-cascade
      toast.success('התכנית נמחקה');
      await loadPlans();
    } catch (e) {
      toast.error(e?.message || 'שגיאה במחיקת התכנית');
    }
  };

  // ── Plan sources ─────────────────────────────────────────────
  // הכיוון הוא ממקורות התקציב אל התכנית בלבד: התכנית קוראת כמה כסף יש במקור
  // (סכום כל הקטגוריות שלו) ומתכננת בתוכו, ולא כותבת למקורות.

  // רשימת המקורות נשמרת ב-sources; השדות הישנים (0014) מתאפסים, אחרת תכנית
  // שכל המקורות הוסרו ממנה הייתה חוזרת אליהם (planSources)
  const saveSources = (next) => updatePlan({ sources: next, municipal_budget_source_id: null, ministry_budget_source_id: null });

  // עדכון כמה שורות בבת אחת. fn(item) מחזיר את השינוי לשורה, או null
  const patchItems = async (fn) => {
    const patches = items.map(i => [i, fn(i)]).filter(([, p]) => p);
    if (patches.length === 0) return true;
    setItems(list => list.map(i => { const p = patches.find(([x]) => x.id === i.id)?.[1]; return p ? { ...i, ...p } : i; }));
    try {
      await Promise.all(patches.map(([i, p]) => base44.entities.WorkPlanItem.update(i.id, p)));
      return true;
    } catch (e) {
      toast.error(e?.message || 'שגיאה בעדכון השורות');
      return false;
    }
  };

  const addSource = async (sourceId) => {
    if (!canEditWorkPlan(user) || !sourceId || planSrcList.some(s => s.source_id === sourceId)) return;
    const source = budgetSources.find(s => s.id === sourceId);
    const nextSrcs = [...planSrcList, { source_id: sourceId, support: source?.funding_source_type === 'culture_ministry' }];
    // המקור הראשון בתכנית ישנה בלי מקור: הסכומים שכבר הוזנו בה עוברים אליו
    if (planSrcList.length === 0) {
      const nextSupport = nextSrcs.filter(s => s.support).map(s => s.source_id);
      const ok = await patchItems(i => {
        if (Object.keys(i.amounts || {}).length || itemTotal(i) === 0) return null;
        const amounts = { [sourceId]: itemTotal(i) };
        return { amounts, ...legacyAmounts(amounts, nextSupport) };
      });
      if (!ok) return;
    }
    await saveSources(nextSrcs);
  };

  // החלפת המקור בכרטיס: הסכומים עוברים למקור החדש, הקטגוריות שנבחרו מתאפסות
  // (הן שייכות למקור הקודם)
  const replaceSource = async (oldId, newId) => {
    if (!canEditWorkPlan(user) || oldId === newId || planSrcList.some(s => s.source_id === newId)) return;
    const nextSrcs = planSrcList.map(s => (s.source_id === oldId ? { ...s, source_id: newId } : s));
    const nextSupport = nextSrcs.filter(s => s.support).map(s => s.source_id);
    const ok = await patchItems(i => {
      if (!(oldId in (i.amounts || {})) && !(oldId in (i.allocation_ids || {}))) return null;
      const { [oldId]: amount, ...amounts } = i.amounts || {};
      const { [oldId]: _drop, ...allocation_ids } = i.allocation_ids || {};
      if (amount != null) amounts[newId] = amount;
      return { amounts, allocation_ids, ...legacyAmounts(amounts, nextSupport) };
    });
    if (ok) await saveSources(nextSrcs);
  };

  const removeSource = async (s) => {
    if (!canEditWorkPlan(user)) return;
    const used = items.filter(i => amountOf(i, s.id) > 0);
    const sum = used.reduce((t, i) => t + amountOf(i, s.id), 0);
    const msg = used.length
      ? `להסיר את "${s.name}" מהתכנית? ${used.length} שורות מתכננות ממנו ${formatMoney(sum, 0)} — הסכומים האלה יימחקו מהשורות.`
      : `להסיר את "${s.name}" מהתכנית?`;
    if (!window.confirm(msg)) return;
    const nextSrcs = planSrcList.filter(x => x.source_id !== s.id);
    const nextSupport = nextSrcs.filter(x => x.support).map(x => x.source_id);
    const ok = await patchItems(i => {
      if (!(s.id in (i.amounts || {})) && !(s.id in (i.allocation_ids || {}))) return null;
      const { [s.id]: _a, ...amounts } = i.amounts || {};
      const { [s.id]: _b, ...allocation_ids } = i.allocation_ids || {};
      return { amounts, allocation_ids, ...legacyAmounts(amounts, nextSupport) };
    });
    if (ok) await saveSources(nextSrcs);
  };

  // "כספי תמיכה של משרד התרבות" — מולם נבדקות הגבלות הטופס
  const toggleSupport = async (s) => {
    if (!canEditWorkPlan(user)) return;
    const nextSrcs = planSrcList.map(x => (x.source_id === s.id ? { ...x, support: !x.support } : x));
    const nextSupport = nextSrcs.filter(x => x.support).map(x => x.source_id);
    if (await saveSources(nextSrcs)) {
      // העמודות הישנות (תמיכה / השאר) נשמרות בהתאם, בלי הודעה
      patchItems(i => (Object.keys(i.amounts || {}).length ? legacyAmounts(i.amounts, nextSupport) : null));
    }
  };

  // מקורות שאפשר להוסיף — כל מקורות התקציב שעוד לא בתכנית
  const addableSources = budgetSources.filter(s => !planSrcList.some(x => x.source_id === s.id));

  // ── Items ────────────────────────────────────────────────────
  // עריכה בתוך הטבלה (WorkPlanGrid): כל תא נשמר לבד כשיוצאים ממנו.

  const pin = (id) => setPinnedIds(s => (s.has(id) ? s : new Set(s).add(id)));

  const saveItemField = async (item, patch) => {
    if (!canEditWorkPlan(user) || !activePlan) return;
    pin(item.id);
    // סכומים לפי מקור — העמודות הישנות (תמיכה / השאר) נשמרות יחד איתם
    if (patch.amounts) patch = { ...patch, ...legacyAmounts(patch.amounts, supportIds) };
    // עדכון מיידי בטבלה; אם השמירה נכשלת — חוזרים לערך הקודם
    setItems(list => list.map(i => (i.id === item.id ? { ...i, ...patch } : i)));
    try {
      const updated = await base44.entities.WorkPlanItem.update(item.id, patch);
      setItems(list => list.map(i => (i.id === updated.id ? updated : i)));
    } catch (e) {
      setItems(list => list.map(i => (i.id === item.id ? item : i)));
      toast.error(e?.message || 'שגיאה בשמירת השינוי');
    }
  };

  const createItem = async (category, data) => {
    if (!canEditWorkPlan(user) || !activePlan) return;
    const sort_order = items.reduce((m, i) => Math.max(m, num(i.sort_order)), 0) + 1;
    try {
      const created = await base44.entities.WorkPlanItem.create({
        municipal_amount: 0, ministry_amount: 0, quarters: [],
        ...data, category, work_plan_id: activePlan.id, sort_order,
      });
      pin(created.id);
      setItems(list => [...list, created]);
      return created;
    } catch (e) {
      toast.error(e?.message || 'שגיאה בהוספת השורה');
      throw e;
    }
  };

  const deleteItem = async (item) => {
    if (!canEditWorkPlan(user)) return;
    if (!window.confirm(`למחוק את "${item.activity_name}"?`)) return;
    try {
      await base44.entities.WorkPlanItem.delete(item.id);
      setItems(list => list.filter(i => i.id !== item.id));
    } catch (e) {
      toast.error(e?.message || 'שגיאה במחיקה');
    }
  };

  // "הוספת שורה" בכותרת פרמטר מעבירה לשורה הריקה שלו
  const [newRowFocus, setNewRowFocus] = useState({});
  const focusNewRow = (category) => setNewRowFocus(f => ({ ...f, [category]: (f[category] || 0) + 1 }));

  // ── Export ───────────────────────────────────────────────────
  const handleExcel = async () => {
    try { await exportWorkPlanExcel(activePlan, items, sources); } catch (e) { toast.error('שגיאה ביצירת קובץ Excel'); }
  };
  const handlePrint = () => {
    if (!printWorkPlan(activePlan, items, view, sources)) toast.error('הדפדפן חסם את חלון ההדפסה — יש לאפשר חלונות קופצים לאתר');
  };

  // ── Render ───────────────────────────────────────────────────
  if (loading) {
    return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" /></div>;
  }

  if (!canViewWorkPlan(user)) {
    return <div className="p-6 text-center text-muted-foreground">אין לך הרשאה לצפות בתכנית העבודה.</div>;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto animate-fade-in">
      <PageHeader
        title="תכנית עבודה שנתית"
        subtitle="תכנון התקציב לפי פרמטרי משרד התרבות, עם פירוט וזמני ניצול"
        gradient="from-indigo-500 to-violet-600"
        actions={canEdit && !loadError && (
          <Button onClick={openNewPlan} className="gap-1.5 bg-gradient-to-l from-indigo-500 to-violet-600 text-white border-0 hover:opacity-90">
            <Plus className="w-4 h-4" /> תכנית חדשה
          </Button>
        )}
      />

      {loadError ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
          <p className="font-semibold">לא ניתן לטעון את תכניות העבודה.</p>
          <p className="mt-1">ככל הנראה המיגרציה <span dir="ltr" className="font-mono">0012_work_plans.sql</span> עדיין לא הורצה ב-Supabase.</p>
          <p className="mt-1 text-xs opacity-70" dir="ltr">{loadError}</p>
        </div>
      ) : !activePlan ? (
        <div className="text-center py-20 text-muted-foreground">
          <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="mb-1 font-medium">אין עדיין תכנית עבודה</p>
          <p className="text-sm mb-4">צרי תכנית לשנה, והוסיפי שורות מפורטות תחת כל פרמטר</p>
          {canEdit && <Button onClick={openNewPlan} variant="outline" className="gap-2"><Plus className="w-4 h-4" /> תכנית חדשה</Button>}
        </div>
      ) : (
        <>
          {/* Plan bar */}
          <div className="bg-card border border-border rounded-2xl p-4 mb-5 flex flex-wrap items-center gap-3">
            <Select value={activePlanId} onValueChange={setActivePlanId}>
              <SelectTrigger className="w-[260px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {plans.map(p => <SelectItem key={p.id} value={p.id}>{p.year} · {p.title}</SelectItem>)}
              </SelectContent>
            </Select>

            {canEdit ? (
              <Select value={activePlan.status} onValueChange={changeStatus}>
                <SelectTrigger className={cn('w-[150px] h-9 border-0 font-medium', PLAN_STATUSES[activePlan.status]?.className)}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PLAN_STATUSES).map(([k, s]) => <SelectItem key={k} value={k}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : (
              <span className={cn('text-xs px-2.5 py-1 rounded-full font-medium', PLAN_STATUSES[activePlan.status]?.className)}>{PLAN_STATUSES[activePlan.status]?.label}</span>
            )}
            {activePlan.submitted_date && (
              <span className="text-xs text-muted-foreground">הוגשה ב-{new Date(activePlan.submitted_date).toLocaleDateString('he-IL')}</span>
            )}
            {/* סך התכנית — פעם אחת. הפיצול למקורות מופיע בכרטיסי המקורות */}
            <span className="text-sm">
              סה"כ התכנית <b dir="ltr">{formatMoney(totals.total, 0)}</b>
            </span>

            <div className="flex-1" />

            <Button variant="outline" size="sm" onClick={handleExcel} className="gap-1.5"><FileSpreadsheet className="w-4 h-4" /> ייצוא ל-Excel</Button>
            <Button variant="outline" size="sm" onClick={handlePrint} className="gap-1.5"><Printer className="w-4 h-4" /> הדפסה / PDF</Button>
            {canEdit && <Button variant="ghost" size="icon" onClick={deletePlan} title="מחיקת התכנית"><Trash2 className="w-4 h-4 text-red-500" /></Button>}
          </div>

          {/* מקורות התקציב — כרטיס אחד לכל מממן, וכל מספר בו פעם אחת */}
          {canViewBudgets(user) && (
            <div className="bg-card border border-border rounded-2xl p-4 mb-5">
              <p className="font-bold flex items-center gap-1.5 mb-3"><Link2 className="w-4 h-4 text-violet-500" /> מקורות תקציב</p>

              {sources.length === 0 && (
                <p className="text-sm text-muted-foreground mb-3">
                  לא נבחר עדיין מקור. בחרי מאיפה התקציב — אפשר כמה מקורות, וכל שורה בתכנית תקבל סכום לכל מקור.
                </p>
              )}
              <div className={cn('grid gap-4', sources.length > 1 && 'md:grid-cols-2', sources.length > 2 && 'xl:grid-cols-3')}>
                {sources.map(s => {
                  const sourceAllocs = allocations.filter(x => x.budget_source_id === s.id);
                  // אותו חשבון כמו במסך מקורות תקציב (sourceLedger): כל התכניות
                  // המאושרות שמשריינות מהמקור, לא רק זו
                  const ledger = sourceLedger(sourceAllocs, plannedAll);
                  const available = ledger.allocated;
                  const reservedShown = ledger.reserved;
                  const balance = ledger.balance;
                  const planned = totals.bySource[s.id] || 0;
                  const leftToPlan = available - planned;
                  return (
                    <div key={s.id} className={cn('border border-border border-t-4 rounded-xl p-4', s.bar)}>
                      <div className="mb-3 flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          {canEdit ? (
                            <Select value={s.id} onValueChange={v => replaceSource(s.id, v)}>
                              <SelectTrigger className={cn('font-bold', s.accent)}><SelectValue placeholder={s.name} /></SelectTrigger>
                              <SelectContent>
                                {s.source && <SelectItem value={s.id}>{s.name}</SelectItem>}
                                {addableSources.map(b => <SelectItem key={b.id} value={b.id}>{sourceName(b)}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          ) : (
                            <p className={cn('font-bold truncate', s.accent)}>{s.name}</p>
                          )}
                        </div>
                        {canEdit && (
                          <button type="button" title="הסרת המקור מהתכנית"
                            className="text-xs text-muted-foreground hover:text-red-600 shrink-0"
                            onClick={() => removeSource(s)}>
                            הסרה ✕
                          </button>
                        )}
                      </div>
                      <label className={cn('flex items-center gap-2 text-xs mb-3', canEdit ? 'cursor-pointer' : 'opacity-70')}
                        title="הגבלות טופס המשרד (תרבות ≥ 25%, שיווק + השתלמויות ≤ 10%) נמדדות מול סך המקורות המסומנים">
                        <input type="checkbox" checked={s.support} disabled={!canEdit} onChange={() => toggleSupport(s)} />
                        כספי תמיכה של משרד התרבות
                      </label>

                      {s.source ? (
                        <>
                          {/* חמש שורות קצרות, כל מספר פעם אחת: כמה התכנית מתכננת,
                              כמה יש במקור, ומה מתוכו משוריין / נוצל / נשאר */}
                          <div className="rounded-lg bg-muted/40 divide-y divide-border/60 text-sm">
                            {[
                              { label: 'מתוכנן בתכנית', value: formatMoney(planned, 0), cls: 'font-bold' },
                              { label: 'כסף במקור', value: formatMoney(available, 0), cls: cn('font-bold', s.accent) },
                              { label: 'משוריין', value: `− ${formatMoney(reservedShown, 0)}`, cls: 'font-bold text-amber-600' },
                              { label: 'נוצל', value: `− ${formatMoney(ledger.spent, 0)}`, cls: 'font-bold text-red-500' },
                            ].map(r => (
                              <div key={r.label} className="flex items-center justify-between px-3 py-2">
                                <span>{r.label}</span>
                                <span className={r.cls} dir="ltr">{r.value}</span>
                              </div>
                            ))}
                            <div className="flex items-center justify-between px-3 py-2.5 bg-card/60 rounded-b-lg">
                              <span className="font-bold">יתרה</span>
                              <span className="text-xl font-bold text-green-600" dir="ltr">{formatMoney(balance, 0)}</span>
                            </div>
                          </div>
                          {leftToPlan < -0.005 && (
                            <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5 mt-3">
                              <b>חריגה מהתקציב:</b> בתכנית תוכננו {formatMoney(-leftToPlan, 0)} יותר ממה שיש במקור.
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="text-sm text-amber-700">המקור הזה לא נמצא במקורות התקציב (ייתכן שנמחק). אפשר לבחור במקומו מקור אחר.</p>
                      )}
                    </div>
                  );
                })}
              </div>
              {/* הוספת מקור — בלי הגבלה על הכמות, מתוך רשימת מקורות התקציב */}
              {canEdit && addableSources.length > 0 && (
                <div className={cn('max-w-xs', sources.length > 0 && 'mt-3')}>
                  <Select value="" onValueChange={addSource}>
                    <SelectTrigger className="gap-1.5"><Plus className="w-3.5 h-3.5" /><SelectValue placeholder="הוספת מקור תקציב" /></SelectTrigger>
                    <SelectContent>
                      {addableSources.map(b => <SelectItem key={b.id} value={b.id}>{sourceName(b)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

          {/* Ministry form */}
          <div className="bg-card border border-border rounded-2xl overflow-hidden mb-5">
            <div className="flex flex-wrap items-center gap-2 justify-between px-4 py-3 border-b border-border">
              <div>
                <p className="font-bold">תכנון התקציב לפי פרמטרים</p>
                <p className="text-xs text-muted-foreground">{viewLabel}</p>
              </div>
              {violations.length > 0 && (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> {violations.length} פרמטרים לא עומדים בהגבלה
                </span>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground bg-muted/40 border-b border-border">
                    <th className="text-right font-medium p-2.5">פרמטר</th>
                    <th className="text-left font-medium p-2.5 whitespace-nowrap">סכום</th>
                    <th className="text-left font-medium p-2.5 w-20">אחוז</th>
                    {hasLinkedSources && <th className="text-left font-medium p-2.5 whitespace-nowrap">משוריין</th>}
                    {hasLinkedSources && <th className="text-left font-medium p-2.5 whitespace-nowrap">נוצל</th>}
                    {hasLinkedSources && <th className="text-left font-medium p-2.5 whitespace-nowrap">% ניצול</th>}
                    <th className="text-right font-medium p-2.5 whitespace-nowrap">הגבלה</th>
                    <th className="text-right font-medium p-2.5">סטטוס</th>
                  </tr>
                </thead>
                <tbody>
                  {form.rows.map(r => (
                    <tr key={r.category} className="border-b border-border/40">
                      <td className="p-2.5">
                        <p className="font-medium">{r.category}{!r.param && <span className="text-xs text-muted-foreground mr-1">(לא מטופס המשרד)</span>}</p>
                        {r.param?.note && <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{r.param.note}</p>}
                      </td>
                      <td className="p-2.5 text-left whitespace-nowrap" dir="ltr">{formatMoney(r.amount)}</td>
                      <td className="p-2.5 text-left font-semibold" dir="ltr">{formatPct(r.pct)}</td>
                      {hasLinkedSources && (() => {
                        const a = actuals.byCategory.get(r.category);
                        const used = (a?.reserved || 0) + (a?.spent || 0);
                        return (
                          <>
                            <td className="p-2.5 text-left whitespace-nowrap text-amber-600" dir="ltr">{a ? formatMoney(a.reserved, 0) : '-'}</td>
                            <td className="p-2.5 text-left whitespace-nowrap text-red-500" dir="ltr">{a ? formatMoney(a.spent, 0) : '-'}</td>
                            <td className="p-2.5 text-left whitespace-nowrap text-xs" dir="ltr">{r.amount > 0 && a ? formatPct((used / r.amount) * 100) : '-'}</td>
                          </>
                        );
                      })()}
                      <td className="p-2.5 text-xs text-muted-foreground">{r.rule || '-'}</td>
                      <td className="p-2.5">
                        <RuleBadge status={r.status} />
                        {/* האחוז שנמדד מול הבסיס של ההגבלה — לא תמיד האחוז מסך התצוגה */}
                        {r.status && r.rulePct != null && <p className="text-[11px] text-muted-foreground mt-0.5" dir="ltr">{formatPct(r.rulePct)}</p>}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-muted/40 font-bold">
                    <td className="p-2.5">סה"כ</td>
                    <td className="p-2.5 text-left" dir="ltr">{formatMoney(form.total)}</td>
                    <td className="p-2.5 text-left" dir="ltr">{form.total > 0 ? '100%' : '0%'}</td>
                    {hasLinkedSources && (
                      <>
                        <td className="p-2.5 text-left whitespace-nowrap text-amber-600" dir="ltr">{formatMoney(actuals.totals.reserved, 0)}</td>
                        <td className="p-2.5 text-left whitespace-nowrap text-red-500" dir="ltr">{formatMoney(actuals.totals.spent, 0)}</td>
                        <td className="p-2.5 text-left whitespace-nowrap text-xs" dir="ltr">{form.total > 0 ? formatPct((actualUsed / form.total) * 100) : '-'}</td>
                      </>
                    )}
                    <td colSpan={2} />
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Utilization schedule */}
          <div className="bg-card border border-border rounded-2xl overflow-hidden mb-5">
            <div className="flex flex-wrap items-center gap-2 justify-between px-4 py-3 border-b border-border">
              <p className="font-bold flex items-center gap-1.5"><CalendarRange className="w-4 h-4 text-violet-500" /> לוח זמנים לניצול התקציב</p>
              <div className="inline-flex rounded-lg bg-muted p-0.5">
                {[{ id: 'percent', label: 'אחוזים' }, { id: 'amount', label: 'חודשים' }].map(m => (
                  <button key={m.id} onClick={() => setScheduleMode(m.id)}
                    className={cn('px-2.5 py-1 text-xs rounded-md', scheduleMode === m.id ? 'bg-card shadow-sm font-semibold' : 'text-muted-foreground')}>
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground bg-muted/40 border-b border-border">
                    <th className="text-right font-medium p-2.5 min-w-[180px]">פרמטר</th>
                    {scheduleColumns.map(c => <th key={c.label} className="text-left font-medium p-2.5 whitespace-nowrap">{c.label}</th>)}
                    <th className="text-left font-medium p-2.5 whitespace-nowrap">לא נקבע</th>
                    <th className="text-left font-medium p-2.5 whitespace-nowrap">סה"כ</th>
                  </tr>
                </thead>
                <tbody>
                  {schedule.groups.map(g => (
                    <tr key={g.category} className="border-b border-border/40">
                      <td className="p-2.5 text-xs font-medium">{g.category}</td>
                      {scheduleColumns.map(c => {
                        const v = c.value(g);
                        return <td key={c.label} className={cn('p-2.5 text-left whitespace-nowrap text-xs', v > 0 ? 'text-foreground' : 'text-muted-foreground/50')} dir="ltr">{v > 0 ? formatMoney(v, 0) : '-'}</td>;
                      })}
                      <td className={cn('p-2.5 text-left whitespace-nowrap text-xs', g.unscheduled > 0 ? 'text-amber-600 font-medium' : 'text-muted-foreground/50')} dir="ltr">{g.unscheduled > 0 ? formatMoney(g.unscheduled, 0) : '-'}</td>
                      <td className="p-2.5 text-left whitespace-nowrap text-xs font-semibold" dir="ltr">{formatMoney(g.total, 0)}</td>
                    </tr>
                  ))}
                  <tr className="bg-muted/40 font-bold text-xs">
                    <td className="p-2.5">סה"כ</td>
                    {scheduleColumns.map(c => <td key={c.label} className="p-2.5 text-left whitespace-nowrap" dir="ltr">{formatMoney(c.value(schedule), 0)}</td>)}
                    <td className="p-2.5 text-left whitespace-nowrap" dir="ltr">{formatMoney(schedule.unscheduled, 0)}</td>
                    <td className="p-2.5 text-left whitespace-nowrap" dir="ltr">{formatMoney(schedule.total, 0)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* View switch + add */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <p className="font-bold ml-2">פירוט</p>
            <div className="inline-flex rounded-xl bg-muted p-1">
              {views.map(v => (
                <button key={v.id} onClick={() => setView(v.id)}
                  className={cn('px-3 py-1.5 text-sm rounded-lg transition-colors', view === v.id ? 'bg-card shadow-sm font-semibold' : 'text-muted-foreground hover:text-foreground')}>
                  {v.label}
                </button>
              ))}
            </div>
            {view !== 'all' && (
              <span className="text-xs text-muted-foreground">מוצגות רק שורות עם סכום מ{viewLabel}</span>
            )}
            {canEdit && sources.length === 0 && (
              <span className="text-xs text-amber-700">כדי להזין סכומים יש להוסיף מקור תקציב למעלה</span>
            )}
            <div className="flex-1" />
            {canEdit && <span className="text-xs text-muted-foreground">לעריכת שורה לחצי על העיפרון בתחילתה · Enter שומר ויורד שורה · Esc מבטל</span>}
          </div>

          {/* Detailed rows by parameter */}
          <div className="space-y-4">
            {groups.map(g => (
              <div key={g.category} className="bg-card border border-border rounded-2xl overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-muted/40 border-b border-border">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-bold">{g.category}</span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{g.items.length} שורות</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-sm" dir="ltr">{formatMoney(groupAmount(g, view))}</span>
                    {canEdit && <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => focusNewRow(g.category)}><Plus className="w-3.5 h-3.5" /> הוספת שורה</Button>}
                  </div>
                </div>
                <WorkPlanGrid
                  items={g.items}
                  cols={cols}
                  canEdit={canEdit}
                  onSave={saveItemField}
                  onCreate={data => createItem(g.category, data)}
                  onDelete={deleteItem}
                  focusToken={newRowFocus[g.category]}
                  funding={funding}
                  sourceBudgets={sourceBudgets}
                />
              </div>
            ))}
          </div>

          {/* Notes */}
          <div className="mt-5 space-y-1.5">
            <Label>הערות לתכנית (יופיעו בהדפסה)</Label>
            <Textarea
              key={activePlan.id}
              defaultValue={activePlan.notes || ''}
              onBlur={e => { if ((e.target.value || '') !== (activePlan.notes || '')) updatePlan({ notes: e.target.value }); }}
              disabled={!canEdit}
              rows={3}
            />
          </div>
        </>
      )}

      {/* New plan */}
      <Dialog open={planDialogOpen} onOpenChange={setPlanDialogOpen}>
        <DialogContent className="max-w-2xl" dir="rtl">
          <DialogHeader><DialogTitle>תכנית עבודה חדשה</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-[100px_1fr] gap-3">
              <div className="space-y-1.5">
                <Label>שנה</Label>
                <Input dir="ltr" className="text-right" value={planForm.year}
                  onChange={e => { const year = e.target.value.replace(/[^\d]/g, '').slice(0, 4); setPlanForm(f => ({ ...f, year, title: `תכנון התקציב של הספרייה לשנת ${year}` })); }} />
              </div>
              <div className="space-y-1.5">
                <Label>כותרת</Label>
                <Input value={planForm.title} onChange={e => setPlanForm(f => ({ ...f, title: e.target.value }))} />
              </div>
            </div>
            {plans.length > 0 && (
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5"><Copy className="w-3.5 h-3.5" /> העתקת שורות מתכנית קיימת</Label>
                <Select value={planForm.copyFrom} onValueChange={v => setPlanForm(f => ({ ...f, copyFrom: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_COPY}>בלי העתקה — תכנית ריקה</SelectItem>
                    {plans.map(p => <SelectItem key={p.id} value={p.id}>{p.year} · {p.title}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">השורות, הסכומים וזמני הניצול יועתקו, ואפשר לעדכן אותם אחר כך.</p>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPlanDialogOpen(false)}>ביטול</Button>
            <Button onClick={createPlan} disabled={savingPlan}>{savingPlan ? 'יוצר…' : 'יצירה'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
