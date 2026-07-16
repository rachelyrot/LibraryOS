import { useEffect, useState, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Plus, LayoutGrid, PieChart, BarChart2, TableIcon, Pencil, AlertTriangle, ChevronRight, Building2, Wallet, ArrowRight, CreditCard, ExternalLink, ShoppingCart, Layers, PencilLine, DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import PageHeader from '@/components/PageHeader';
import { toast } from 'sonner';
import CategoryDialog from '@/components/budget/CategoryDialog';
import AddExpenseDialog from '@/components/budget/AddExpenseDialog';
import BudgetPieChart from '@/components/budget/BudgetPieChart';
import BudgetBarChart from '@/components/budget/BudgetBarChart';
import BudgetTable from '@/components/budget/BudgetTable';
import BudgetSourceDialog from '@/components/budget/BudgetSourceDialog';
import SupplierCreditDialog from '@/components/budget/SupplierCreditDialog';
import { recalcBudgetSource } from '@/lib/budgetUpdater';
import { canEditBudgets, canCreateSupplierCredits, canAddManualExpense, canViewBudgets, canViewSensitiveBudgetData } from '@/lib/permissions';

const VIEWS = [
  { id: 'overview', label: 'סקירה', icon: LayoutGrid },
  { id: 'pie', label: 'עוגה', icon: PieChart },
  { id: 'bar', label: 'עמודות', icon: BarChart2 },
  { id: 'table', label: 'טבלה', icon: TableIcon },
];
const STATUS_LABELS = { active: 'פעיל', frozen: 'מוקפא', pending: 'ממתין', closed: 'סגור' };
const STATUS_COLORS = { active: 'bg-green-100 text-green-700', frozen: 'bg-blue-100 text-blue-700', pending: 'bg-amber-100 text-amber-700', closed: 'bg-slate-100 text-slate-500' };
const CREDIT_STATUS_LABELS = { active: 'פעיל', exhausted: 'נוצל', expired: 'פג תוקף', cancelled: 'בוטל' };
const CREDIT_STATUS_COLORS = { active: 'bg-green-100 text-green-700', exhausted: 'bg-slate-100 text-slate-600', expired: 'bg-red-100 text-red-600', cancelled: 'bg-gray-100 text-gray-500' };
const ORDER_STATUS_LABELS = {
  draft: 'טיוטה', pending_approval: 'ממתין', approved: 'מאושר', ordered: 'הוזמן',
  received_full: 'התקבל', received_partial: 'חלקי', cancelled: 'בוטל',
};

function ProgressBar({ value, max, color }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return <div className="h-2.5 bg-muted rounded-full overflow-hidden"><div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color || '#14b8a6' }} /></div>;
}

function computeSourceTotals(categories) {
  return {
    total: categories.reduce((s, c) => s + (c.allocated_amount || 0), 0),
    reserved: categories.reduce((s, c) => s + (c.reserved_amount || 0), 0),
    spent: categories.reduce((s, c) => s + (c.spent_amount || 0), 0),
  };
}

