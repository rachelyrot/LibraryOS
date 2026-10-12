import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Plus, Search, FileText, Upload, Trash2, ExternalLink, CheckCircle, ShoppingCart, Star, AlertCircle, Wallet, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';
import QuoteComparison from '@/components/quotes/QuoteComparison';
import useCategories from '@/hooks/useCategories';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { canApproveQuotes, canConvertQuoteToOrder, canAccessPage } from '@/lib/permissions';
import { allocationRemaining, allocationLabel, budgetSourceOptions, singleAllocationFor } from '@/lib/budgetUpdater';

const STATUS_FLOW = {
  draft:            { next: 'sent_to_supplier',  label: 'שלח לספק',        color: 'bg-blue-500' },
  sent_to_supplier: { next: 'received',           label: 'סמן שהתקבלה',     color: 'bg-teal-500' },
  received:         { next: 'in_review',           label: 'עבור לבדיקה',     color: 'bg-indigo-500' },
  in_review:        { next: 'pending_approval',    label: 'העבר לאישור',     color: 'bg-amber-500' },
  pending_approval: { next: 'approved',            label: 'אשר הצעה',        color: 'bg-green-500' },
};

const STATUS_LABELS = {
  draft: 'טיוטה', sent_to_supplier: 'נשלחה לספק', received: 'התקבלה מהספק',
  in_review: 'בבדיקה', pending_approval: 'ממתינה לאישור', approved: 'אושרה',
  rejected: 'נדחתה', expired: 'פג תוקף', converted_to_order: 'הפכה להזמנת רכש',
};

const FUNDING_TYPES = [
  { value: 'municipal', label: 'תקציב עירוני' },
  { value: 'culture_ministry', label: 'תקציב משרד התרבות' },
  { value: 'mifal_hapais', label: 'מפעל הפיס' },
  { value: 'kol_kore', label: 'קול קורא / תמיכה' },
  { value: 'supplier_credit', label: 'זיכוי ספק' },
  { value: 'other', label: 'אחר' },
];

const EMPTY_ITEM = { name: '', description: '', quantity: 1, unit_price: 0, total: 0, notes: '' };
const EMPTY = {
  title: '', request_title: '', quote_number: '', supplier_id: '', supplier_name: '',
  category: '', subcategory: '',
  open_date: new Date().toISOString().split('T')[0], validity_date: '',
  funding_source_type: '', budget_source_id: '', budget_category_id: '', credit_id: '',
  status: 'draft', notes: '', total_amount: 0,
  file_url: '', items: [], selected: false,
};

