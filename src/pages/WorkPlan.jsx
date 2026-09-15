import { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Plus, Pencil, Trash2, FileSpreadsheet, Printer, ClipboardList, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import PageHeader from '@/components/PageHeader';
import WorkPlanItemDialog from '@/components/workPlan/WorkPlanItemDialog';
import useCategories from '@/hooks/useCategories';
import { canViewWorkPlan, canEditWorkPlan } from '@/lib/permissions';
import {
  PLAN_STATUSES, VIEWS, SUGGESTED_CATEGORIES, amountColumns, itemsForView, groupByCategory,
  groupAmount, planTotals, quartersLabel, formatMoney, num,
} from '@/lib/workPlan';
import { exportWorkPlanExcel, printWorkPlan } from '@/lib/workPlanExport';

const NO_COPY = '__none__';

export default function WorkPlan() {
  const [user, setUser] = useState(null);
  const [plans, setPlans] = useState([]);
  const [activePlanId, setActivePlanId] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [view, setView] = useState('all');

  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [planForm, setPlanForm] = useState({ year: '', title: '', copyFrom: NO_COPY });
  const [savingPlan, setSavingPlan] = useState(false);

  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [defaultCategory, setDefaultCategory] = useState('');

  const { mains } = useCategories();
  const canEdit = canEditWorkPlan(user);
  const activePlan = plans.find(p => p.id === activePlanId) || null;

  const loadPlans = async (selectId) => {
    try {
      const list = await base44.entities.WorkPlan.list('-year', 50);
      setPlans(list);
      setActivePlanId(selectId || list[0]?.id || null);
      setLoadError(null);
    } catch (e) {
      // הטבלה לא קיימת עדיין — מיגרציה 0012 לא הורצה
      setLoadError(e?.message || 'שגיאה בטעינת תכניות העבודה');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    base44.auth.me().then(u => {
      setUser(u);
      if (canViewWorkPlan(u)) loadPlans(); else setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!activePlanId) { setItems([]); return; }
    base44.entities.WorkPlanItem.filter({ work_plan_id: activePlanId }, 'sort_order', 2000)
      .then(setItems)
      .catch(() => setItems([]));
  }, [activePlanId]);

  const categoryOptions = useMemo(() => {
    const set = new Set([...SUGGESTED_CATEGORIES, ...mains.map(m => m.value), ...items.map(i => i.category).filter(Boolean)]);
    return [...set];
  }, [mains, items]);

  const viewItems = useMemo(() => itemsForView(items, view), [items, view]);
  const groups = useMemo(() => groupByCategory(viewItems), [viewItems]);
  const totals = useMemo(() => planTotals(items), [items]);
  const cols = amountColumns(view);
  const viewTotal = groups.reduce((s, g) => s + groupAmount(g, view), 0);

  // ── Plans ────────────────────────────────────────────────────
  const openNewPlan = () => {
    const nextYear = String(new Date().getFullYear() + 1);
    setPlanForm({ year: nextYear, title: `תכנית עבודה שנתית ${nextYear}`, copyFrom: plans[0]?.id || NO_COPY });
    setPlanDialogOpen(true);
  };

  const createPlan = async () => {
    if (!canEditWorkPlan(user)) return;
    if (!planForm.year.trim() || !planForm.title.trim()) { toast.error('יש להזין שנה וכותרת'); return; }
    setSavingPlan(true);
    try {
      const created = await base44.entities.WorkPlan.create({ year: planForm.year.trim(), title: planForm.title.trim(), status: 'draft' });
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
    } catch (e) {
      toast.error(e?.message || 'שגיאה בעדכון התכנית');
    }
  };

  const changeStatus = (status) => {
    const updates = { status };
    if (status === 'submitted' && !activePlan?.submitted_date) updates.submitted_date = new Date().toISOString().split('T')[0];
    updatePlan(updates);
  };

  const deletePlan = async () => {
    if (!canEditWorkPlan(user) || !activePlan) return;
    if (!window.confirm(`למחוק את "${activePlan.title}" על כל הפעילויות שבה? לא ניתן לשחזר.`)) return;
    try {
      await base44.entities.WorkPlan.delete(activePlan.id); // השורות נמחקות ב-cascade
      toast.success('התכנית נמחקה');
      await loadPlans();
    } catch (e) {
      toast.error(e?.message || 'שגיאה במחיקת התכנית');
    }
  };

  // ── Items ────────────────────────────────────────────────────
  const openNewItem = (category = '') => { setEditingItem(null); setDefaultCategory(category); setItemDialogOpen(true); };
  const openEditItem = (item) => { setEditingItem(item); setItemDialogOpen(true); };

  const saveItem = async (data) => {
    if (!canEditWorkPlan(user) || !activePlan) return;
    if (editingItem) {
      const updated = await base44.entities.WorkPlanItem.update(editingItem.id, data);
      setItems(list => list.map(i => (i.id === updated.id ? updated : i)));
      toast.success('הפעילות עודכנה');
    } else {
      const sort_order = items.reduce((m, i) => Math.max(m, num(i.sort_order)), 0) + 1;
      const created = await base44.entities.WorkPlanItem.create({ ...data, work_plan_id: activePlan.id, sort_order });
      setItems(list => [...list, created]);
      toast.success('הפעילות נוספה');
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

  // ── Export ───────────────────────────────────────────────────
  const handleExcel = async () => {
    try { await exportWorkPlanExcel(activePlan, items); } catch (e) { toast.error('שגיאה ביצירת קובץ Excel'); }
  };
  const handlePrint = () => {
    if (!printWorkPlan(activePlan, items, view)) toast.error('הדפדפן חסם את חלון ההדפסה — יש לאפשר חלונות קופצים לאתר');
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
        subtitle="תכנון פעילות לפי קטגוריות, בחלוקה לתקציב עירוני ומשרד התרבות"
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
          <p className="text-sm mb-4">צרי תכנית לשנה, והוסיפי לה פעילויות לפי קטגוריות</p>
          {canEdit && <Button onClick={openNewPlan} variant="outline" className="gap-2"><Plus className="w-4 h-4" /> תכנית חדשה</Button>}
        </div>
      ) : (
        <>
          {/* Plan bar */}
          <div className="bg-card border border-border rounded-2xl p-4 mb-5 flex flex-wrap items-center gap-3">
            <Select value={activePlanId} onValueChange={setActivePlanId}>
              <SelectTrigger className="w-[240px]"><SelectValue /></SelectTrigger>
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

            <div className="flex-1" />

            <Button variant="outline" size="sm" onClick={handleExcel} className="gap-1.5"><FileSpreadsheet className="w-4 h-4" /> ייצוא ל-Excel</Button>
            <Button variant="outline" size="sm" onClick={handlePrint} className="gap-1.5"><Printer className="w-4 h-4" /> הדפסה / PDF</Button>
            {canEdit && <Button variant="ghost" size="icon" onClick={deletePlan} title="מחיקת התכנית"><Trash2 className="w-4 h-4 text-red-500" /></Button>}
          </div>

          {/* Totals */}
          <div className="grid gap-3 sm:grid-cols-3 mb-5">
            {[
              { id: 'all', label: 'סה"כ התכנית', value: totals.total, color: 'text-foreground' },
              { id: 'municipal', label: 'תקציב עירוני', value: totals.municipal, color: 'text-sky-600' },
              { id: 'ministry', label: 'משרד התרבות', value: totals.ministry, color: 'text-violet-600' },
            ].map(card => (
              <button key={card.id} onClick={() => setView(card.id)}
                className={cn('text-right bg-card border rounded-2xl p-4 transition-all hover:shadow-sm', view === card.id ? 'border-violet-400 ring-2 ring-violet-100' : 'border-border')}>
                <p className="text-xs text-muted-foreground">{card.label}</p>
                <p className={cn('text-2xl font-bold mt-0.5', card.color)}>{formatMoney(card.value)}</p>
                {card.id !== 'all' && totals.total > 0 && (
                  <p className="text-xs text-muted-foreground mt-0.5">{((card.value / totals.total) * 100).toFixed(0)}% מהתכנית</p>
                )}
              </button>
            ))}
          </div>

          {/* View switch + add */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <div className="inline-flex rounded-xl bg-muted p-1">
              {VIEWS.map(v => (
                <button key={v.id} onClick={() => setView(v.id)}
                  className={cn('px-3 py-1.5 text-sm rounded-lg transition-colors', view === v.id ? 'bg-card shadow-sm font-semibold' : 'text-muted-foreground hover:text-foreground')}>
                  {v.label}
                </button>
              ))}
            </div>
            {view !== 'all' && (
              <span className="text-xs text-muted-foreground">מוצגות רק פעילויות עם סכום ב{VIEWS.find(v => v.id === view)?.label}</span>
            )}
            <div className="flex-1" />
            {canEdit && <Button onClick={() => openNewItem()} className="gap-1.5"><Plus className="w-4 h-4" /> פעילות חדשה</Button>}
          </div>

          {/* Category summary */}
          {groups.length > 0 && (
            <div className="bg-card border border-border rounded-2xl p-4 mb-5">
              <p className="text-sm font-bold mb-3">לפי קטגוריה</p>
              <div className="space-y-2">
                {groups.map(g => {
                  const amount = groupAmount(g, view);
                  const pct = viewTotal > 0 ? (amount / viewTotal) * 100 : 0;
                  return (
                    <div key={g.category} className="grid grid-cols-[140px_1fr_110px_48px] items-center gap-3 text-sm">
                      <span className="font-medium truncate">{g.category}</span>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-violet-500" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="font-semibold text-left" dir="ltr">{formatMoney(amount)}</span>
                      <span className="text-xs text-muted-foreground text-left" dir="ltr">{pct.toFixed(0)}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Items by category */}
          {groups.length === 0 ? (
            <div className="text-center py-14 text-muted-foreground border-2 border-dashed border-border rounded-2xl">
              <p>{items.length === 0 ? 'אין עדיין פעילויות בתכנית' : 'אין פעילויות בתצוגה זו'}</p>
              {canEdit && items.length === 0 && <Button variant="outline" className="mt-3 gap-1.5" onClick={() => openNewItem()}><Plus className="w-4 h-4" /> הוספת פעילות ראשונה</Button>}
            </div>
          ) : (
            <div className="space-y-4">
              {groups.map(g => (
                <div key={g.category} className="bg-card border border-border rounded-2xl overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2.5 bg-muted/40 border-b border-border">
                    <div className="flex items-center gap-2">
                      <span className="font-bold">{g.category}</span>
                      <span className="text-xs text-muted-foreground">{g.items.length} פעילויות</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-sm" dir="ltr">{formatMoney(groupAmount(g, view))}</span>
                      {canEdit && <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => openNewItem(g.category)}><Plus className="w-3.5 h-3.5" /> הוספה</Button>}
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-muted-foreground border-b border-border/60">
                          <th className="text-right font-medium p-2.5">פעילות</th>
                          <th className="text-right font-medium p-2.5 hidden md:table-cell">קהל יעד</th>
                          <th className="text-right font-medium p-2.5 hidden lg:table-cell">משתתפים</th>
                          <th className="text-right font-medium p-2.5 hidden md:table-cell">מועד</th>
                          {cols.map(c => <th key={c.key} className="text-left font-medium p-2.5 whitespace-nowrap">{c.label}</th>)}
                          {canEdit && <th className="w-20" />}
                        </tr>
                      </thead>
                      <tbody>
                        {g.items.map(i => (
                          <tr key={i.id} className="border-b border-border/40 last:border-b-0 hover:bg-muted/20">
                            <td className="p-2.5">
                              <p className="font-medium">{i.activity_name}</p>
                              {i.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{i.description}</p>}
                            </td>
                            <td className="p-2.5 hidden md:table-cell text-muted-foreground">{i.target_audience || '-'}</td>
                            <td className="p-2.5 hidden lg:table-cell text-muted-foreground">{i.expected_participants != null ? num(i.expected_participants).toLocaleString('he-IL') : '-'}</td>
                            <td className="p-2.5 hidden md:table-cell text-muted-foreground text-xs">{quartersLabel(i.quarters) || '-'}</td>
                            {cols.map(c => (
                              <td key={c.key} className={cn('p-2.5 text-left whitespace-nowrap', c.key === 'total' && 'font-semibold')} dir="ltr">{formatMoney(c.value(i))}</td>
                            ))}
                            {canEdit && (
                              <td className="p-2.5">
                                <div className="flex justify-end gap-0.5">
                                  <button onClick={() => openEditItem(i)} className="p-1.5 rounded-lg hover:bg-muted" title="עריכה"><Pencil className="w-3.5 h-3.5 text-muted-foreground" /></button>
                                  <button onClick={() => deleteItem(i)} className="p-1.5 rounded-lg hover:bg-muted" title="מחיקה"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                                </div>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}

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
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader><DialogTitle>תכנית עבודה חדשה</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-[100px_1fr] gap-3">
              <div className="space-y-1.5">
                <Label>שנה</Label>
                <Input dir="ltr" className="text-right" value={planForm.year}
                  onChange={e => { const year = e.target.value.replace(/[^\d]/g, '').slice(0, 4); setPlanForm(f => ({ ...f, year, title: `תכנית עבודה שנתית ${year}` })); }} />
              </div>
              <div className="space-y-1.5">
                <Label>כותרת</Label>
                <Input value={planForm.title} onChange={e => setPlanForm(f => ({ ...f, title: e.target.value }))} />
              </div>
            </div>
            {plans.length > 0 && (
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5"><Copy className="w-3.5 h-3.5" /> העתקת פעילויות מתכנית קיימת</Label>
                <Select value={planForm.copyFrom} onValueChange={v => setPlanForm(f => ({ ...f, copyFrom: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_COPY}>בלי העתקה — תכנית ריקה</SelectItem>
                    {plans.map(p => <SelectItem key={p.id} value={p.id}>{p.year} · {p.title}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">הפעילויות והסכומים יועתקו, ואפשר לעדכן אותם אחר כך.</p>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPlanDialogOpen(false)}>ביטול</Button>
            <Button onClick={createPlan} disabled={savingPlan}>{savingPlan ? 'יוצר…' : 'יצירה'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <WorkPlanItemDialog
        open={itemDialogOpen}
        onOpenChange={setItemDialogOpen}
        item={editingItem}
        defaultCategory={defaultCategory}
        categoryOptions={categoryOptions}
        onSubmit={saveItem}
      />
    </div>
  );
}