export default function Credits() {
  const location = useLocation();
  const [sources, setSources] = useState([]);
  const [allCategories, setAllCategories] = useState([]);
  const [allOrders, setAllOrders] = useState([]);
  const [supplierCredits, setSupplierCredits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [noAccess, setNoAccess] = useState(false);

  const [activeSourceId, setActiveSourceId] = useState(null);
  const [view, setView] = useState('overview');

  const [sourceDialogOpen, setSourceDialogOpen] = useState(false);
  const [editingSource, setEditingSource] = useState(null);
  const [catDialogOpen, setCatDialogOpen] = useState(false);
  const [editingCat, setEditingCat] = useState(null);
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [preselectedCat, setPreselectedCat] = useState(null);
  const [creditDialogOpen, setCreditDialogOpen] = useState(false);
  const [editingCredit, setEditingCredit] = useState(null);

  const load = async () => {
    const [srcs, cats, orders, credits] = await Promise.all([
      base44.entities.BudgetSource.list('-created_date', 50),
      base44.entities.BudgetAllocation.list('name', 300),
      base44.entities.PurchaseOrder.list('-created_date', 300),
      base44.entities.SupplierCredit.list('-created_date', 100),
    ]);
    setSources(srcs);
    setAllCategories(cats);
    setAllOrders(orders);
    setSupplierCredits(credits);
    setLoading(false);
  };

  useEffect(() => {
    const init = async () => {
      const u = await base44.auth.me().catch(() => null);
      setUser(u);
      if (!canViewBudgets(u)) {
        setNoAccess(true);
        return;
      }
      await load();
    };
    init();
  }, []);

  useEffect(() => {
    if (loading || location.hash !== '#credits-section') return;
    document.getElementById('credits-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [loading, location.hash]);

  const canEdit = canEditBudgets(user);
  const canCredit = canCreateSupplierCredits(user);
  const canAddExpense = canAddManualExpense(user);
  const canViewSensitive = canViewSensitiveBudgetData(user);
  const activeSource = sources.find(s => s.id === activeSourceId);
  const categories = useMemo(
    () => activeSourceId ? allCategories.filter(c => c.budget_source_id === activeSourceId) : [],
    [allCategories, activeSourceId],
  );

  // Source totals computed from categories (on sources list)
  const sourceTotals = useMemo(() => {
    const map = {};
    for (const cat of allCategories) {
      if (!cat.budget_source_id) continue;
      if (!map[cat.budget_source_id]) map[cat.budget_source_id] = { total: 0, reserved: 0, spent: 0 };
      map[cat.budget_source_id].total += cat.allocated_amount || 0;
      map[cat.budget_source_id].reserved += cat.reserved_amount || 0;
      map[cat.budget_source_id].spent += cat.spent_amount || 0;
    }
    return map;
  }, [allCategories]);

  const catTotals = useMemo(() => computeSourceTotals(categories), [categories]);
  const warnings = categories.filter(c => {
    const pct = c.allocated_amount > 0 ? ((c.reserved_amount || 0) + (c.spent_amount || 0)) / c.allocated_amount : 0;
    return pct >= 0.8;
  });

  const handleSaveSource = async (form) => {
    if (editingSource) {
      await base44.entities.BudgetSource.update(editingSource.id, form);
      toast.success('מקור תקציב עודכן!');
    } else {
      await base44.entities.BudgetSource.create(form);
      toast.success('מקור תקציב נוסף!');
    }
    load();
  };

  const handleSaveCategory = async (form) => {
    const remaining = Math.max(0, (Number(form.allocated_amount) || 0) - (editingCat?.reserved_amount || 0) - (editingCat?.spent_amount || 0));
    const data = { ...form, budget_source_id: activeSourceId, remaining_amount: remaining };

    if (editingCat) {
      await base44.entities.BudgetAllocation.update(editingCat.id, data);
      toast.success('קטגוריה עודכנה!');
    } else {
      await base44.entities.BudgetAllocation.create(data);
      toast.success('קטגוריה נוספה!');
    }

    await recalcBudgetSource(activeSourceId);
    load();
  };

  const handleAddExpense = async (form) => {
    const cat = allCategories.find(c => c.id === form.category_id);
    if (!cat) return;
    const amount = Number(form.amount);
    const newSpent = (cat.spent_amount || 0) + amount;
    const newRemaining = Math.max(0, (cat.allocated_amount || 0) - (cat.reserved_amount || 0) - newSpent);

    const transaction = {
      date: form.date,
      amount,
      supplier_name: form.supplier_name,
      description: form.description,
      is_manual: true,
      order_id: null,
    };

    await base44.entities.BudgetAllocation.update(cat.id, {
      spent_amount: newSpent,
      remaining_amount: newRemaining,
      transactions: [...(cat.transactions || []), transaction],
    });

    if (cat.budget_source_id) await recalcBudgetSource(cat.budget_source_id);
    toast.success('הוצאה נרשמה!');
    load();
  };

  const getLinkedOrders = (catId) => allOrders.filter(o => o.budget_category_id === catId);
  const getCreditOrders = (creditId) => allOrders.filter(o => o.credit_id === creditId);

  const openAddExpense = (cat = null) => { setPreselectedCat(cat); setExpenseDialogOpen(true); };
  const openEditCat = (cat) => { setEditingCat(cat); setCatDialogOpen(true); };
  const openNewCat = () => { setEditingCat(null); setCatDialogOpen(true); };
  const openNewSource = () => { setEditingSource(null); setSourceDialogOpen(true); };
  const openEditSource = (src) => { setEditingSource(src); setSourceDialogOpen(true); };
  const openNewCredit = () => { setEditingCredit(null); setCreditDialogOpen(true); };

  const handleSaveCredit = async (form) => {
    const remaining = Math.max(0, (Number(form.total_amount) || 0) - (editingCredit?.reserved_amount || 0) - (editingCredit?.used_amount || 0));
    const data = { ...form, total_amount: Number(form.total_amount), remaining_amount: remaining };
    if (editingCredit) {
      await base44.entities.SupplierCredit.update(editingCredit.id, data);
      toast.success('הזיכוי עודכן!');
    } else {
      await base44.entities.SupplierCredit.create(data);
      toast.success('זיכוי ספק נוסף!');
    }
    load();
  };

  // ─── SOURCES LIST ────────────────────────────────────────────────────────────
  if (noAccess) {
    return (
      <div className="p-6 max-w-2xl mx-auto animate-fade-in">
        <div className="text-center py-20 text-muted-foreground">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
          </div>
          <h2 className="text-xl font-bold text-foreground mb-2">אין גישה לתקציבים</h2>
          <p className="text-muted-foreground">אין לך הרשאה לצפות בתקציבים וזיכויים.</p>
        </div>
      </div>
    );
  }

  if (!activeSourceId) {
    const grandTotal = Object.values(sourceTotals).reduce((s, t) => s + t.total, 0);
    const grandReserved = Object.values(sourceTotals).reduce((s, t) => s + t.reserved, 0);
    const grandSpent = Object.values(sourceTotals).reduce((s, t) => s + t.spent, 0);
    const grandAvailable = Math.max(0, grandTotal - grandReserved - grandSpent);

    return (
      <div className="p-6 max-w-5xl mx-auto animate-fade-in">
        <PageHeader
          title="מקורות תקציב"
          subtitle={canViewSensitive ? "ניהול תקציב, קטגוריות וזיכויים" : "צפייה בלבד"}
          gradient="from-violet-500 to-purple-600"
          actions={canEdit && <Button onClick={openNewSource} className="gap-1.5 bg-gradient-to-l from-violet-500 to-purple-600 text-white border-0 hover:opacity-90"><Plus className="w-4 h-4" /> מקור תקציב חדש</Button>}
        />

        {sources.length > 0 && (
          <div className="bg-gradient-to-l from-violet-600 to-purple-700 rounded-2xl p-5 mb-6 text-white">
            <div className="grid grid-cols-4 gap-3 mb-3 text-center">
              <div><p className="text-violet-200 text-xs">תקציב כולל</p><p className="text-xl font-bold mt-0.5">₪{grandTotal.toLocaleString('he-IL')}</p></div>
              <div><p className="text-violet-200 text-xs">משוריין</p><p className="text-xl font-bold mt-0.5">₪{grandReserved.toLocaleString('he-IL')}</p></div>
              <div><p className="text-violet-200 text-xs">נוצל</p><p className="text-xl font-bold mt-0.5">₪{grandSpent.toLocaleString('he-IL')}</p></div>
              <div><p className="text-violet-200 text-xs">יתרה</p><p className="text-xl font-bold mt-0.5 text-violet-200">₪{grandAvailable.toLocaleString('he-IL')}</p></div>
            </div>
            <ProgressBar value={grandReserved + grandSpent} max={grandTotal} color="#fff" />
            <p className="text-violet-200 text-xs mt-1.5">{sources.length} מקורות תקציב</p>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" /></div>
        ) : sources.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <Building2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="mb-1 font-medium">אין מקורות תקציב</p>
            <p className="text-sm mb-4">הוסף מקור תקציב וקטגוריות מתחתיו</p>
            {canEdit && <Button onClick={openNewSource} variant="outline" className="gap-2"><Plus className="w-4 h-4" /> הוסף מקור תקציב</Button>}
          </div>
        ) : (
          <div className="space-y-8">
            <div>
              <h2 className="text-lg font-bold mb-4 flex items-center gap-2"><Wallet className="w-5 h-5 text-violet-500" /> מקורות תקציב</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {sources.map(src => {
                  const totals = sourceTotals[src.id] || { total: 0, reserved: 0, spent: 0 };
                  const avail = Math.max(0, totals.total - totals.reserved - totals.spent);
                  const usedPct = totals.total > 0 ? Math.min(100, ((totals.reserved + totals.spent) / totals.total) * 100) : 0;
                  const srcCats = allCategories.filter(c => c.budget_source_id === src.id);

                  return (
                    <motion.div key={src.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                      className="bg-card border border-border rounded-2xl p-5 hover:shadow-md hover:border-violet-300 transition-all cursor-pointer group"
                      onClick={() => setActiveSourceId(src.id)}>
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${src.color || '#8b5cf6'}20` }}>
                            <Wallet className="w-4 h-4" style={{ color: src.color || '#8b5cf6' }} />
                          </div>
                          <div>
                            <p className="font-bold text-sm leading-tight">{src.name}</p>
                            {src.year && <p className="text-xs text-muted-foreground">{src.year}</p>}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', STATUS_COLORS[src.status || 'active'])}>{STATUS_LABELS[src.status || 'active']}</span>
                          {canEdit && <button onClick={e => { e.stopPropagation(); openEditSource(src); }} className="opacity-0 group-hover:opacity-100 p-1 hover:bg-muted rounded-lg transition-all"><Pencil className="w-3.5 h-3.5 text-muted-foreground" /></button>}
                        </div>
                      </div>
                      <div className="mb-3">
                        <p className="text-2xl font-bold text-foreground">₪{totals.total.toLocaleString('he-IL')}</p>
                        <p className="text-xs text-muted-foreground">תקציב כולל · {srcCats.length} קטגוריות</p>
                      </div>
                      <div className="grid grid-cols-3 gap-2 mb-3 text-center text-xs">
                        <div><p className="text-muted-foreground">משוריין</p><p className="font-bold text-amber-600">₪{totals.reserved.toLocaleString('he-IL')}</p></div>
                        <div><p className="text-muted-foreground">נוצל</p><p className="font-bold text-red-500">₪{totals.spent.toLocaleString('he-IL')}</p></div>
                        <div><p className="text-muted-foreground">יתרה</p><p className="font-bold text-teal-600">₪{avail.toLocaleString('he-IL')}</p></div>
                      </div>
                      <ProgressBar value={totals.reserved + totals.spent} max={totals.total} color={src.color} />
                      <div className="flex justify-between text-xs mt-1.5">
                        <span className="text-muted-foreground" dir="ltr">{usedPct.toFixed(0)}%</span>
                        <span className="font-medium" style={{ color: src.color || '#8b5cf6' }}>יתרה ₪{avail.toLocaleString('he-IL')}</span>
                      </div>
                      <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                        <span className="text-xs text-muted-foreground">{srcCats.length} קטגוריות</span>
                        <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-[-4px] transition-all" />
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>

            {/* Supplier Credits — hide from local_manager */}
            {canViewSensitive && (
              <div id="credits-section">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold flex items-center gap-2"><CreditCard className="w-5 h-5 text-teal-500" /> זיכויי ספקים</h2>
                  {canCredit && <Button onClick={openNewCredit} variant="outline" className="gap-1.5 text-sm"><Plus className="w-4 h-4" /> זיכוי חדש</Button>}
                </div>
                {supplierCredits.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground bg-muted/30 rounded-2xl">
                    <CreditCard className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p>לא קיימים זיכויי ספקים פעילים</p>
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {supplierCredits.map(credit => {
                    const reserved = credit.reserved_amount || 0;
                    const used = credit.used_amount || 0;
                    const rem = credit.remaining_amount !== undefined ? credit.remaining_amount : Math.max(0, (credit.total_amount || 0) - reserved - used);
                    const linkedOrders = getCreditOrders(credit.id);
                    return (
                      <motion.div key={credit.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-card border border-border rounded-2xl p-5 hover:shadow-md hover:border-teal-300 transition-all">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-xl bg-teal-100 flex items-center justify-center shrink-0"><CreditCard className="w-4 h-4 text-teal-600" /></div>
                            <div>
                              <p className="font-bold text-sm">{credit.supplier_name || 'ללא ספק'}</p>
                              {credit.reason && <p className="text-xs text-muted-foreground">{credit.reason}</p>}
                            </div>
                          </div>
                          <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', CREDIT_STATUS_COLORS[credit.status || 'active'])}>{CREDIT_STATUS_LABELS[credit.status || 'active']}</span>
                        </div>
                        <div className="mb-3">
                          <p className="text-2xl font-bold">₪{(credit.total_amount || 0).toLocaleString('he-IL')}</p>
                        </div>
                        <div className="grid grid-cols-3 gap-2 mb-3 text-center text-xs">
                          <div><p className="text-muted-foreground">משוריין</p><p className="font-bold text-amber-600">₪{reserved.toLocaleString('he-IL')}</p></div>
                          <div><p className="text-muted-foreground">נוצל</p><p className="font-bold text-red-500">₪{used.toLocaleString('he-IL')}</p></div>
                          <div><p className="text-muted-foreground">יתרה</p><p className="font-bold text-teal-600">₪{rem.toLocaleString('he-IL')}</p></div>
                        </div>
                        <ProgressBar value={reserved + used} max={credit.total_amount} color="#14b8a6" />
                        {linkedOrders.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-border">
                            <p className="text-xs font-medium text-muted-foreground mb-1.5">הזמנות ({linkedOrders.length})</p>
                            {linkedOrders.slice(0, 3).map(o => (
                              <Link key={o.id} to={`/orders/${o.id}`} className="flex items-center justify-between text-xs hover:bg-muted/60 rounded-lg px-2 py-1 -mx-2">
                                <span className="truncate">{o.title || o.supplier_name}</span>
                                <div className="flex items-center gap-1 shrink-0">
                                  <span className="font-medium">₪{(o.total_amount || 0).toLocaleString('he-IL')}</span>
                                  <ExternalLink className="w-3 h-3" />
                                </div>
                              </Link>
                            ))}
                          </div>
                        )}
                      </motion.div>
                    );
                  })}
                </div>
              )}
              </div>
            )}
          </div>
        )}

        <BudgetSourceDialog open={sourceDialogOpen} onOpenChange={setSourceDialogOpen} source={editingSource} onSubmit={handleSaveSource} />
        <SupplierCreditDialog open={creditDialogOpen} onOpenChange={setCreditDialogOpen} credit={editingCredit} onSubmit={handleSaveCredit} />
      </div>
    );
  }

  // ─── SOURCE DETAIL ───────────────────────────────────────────────────────────
  const avail = Math.max(0, catTotals.total - catTotals.reserved - catTotals.spent);
  const usedPct = catTotals.total > 0 ? ((catTotals.reserved + catTotals.spent) / catTotals.total * 100).toFixed(0) : 0;

  return (
    <div className="p-6 max-w-6xl mx-auto animate-fade-in">
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
        <button onClick={() => setActiveSourceId(null)} className="hover:text-foreground transition-colors">מקורות תקציב</button>
        <ChevronRight className="w-4 h-4" />
        <span className="font-semibold text-foreground">{activeSource?.name}</span>
      </div>

      <PageHeader
        title="חלוקה לקטגוריות תקציב"
        subtitle={`${activeSource?.name} · ${activeSource?.year || ''} ${!canEdit ? '(צפייה בלבד)' : ''}`}
        gradient="from-teal-400 to-green-500"
        actions={
          <div className="flex gap-2">
            {canAddExpense && <Button onClick={() => openAddExpense()} variant="outline" className="gap-1.5 text-sm"><Plus className="w-4 h-4" /> הוסף הוצאה</Button>}
            {canEdit && <Button onClick={openNewCat} className="gap-1.5 bg-gradient-to-l from-teal-400 to-green-500 text-white border-0 hover:opacity-90 text-sm"><Plus className="w-4 h-4" /> קטגוריה חדשה</Button>}
          </div>
        }
      />

      {warnings.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-5">
          {warnings.map(c => {
            const pct = Math.round(((c.reserved_amount || 0) + (c.spent_amount || 0)) / c.allocated_amount * 100);
            return <div key={c.id} className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 rounded-xl px-3 py-2 text-xs font-medium"><AlertTriangle className="w-3.5 h-3.5" />{c.name}: {pct}%</div>;
          })}
        </div>
      )}

      {/* Source summary */}
      <div className="bg-card border border-border rounded-2xl p-5 mb-6">
        <div className="grid grid-cols-4 gap-3 mb-3 text-center">
          <div><p className="text-xs text-muted-foreground">תקציב כולל</p><p className="text-2xl font-bold">₪{catTotals.total.toLocaleString('he-IL')}</p></div>
          <div><p className="text-xs text-muted-foreground">משוריין</p><p className="text-2xl font-bold text-amber-600">₪{catTotals.reserved.toLocaleString('he-IL')}</p></div>
          <div><p className="text-xs text-muted-foreground">נוצל בפועל</p><p className="text-2xl font-bold text-red-500">₪{catTotals.spent.toLocaleString('he-IL')}</p></div>
          <div><p className="text-xs text-muted-foreground">יתרה זמינה</p><p className="text-2xl font-bold text-teal-600">₪{avail.toLocaleString('he-IL')}</p></div>
        </div>
        <ProgressBar value={catTotals.reserved + catTotals.spent} max={catTotals.total} color="#14b8a6" />
        <div className="flex justify-between text-xs text-muted-foreground mt-1">
          <span>{usedPct}% מנוצל</span>
          {activeSource?.start_date && <span>התחלה: {new Date(activeSource.start_date).toLocaleDateString('he-IL')}</span>}
          {activeSource?.end_date && <span>סיום: {new Date(activeSource.end_date).toLocaleDateString('he-IL')}</span>}
        </div>
      </div>

      <div className="flex gap-1 bg-muted rounded-xl p-1 mb-5 w-fit">
        {VIEWS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setView(id)} className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all', view === id ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground')}>
            <Icon className="w-3.5 h-3.5" />{label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" /></div>
      ) : categories.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="mb-3">אין קטגוריות תקציב במקור זה.</p>
          {canEdit && <Button onClick={openNewCat} variant="outline" className="gap-2"><Plus className="w-4 h-4" /> הוסף קטגוריה ראשונה</Button>}
        </div>
      ) : (
        <motion.div key={view} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          {view === 'overview' && (
            <div className="space-y-3">
              {categories.map(cat => {
                const reserved = cat.reserved_amount || 0;
                const spent = cat.spent_amount || 0;
                const allocated = cat.allocated_amount || 0;
                const catAvail = Math.max(0, allocated - reserved - spent);
                const pct = allocated > 0 ? Math.min(100, ((reserved + spent) / allocated) * 100) : 0;
                const linkedOrders = getLinkedOrders(cat.id);
                const allTxs = (cat.transactions || []).sort((a, b) => b.date?.localeCompare?.(a.date) || 0);

                return (
                  <div key={cat.id} className="bg-card border border-border rounded-2xl p-5 hover:border-teal-300 hover:shadow-sm transition-all">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color || '#14b8a6' }} />
                        <span className="font-bold">{cat.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {canAddExpense && <Button size="sm" variant="outline" className="text-xs gap-1" onClick={() => openAddExpense(cat)}><Plus className="w-3 h-3" /> הוצאה ידנית</Button>}
                        {canEdit && <Button size="sm" variant="ghost" className="text-xs" onClick={() => openEditCat(cat)}><Pencil className="w-3 h-3" /></Button>}
                      </div>
                    </div>

                    {/* Hide transaction history from local_manager */}
                    {!canViewSensitive && allTxs.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-border">
                        <p className="text-xs font-medium text-muted-foreground mb-1.5">היסטוריית הוצאות ({allTxs.length})</p>
                        <div className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-3 text-center">
                          נתון חסוי - פנה למנהלת המערכת לצפייה בפרטי ההוצאות
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-4 gap-3 mb-3 text-center">
                      <div><p className="text-xs text-muted-foreground">מוקצה</p><p className="font-bold">₪{allocated.toLocaleString('he-IL')}</p></div>
                      <div><p className="text-xs text-muted-foreground">משוריין</p><p className="font-bold text-amber-600">₪{reserved.toLocaleString('he-IL')}</p></div>
                      <div><p className="text-xs text-muted-foreground">נוצל</p><p className={cn('font-bold', spent > 0 ? 'text-red-500' : 'text-muted-foreground')}>₪{spent.toLocaleString('he-IL')}</p></div>
                      <div><p className="text-xs text-muted-foreground">יתרה</p><p className="font-bold text-teal-600">₪{catAvail.toLocaleString('he-IL')}</p></div>
                    </div>
                    <ProgressBar value={reserved + spent} max={allocated} color={cat.color} />
                    <div className="flex justify-between text-xs text-muted-foreground mt-1"><span>{pct.toFixed(0)}% מנוצל</span></div>

                    {/* Orders linked to this category */}
                    {linkedOrders.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-border">
                        <p className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1"><ShoppingCart className="w-3 h-3" /> הזמנות רכש ({linkedOrders.length})</p>
                        <div className="space-y-1">
                          {linkedOrders.map(o => (
                            <Link key={o.id} to={`/orders/${o.id}`} className="flex items-center justify-between text-xs hover:bg-muted/60 rounded-lg px-2 py-1 -mx-2 transition-colors">
                              <span className="truncate max-w-36">{o.title || o.supplier_name || 'ללא כותרת'}</span>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className={cn('px-1.5 py-0.5 rounded-full text-[10px]',
                                  o.status === 'approved' ? 'bg-blue-100 text-blue-700' : o.status === 'ordered' ? 'bg-purple-100 text-purple-700' :
                                  o.status === 'received_full' ? 'bg-green-100 text-green-700' : o.status === 'cancelled' ? 'bg-red-100 text-red-500' : 'bg-slate-100 text-slate-600')}>
                                  {ORDER_STATUS_LABELS[o.status] || o.status}
                                </span>
                                <span className="font-medium">₪{(o.total_amount || 0).toLocaleString('he-IL')}</span>
                                <ExternalLink className="w-3 h-3 text-muted-foreground" />
                              </div>
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Transaction history — only for admin and remote_manager */}
                    {canViewSensitive && allTxs.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-border">
                        <p className="text-xs font-medium text-muted-foreground mb-1.5">היסטוריית הוצאות ({allTxs.length})</p>
                        <div className="space-y-1">
                          {allTxs.slice(0, 5).map((tx, i) => (
                            <div key={i} className="flex items-center justify-between gap-2 text-xs hover:bg-muted/40 rounded-lg px-2 py-1 transition-colors">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className={cn('text-[10px] px-1 py-0.5 rounded-full shrink-0', tx.is_manual ? 'bg-slate-100 text-slate-600' : 'bg-blue-100 text-blue-700')}>
                                  {tx.is_manual ? 'ידני' : 'הזמנה'}
                                </span>
                                <span className="text-muted-foreground shrink-0">{tx.date}</span>
                                {tx.supplier_name && <span className="font-medium truncate">{tx.supplier_name}</span>}
                                {tx.description && <span className="text-muted-foreground truncate hidden sm:inline">· {tx.description}</span>}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="font-bold text-red-600">-₪{(tx.amount || 0).toLocaleString('he-IL')}</span>
                                {tx.order_id && <Link to={`/orders/${tx.order_id}`} className="text-muted-foreground hover:text-primary"><ExternalLink className="w-3 h-3" /></Link>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {view === 'pie' && <BudgetPieChart categories={categories} />}
          {view === 'bar' && <BudgetBarChart categories={categories} />}
          {view === 'table' && <BudgetTable categories={categories} onEdit={openEditCat} onAddExpense={openAddExpense} canEdit={canEdit} />}
        </motion.div>
      )}

      <CategoryDialog open={catDialogOpen} onOpenChange={setCatDialogOpen} category={editingCat} onSubmit={handleSaveCategory} />
      <AddExpenseDialog open={expenseDialogOpen} onOpenChange={setExpenseDialogOpen} categories={categories} preselected={preselectedCat} onSubmit={handleAddExpense} />
    </div>
  );
}