export default function Quotes() {
  const { mains, getSubcategories, getLabel } = useCategories();
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [suppliers, setSuppliers] = useState([]);
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [showComparison, setShowComparison] = useState(false);
  const [bookBlocked, setBookBlocked] = useState(false);
  const [user, setUser] = useState(null);

  // Permission checks
  const canApprove = canApproveQuotes(user);
  const canConvert = canConvertQuoteToOrder(user);

  // Budget data
  const [budgetSources, setBudgetSources] = useState([]);
  const [allCategories, setAllCategories] = useState([]);
  const [supplierCredits, setSupplierCredits] = useState([]);
  const [fundingError, setFundingError] = useState(null);
  const [needsFundingFix, setNeedsFundingFix] = useState(false);

  const load = () => base44.entities.QuoteRequest.list('-created_date', 200).then(data => { setQuotes(data); setLoading(false); });
  const loadSuppliers = () => base44.entities.Supplier.list('name', 500).then(setSuppliers).catch(() => {});
  const loadBudget = () => {
    Promise.all([
      base44.entities.BudgetSource.filter({ status: 'active' }, 'name', 100),
      base44.entities.BudgetAllocation.list('name', 300),
      base44.entities.SupplierCredit.list('-created_date', 100),
    ]).then(([bs, ac, sc]) => {
      setBudgetSources(bs);
      setAllCategories(ac);
      setSupplierCredits(sc);
    }).catch(() => {});
  };

  useEffect(() => { load(); loadSuppliers(); loadBudget(); base44.auth.me().then(setUser).catch(() => {}); }, []);

  const quoteMains = useMemo(() => mains.filter(c => c.value !== 'ספרים'), [mains]);
  const BOOK_SUBCATS = ['ספרי נוער', 'ספרי עיון', 'ספרי ילדים'];
  const filterBookSubs = (subs) => subs.filter(s => !BOOK_SUBCATS.includes(s.label || s.value));

  // Credit/funding filtering for the form
  const formSupplierId = form.supplier_id;
  const filteredCredits = formSupplierId
    ? supplierCredits.filter(c => {
        if (c.supplier_id !== formSupplierId) return false;
        if (c.status !== 'active') return false;
        const rem = c.remaining_amount !== undefined ? c.remaining_amount : Math.max(0, (c.total_amount || 0) - (c.reserved_amount || 0) - (c.used_amount || 0));
        if (rem <= 0) return false;
        if (c.valid_until && new Date(c.valid_until) < new Date()) return false;
        return true;
      })
    : [];
  const sourceCategories = allCategories.filter(c => c.budget_source_id === form.budget_source_id);
  const singleAllocation = singleAllocationFor(budgetSources.find(s => s.id === form.budget_source_id), allCategories);
  const sourceOptions = budgetSourceOptions(budgetSources, allCategories, form.funding_source_type);

  const openNew = () => {
    setEditing(null);
    const num = `Q-${Date.now().toString(36).toUpperCase()}`;
    setForm({ ...EMPTY, quote_number: num, open_date: new Date().toISOString().split('T')[0], items: [] });
    setBookBlocked(false);
    setFundingError(null);
    setNeedsFundingFix(false);
    setOpen(true);
  };

  const openEdit = (q) => {
    setEditing(q);
    const hasOldFunding = q.funding_source && !q.funding_source_type;
    setForm({
      ...q,
      items: q.items || [],
      funding_source_type: q.funding_source_type || '',
      budget_source_id: q.budget_source_id || '',
      budget_category_id: q.budget_category_id || '',
      credit_id: q.credit_id || '',
    });
    setBookBlocked(false);
    setFundingError(null);
    setNeedsFundingFix(false);
    setOpen(true);
  };

  const handleCategoryChange = (v) => {
    if (v === 'ספרים') {
      setBookBlocked(true);
      setForm(f => ({ ...f, category: '', subcategory: '' }));
      return;
    }
    setBookBlocked(false);
    setForm(f => ({ ...f, category: v, subcategory: '' }));
  };

  // Funding handlers (mirror OrderDetail)
  const handleFundingChange = (type) => {
    setForm(f => ({ ...f, funding_source_type: type, budget_source_id: '', budget_category_id: '', credit_id: '' }));
    setFundingError(null);
  };

  const handleBudgetSourceSelect = (sourceId) => {
    const src = budgetSources.find(s => s.id === sourceId);
    // מקור בלי חלוקה לקטגוריות — הקטגוריה היחידה שלו נבחרת אוטומטית
    const single = singleAllocationFor(src, allCategories);
    setForm(f => ({ ...f, budget_source_id: sourceId, budget_category_id: single?.id || '' }));
    setFundingError(null);
  };

  const handleBudgetCategorySelect = (catId) => {
    setForm(f => ({ ...f, budget_category_id: catId }));
    setFundingError(null);
  };

  const handleCreditSelect = (creditId) => {
    setForm(f => ({ ...f, credit_id: creditId }));
    setFundingError(null);
  };

  const updateItem = (i, field, val) => {
    const items = [...(form.items || [])];
    items[i] = { ...items[i], [field]: val };
    if (field === 'quantity' || field === 'unit_price') {
      items[i].total = (items[i].quantity || 0) * (items[i].unit_price || 0);
    }
    setForm(f => ({ ...f, items, total_amount: items.reduce((s, it) => s + (it.total || 0), 0) }));
  };
  const addItem = () => setForm(f => ({ ...f, items: [...(f.items || []), { ...EMPTY_ITEM }] }));
  const removeItem = (i) => {
    const items = (form.items || []).filter((_, idx) => idx !== i);
    setForm(f => ({ ...f, items, total_amount: items.reduce((s, it) => s + (it.total || 0), 0) }));
  };

  const save = async () => {
    setSaving(true);
    const data = { ...form };
    if (!editing && !data.quote_number) data.quote_number = `Q-${Date.now().toString(36).toUpperCase()}`;
    try {
      if (editing) { await base44.entities.QuoteRequest.update(editing.id, data); toast.success('ההצעה עודכנה!'); }
      else { await base44.entities.QuoteRequest.create(data); toast.success('ההצעה נשמרה!'); }
      setSaving(false); setOpen(false); load();
    } catch (e) { toast.error('שגיאה בשמירה'); setSaving(false); }
  };

  const advanceStatus = async (quote) => {
    const flow = STATUS_FLOW[quote.status];
    if (!flow) return;
    
    // Check permission for approval action
    if (flow.next === 'approved' && !canApprove) {
      toast.error('אין לך הרשאה לאשר הצעת מחיר.');
      return;
    }
    
    await base44.entities.QuoteRequest.update(quote.id, { status: flow.next });
    toast.success(`הסטטוס עודכן ל-${flow.label}`);
    load();
  };

  const handleFile = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setForm(f => ({ ...f, file_url }));
    } catch (e) { toast.error('שגיאה בהעלאת הקובץ'); }
    setUploading(false);
  };

  const markSelected = async (quote) => {
    const groupTitle = quote.request_title;
    const group = quotes.filter(q => q.request_title === groupTitle && q.id !== quote.id);
    for (const g of group) {
      if (g.selected) await base44.entities.QuoteRequest.update(g.id, { selected: false });
    }
    await base44.entities.QuoteRequest.update(quote.id, { selected: !quote.selected });
    load();
    toast.success(quote.selected ? 'הבחירה בוטלה' : 'ההצעה נבחרה');
  };

  const createPurchaseOrder = async (quote) => {
    // Check permission first
    if (!canConvert) {
      toast.error('אין לך הרשאה ליצור הזמנת רכש מהצעת מחיר.');
      return;
    }
    
    if (quote.order_created || quote.linked_order_id) { toast.error('כבר נוצרה הזמנת רכש מהצעה זו'); return; }

    // If old-style funding, force fix
    const hasOldFunding = quote.funding_source && !quote.funding_source_type;
    const hasNewFunding = quote.funding_source_type && (quote.budget_category_id || quote.credit_id);

    if (hasOldFunding && !hasNewFunding) {
      const latest = await base44.entities.QuoteRequest.filter({ id: quote.id });
      const q = latest[0] || quote;
      if (q.funding_source && !q.funding_source_type) {
        toast.error('יש לעדכן את מקור המימון בהצעה לפורמט החדש לפני יצירת הזמנה. פתח את ההצעה לעריכה.');
        return;
      }
    }

    setCreatingOrder(true);
    try {
      const items = (quote.items || []).map(it => ({
        name: it.name,
        description: it.description || '',
        quantity: it.quantity || 1,
        unit_price: it.unit_price || 0,
        total: (it.quantity || 1) * (it.unit_price || 0),
        notes: it.notes || '',
      }));
      const total = items.reduce((s, i) => s + i.total, 0);

      const po = await base44.entities.PurchaseOrder.create({
        title: quote.title,
        supplier_id: quote.supplier_id,
        supplier_name: quote.supplier_name,
        category: quote.category,
        subcategory: quote.subcategory,
        status: 'draft',
        total_amount: total,
        funding_source_type: quote.funding_source_type || '',
        budget_source_id: quote.budget_source_id || '',
        budget_source_name: (budgetSources.find(bs => bs.id === quote.budget_source_id) || {}).name || '',
        budget_category_id: quote.budget_category_id || '',
        budget_category_name: allocationLabel(allCategories.find(c => c.id === quote.budget_category_id)),
        credit_id: quote.credit_id || '',
        items,
        notes: quote.notes ? `${quote.notes}\n\n---\nנוצר מהצעת מחיר "${quote.title}"` : `נוצר מהצעת מחיר "${quote.title}"`,
        source_quote_id: quote.id,
        file_url: quote.file_url || '',
      });

      await base44.entities.QuoteRequest.update(quote.id, {
        status: 'converted_to_order',
        order_created: true,
        linked_order_id: po.id,
      });

      toast.success('הזמנת רכש נוצרה בהצלחה מתוך הצעת המחיר!');
      load();
    } catch (e) { toast.error('שגיאה ביצירת הזמנת רכש'); }
    setCreatingOrder(false);
  };

  const filtered = quotes.filter(q => {
    const matchSearch = !search || q.title?.includes(search) || q.supplier_name?.includes(search) || getLabel(q.category)?.includes(search) || q.quote_number?.includes(search) || q.request_title?.includes(search);
    const matchStatus = statusFilter === 'all' || q.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const comparisonGroups = useMemo(() => {
    const groups = {};
    for (const q of quotes) {
      if (!q.request_title) continue;
      if (!groups[q.request_title]) groups[q.request_title] = [];
      groups[q.request_title].push(q);
    }
    return Object.values(groups).filter(g => g.length >= 2);
  }, [quotes]);

  return (
    <div className="p-6 max-w-5xl mx-auto animate-fade-in">
      <PageHeader
        title="הצעות מחיר"
        subtitle={`${quotes.length} הצעות`}
        gradient="from-teal-400 to-blue-500"
        actions={
          <div className="flex gap-2">
            {comparisonGroups.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => setShowComparison(!showComparison)} className="gap-1.5 text-xs">
                <Star className="w-3.5 h-3.5" /> {showComparison ? 'הסתר השוואה' : `השוואת הצעות (${comparisonGroups.length})`}
              </Button>
            )}
            <Button onClick={openNew} className="gap-2 bg-gradient-to-l from-teal-400 to-blue-500 text-white border-0 hover:opacity-90">
              <Plus className="w-4 h-4" /> הצעה חדשה
            </Button>
          </div>
        }
      />

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4 flex items-start gap-2">
        <AlertCircle className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
        <p className="text-sm text-blue-700">
          <strong>שימו לב:</strong> הצעות מחיר מיועדות לציוד, שירותים, ריהוט, מחשוב, תחזוקה ופעילות תרבות.<br />
          ספרים מנוהלים דרך{' '}
          <Link to="/book-lists" className="underline font-medium hover:text-blue-900">מודול רשימות ספרים מספקים</Link>.
        </p>
      </div>

      {showComparison && comparisonGroups.length > 0 && (
        <div className="space-y-4 mb-5">
          {comparisonGroups.map(group => (
            <QuoteComparison key={group[0].request_title || group[0].id} grouped={group} onSelect={markSelected} getLabel={getLabel} />
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="חיפוש לפי כותרת, ספק, בקשה..." className="pr-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-2 flex-wrap">
          {[{ value: 'all', label: 'הכל' }, ...Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))].map(s => (
            <button key={s.value} onClick={() => setStatusFilter(s.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${statusFilter === s.value ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-muted text-muted-foreground hover:bg-secondary'}`}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground"><FileText className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>אין הצעות מחיר</p></div>
      ) : (
        <div className="space-y-2">
          {filtered.map(q => {
            const canAdvance = STATUS_FLOW[q.status];
            return (
              <motion.div key={q.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="flex items-center gap-4 bg-card border border-border rounded-2xl px-5 py-4 cursor-pointer hover:border-teal-300 hover:shadow-sm transition-all"
                onClick={() => openEdit(q)}>
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                  q.selected ? "bg-gradient-to-br from-green-100 to-emerald-100" : "bg-gradient-to-br from-teal-100 to-blue-100")}>
                  {q.selected ? <Star className="w-5 h-5 text-green-600" /> : <FileText className="w-5 h-5 text-teal-600" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    {q.quote_number && <span className="text-xs text-muted-foreground font-mono">{q.quote_number}</span>}
                    {q.category && <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">{getLabel(q.category)}</span>}
                    {q.subcategory && <span className="text-xs bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full">{q.subcategory}</span>}
                    {q.order_created && <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">נוצרה הזמנה</span>}
                    {q.selected && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full flex items-center gap-1"><Star className="w-3 h-3" /> נבחרה</span>}
                  </div>
                  <p className="font-semibold text-foreground">{q.title}</p>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {q.supplier_name}
                    {q.request_title && q.request_title !== q.title && <span className="mr-2 text-amber-600">· בקשה: {q.request_title}</span>}
                    {q.validity_date && <span className="mr-2">· תוקף: {new Date(q.validity_date).toLocaleDateString('he-IL')}</span>}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0" onClick={e => e.stopPropagation()}>
                  {q.total_amount > 0 && <span className="font-bold">₪{(q.total_amount || 0).toLocaleString('he-IL')}</span>}
                  <StatusBadge status={q.status} entityType="QuoteRequest" />
                  {q.linked_order_id && (
                    <Link to={`/orders/${q.linked_order_id}`} className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-0.5" title="פתח הזמנת רכש">
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                  )}
                  {canAdvance && (canApprove || q.status !== 'pending_approval') && (
                    <Button size="sm" className={`${canAdvance.color} text-white border-0 h-7 text-xs hover:opacity-90`} onClick={() => advanceStatus(q)}>
                      <CheckCircle className="w-3 h-3 ml-1" /> {canAdvance.label}
                    </Button>
                  )}
                  {q.status === 'approved' && !q.order_created && canConvert && (
                    <Button size="sm" onClick={() => createPurchaseOrder(q)} disabled={creatingOrder}
                      className="bg-gradient-to-l from-purple-500 to-indigo-500 text-white border-0 h-7 text-xs hover:opacity-90">
                      <ShoppingCart className="w-3 h-3 ml-1" /> {creatingOrder ? 'יוצר...' : 'צור הזמנת רכש'}
                    </Button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto font-heebo" dir="rtl">
          <DialogHeader><DialogTitle>{editing ? 'עריכת הצעת מחיר' : 'הצעת מחיר חדשה'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>מספר הצעה</Label><Input value={form.quote_number || ''} onChange={e => setForm(f => ({ ...f, quote_number: e.target.value }))} disabled /></div>
              <div className="space-y-1.5"><Label>תאריך פתיחה</Label><Input type="date" value={form.open_date || ''} onChange={e => setForm(f => ({ ...f, open_date: e.target.value }))} /></div>
            </div>
            <div className="space-y-1.5"><Label>כותרת הצעה *</Label><Input value={form.title || ''} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="תאור קצר להצעה" /></div>
            <div className="space-y-1.5">
              <Label>כותרת הבקשה</Label>
              <Input value={form.request_title || ''} onChange={e => setForm(f => ({ ...f, request_title: e.target.value }))} placeholder="להשוואת הצעות – הקלד כותרת זהה להצעות מאותה בקשה" />
              <p className="text-xs text-muted-foreground">שימוש להשוואה: הצעות עם אותה כותרת בקשה יוצגו יחד להשוואת מחירים</p>
            </div>
            <div className="space-y-1.5">
              <Label>ספק *</Label>
              <Select value={form.supplier_id || ''} onValueChange={v => {
                const sup = suppliers.find(s => s.id === v);
                setForm(f => ({ ...f, supplier_id: v, supplier_name: sup?.name || '', credit_id: '' }));
              }}>
                <SelectTrigger><SelectValue placeholder="בחר ספק" /></SelectTrigger>
                <SelectContent>{suppliers.filter(s => s.status === 'active').map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>קטגוריה ראשית</Label>
                <Select value={form.category || ''} onValueChange={handleCategoryChange}>
                  <SelectTrigger><SelectValue placeholder="בחר קטגוריה" /></SelectTrigger>
                  <SelectContent>{quoteMains.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
                {bookBlocked && (
                  <p className="text-sm text-amber-600 bg-amber-50 rounded-lg p-2 flex items-start gap-1.5">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> ספרים מנוהלים דרך מודול רשימות ספרים מספקים.
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>תת-קטגוריה</Label>
                <Select value={form.subcategory || ''} onValueChange={v => setForm(f => ({ ...f, subcategory: v }))} disabled={!form.category}>
                  <SelectTrigger><SelectValue placeholder="בחר" /></SelectTrigger>
                  <SelectContent>{filterBookSubs(getSubcategories(form.category)).map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            {/* Funding source section (new - same as OrderDetail) */}
            <div className="border border-border rounded-xl p-4 space-y-3 bg-muted/20">
              <h3 className="font-bold text-sm flex items-center gap-2"><Wallet className="w-4 h-4 text-teal-500" /> מקור מימון (יישמר להזמנת הרכש)</h3>
              <div className="space-y-1.5">
                <Label>סוג מקור מימון</Label>
                <Select value={form.funding_source_type || ''} onValueChange={handleFundingChange}>
                  <SelectTrigger><SelectValue placeholder="בחר סוג מימון" /></SelectTrigger>
                  <SelectContent>{FUNDING_TYPES.map(ft => <SelectItem key={ft.value} value={ft.value}>{ft.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {form.funding_source_type === 'supplier_credit' ? (
                <div className="space-y-1.5">
                  <Label>זיכוי ספק</Label>
                  <Select value={form.credit_id || ''} onValueChange={handleCreditSelect} disabled={!form.supplier_id}>
                    <SelectTrigger><SelectValue placeholder={form.supplier_id ? 'בחר זיכוי' : 'יש לבחור ספק תחילה'} /></SelectTrigger>
                    <SelectContent>
                      {filteredCredits.length === 0 ? (
                        <div className="px-2 py-3 text-sm text-muted-foreground text-center">אין זיכויים פעילים לספק זה</div>
                      ) : (
                        filteredCredits.map(c => {
                          const rem = c.remaining_amount !== undefined ? c.remaining_amount : Math.max(0, (c.total_amount || 0) - (c.reserved_amount || 0) - (c.used_amount || 0));
                          return <SelectItem key={c.id} value={c.id}>{c.credit_type === 'refund' ? 'החזר' : 'זיכוי'} · יתרה ₪{rem.toLocaleString('he-IL')}</SelectItem>;
                        })
                      )}
                    </SelectContent>
                  </Select>
                </div>
              ) : form.funding_source_type ? (
                <>
                  <div className="space-y-1.5">
                    <Label>מקור תקציב</Label>
                    <Select value={form.budget_source_id || ''} onValueChange={handleBudgetSourceSelect}>
                      <SelectTrigger><SelectValue placeholder="בחר מקור תקציב" /></SelectTrigger>
                      <SelectContent>
                        {sourceOptions.length === 0 ? (
                          <div className="px-2 py-3 text-sm text-muted-foreground text-center">אין מקורות תקציב מסוג זה</div>
                        ) : (
                          sourceOptions.map(bs => (
                            <SelectItem key={bs.id} value={bs.id} disabled={!bs.hasCategories}>
                              {bs.name} · {bs.hasCategories ? `יתרה ₪${bs.remaining.toLocaleString('he-IL')}` : 'טרם חולק לקטגוריות'}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  {singleAllocation && (
                    <p className="text-xs text-muted-foreground">
                      מקור ללא חלוקה לקטגוריות{singleAllocation.category_number ? ` · מספר קטגוריה ${singleAllocation.category_number}` : ''} · יתרה ₪{allocationRemaining(singleAllocation).toLocaleString('he-IL')}
                    </p>
                  )}
                  {form.budget_source_id && !singleAllocation && sourceCategories.length > 0 && (
                    <div className="space-y-1.5">
                      <Label>קטגוריית תקציב</Label>
                      <Select value={form.budget_category_id || ''} onValueChange={handleBudgetCategorySelect}>
                        <SelectTrigger><SelectValue placeholder="בחר קטגוריית תקציב" /></SelectTrigger>
                        <SelectContent>
                          {sourceCategories.map(cat => {
                            const rem = allocationRemaining(cat);
                            const insufficient = form.total_amount > rem;
                            return <SelectItem key={cat.id} value={cat.id} disabled={insufficient}>{allocationLabel(cat)} · יתרה ₪{rem.toLocaleString('he-IL')}{insufficient ? ' (אין מספיק)' : ''}</SelectItem>;
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {form.budget_source_id && sourceCategories.length === 0 && (
                    <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 rounded-lg p-3">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <p>
                        התקציב של "{budgetSources.find(bs => bs.id === form.budget_source_id)?.name}" עדיין לא חולק לקטגוריות, ולכן אי אפשר לחייב אותו.{' '}
                        {canAccessPage(user, '/credits')
                          ? 'יש להגדיר קטגוריות בדף "מקורות תקציב", או לבחור מקור אחר.'
                          : 'יש לבחור מקור אחר, או לפנות למנהל/ת המערכת כדי שיחלק את התקציב לקטגוריות.'}
                      </p>
                    </div>
                  )}
                </>
              ) : null}

              {fundingError && (
                <div className="flex items-start gap-2 text-sm text-amber-600 bg-amber-50 rounded-lg p-3">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /><span>{fundingError}</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>סטטוס</Label>
                <Select value={form.status || 'draft'} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(STATUS_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>תוקף הצעה</Label><Input type="date" value={form.validity_date || ''} onChange={e => setForm(f => ({ ...f, validity_date: e.target.value }))} /></div>
            </div>

            <div className="space-y-1.5"><Label>תיאור / הערות</Label><Textarea value={form.notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} /></div>
            <div className="space-y-1.5">
              <Label>קובץ הצעת מחיר</Label>
              <label className="flex items-center gap-2 cursor-pointer border-2 border-dashed border-border rounded-xl p-3 hover:border-teal-400 transition-colors">
                <Upload className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">{uploading ? 'מעלה...' : form.file_url ? 'קובץ הועלה ✓' : 'העלאת קובץ'}</span>
                <input type="file" className="hidden" onChange={handleFile} accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.png" />
              </label>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-bold text-sm">פריטים בהצעה</h3>
                <Button variant="outline" size="sm" onClick={addItem} className="gap-1 text-xs"><Plus className="w-3 h-3" /> הוסף פריט</Button>
              </div>
              {(form.items || []).length === 0 ? (
                <div className="border-2 border-dashed border-border rounded-xl p-4 text-center text-muted-foreground text-sm cursor-pointer hover:border-teal-400 transition-colors" onClick={addItem}>לחץ להוספת פריטים להצעה</div>
              ) : (
                <div className="border border-border rounded-xl overflow-auto max-h-60">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/40 sticky top-0">
                      <tr>
                        <th className="text-right p-1.5 font-medium text-muted-foreground">שם פריט</th>
                        <th className="text-right p-1.5 font-medium text-muted-foreground hidden md:table-cell">תיאור / מפרט</th>
                        <th className="text-center p-1.5 font-medium text-muted-foreground w-14">כמות</th>
                        <th className="text-center p-1.5 font-medium text-muted-foreground w-20">מחיר יח׳</th>
                        <th className="text-center p-1.5 font-medium text-muted-foreground w-20">סה״כ</th>
                        <th className="p-1.5 w-8" />
                      </tr>
                    </thead>
                    <tbody>
                      {(form.items || []).map((item, i) => (
                        <tr key={i} className="border-t border-border/50">
                          <td className="p-1"><Input className="h-7 text-xs" value={item.name || ''} onChange={e => updateItem(i, 'name', e.target.value)} placeholder="שם פריט" /></td>
                          <td className="p-1 hidden md:table-cell"><Input className="h-7 text-xs" value={item.description || ''} onChange={e => updateItem(i, 'description', e.target.value)} placeholder="תיאור" /></td>
                          <td className="p-1"><Input className="h-7 w-14 text-xs text-center" type="number" min={1} value={item.quantity || ''} onChange={e => updateItem(i, 'quantity', Number(e.target.value))} /></td>
                          <td className="p-1"><Input className="h-7 w-20 text-xs text-center" type="number" min={0} step={0.01} value={item.unit_price || ''} onChange={e => updateItem(i, 'unit_price', Number(e.target.value))} /></td>
                          <td className="p-1 text-center font-medium">₪{(item.total || 0).toFixed(2)}</td>
                          <td className="p-1"><button onClick={() => removeItem(i)} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {(form.items || []).length > 0 && (
                <div className="flex justify-end mt-2">
                  <span className="font-bold text-lg">סה״כ: ₪{(form.total_amount || 0).toLocaleString('he-IL')}</span>
                </div>
              )}
            </div>

            {editing?.order_created && editing?.linked_order_id && (
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 flex items-center justify-between">
                <span className="text-sm text-purple-700">כבר נוצרה הזמנת רכש מהצעת מחיר זו</span>
                <Link to={`/orders/${editing.linked_order_id}`}>
                  <Button variant="outline" size="sm" className="gap-1 text-xs"><ExternalLink className="w-3 h-3" /> פתח הזמנת רכש</Button>
                </Link>
              </div>
            )}

            <div className="flex justify-between pt-2 border-t border-border">
              <Button variant="outline" onClick={() => setOpen(false)}>ביטול</Button>
              <div className="flex gap-2">
                {editing && editing.status === 'approved' && !editing.order_created && canConvert && (
                  <Button onClick={() => { createPurchaseOrder(editing); setOpen(false); }} disabled={creatingOrder}
                    className="bg-gradient-to-l from-purple-500 to-indigo-500 text-white border-0 hover:opacity-90">
                    <ShoppingCart className="w-4 h-4 ml-1" /> {creatingOrder ? 'יוצר...' : 'צור הזמנת רכש'}
                  </Button>
                )}
                <Button onClick={save} disabled={saving} className="bg-gradient-to-l from-teal-400 to-blue-500 text-white border-0 hover:opacity-90">
                  {saving ? 'שומר...' : 'שמור'}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}