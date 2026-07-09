import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowRight, Trash2, Plus, Save, CheckCircle, Package, FileText, BookMarked, Truck, AlertCircle, Wallet, Layers, XCircle, RotateCcw, Ban, FolderKanban } from 'lucide-react';
import StatusBadge from '@/components/StatusBadge';
import GoodsReceiptDialog from '@/components/GoodsReceiptDialog';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import useCategories from '@/hooks/useCategories';
import { cn } from '@/lib/utils';
import { handleBudgetOnStatusChange, validateBudgetSelection } from '@/lib/budgetUpdater';
import { canApproveOrders, canRejectOrders, canCancelOrders, canReceiveGoods, canDeleteMasterData } from '@/lib/permissions';

const FUNDING_TYPES = [
  { value: 'municipal', label: 'תקציב עירוני' },
  { value: 'culture_ministry', label: 'תקציב משרד התרבות' },
  { value: 'mifal_hapais', label: 'מפעל הפיס' },
  { value: 'kol_kore', label: 'קול קורא / תמיכה' },
  { value: 'supplier_credit', label: 'זיכוי ספק' },
  { value: 'other', label: 'אחר' },
];

const EMPTY_ORDER = {
  title: '', supplier_id: '', supplier_name: '', supplier_contact: '', order_type: 'books',
  category: '', subcategory: '',
  status: 'draft', requested_by: '', notes: '', total_amount: 0,
  funding_source_type: '', budget_source_id: '', budget_source_name: '',
  budget_category_id: '', budget_category_name: '',
  credit_id: '', budget_updated: false, items: [],
};

export default function OrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const isNew = id === 'new' || location.pathname.endsWith('/new');
  const [order, setOrder] = useState(EMPTY_ORDER);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [user, setUser] = useState(null);
  const [suppliers, setSuppliers] = useState([]);
  const [budgetSources, setBudgetSources] = useState([]);
  const [allCategories, setAllCategories] = useState([]);
  const [supplierCredits, setSupplierCredits] = useState([]);
  const [projects, setProjects] = useState([]);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [fundingError, setFundingError] = useState(null);
  const [validating, setValidating] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const { mains, getSubcategories, getLabel } = useCategories();

  const isApprover = canApproveOrders(user);
  const canCancel = canCancelOrders(user);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
    base44.entities.Supplier.list('name', 500).then(setSuppliers).catch(() => {});
    base44.entities.BudgetSource.filter({ status: 'active' }, 'name', 100).then(setBudgetSources).catch(() => {});
    base44.entities.BudgetAllocation.list('name', 300).then(setAllCategories).catch(() => {});
    base44.entities.SupplierCredit.list('-created_date', 100).then(setSupplierCredits).catch(() => {});
    base44.entities.Project.list('-created_date', 200).then(setProjects).catch(() => {});
    if (!isNew) {
      base44.entities.PurchaseOrder.filter({ id }).then(data => {
        if (data[0]) {
          const o = data[0];
          if (o.budget_source && !o.funding_source_type) {
            o.funding_source_type = o.budget_source === 'supplier_credit' ? 'supplier_credit' :
              o.budget_source === 'culture_ministry_grant' ? 'culture_ministry' : 'other';
          }
          setOrder(o);
        }
        setLoading(false);
      });
    }
  }, [id]);

  const filteredCredits = order.supplier_id
    ? supplierCredits.filter(c => {
        if (c.supplier_id !== order.supplier_id) return false;
        if (c.status !== 'active') return false;
        const rem = c.remaining_amount !== undefined ? c.remaining_amount : Math.max(0, (c.total_amount || 0) - (c.reserved_amount || 0) - (c.used_amount || 0));
        if (rem <= 0) return false;
        if (c.valid_until && new Date(c.valid_until) < new Date()) return false;
        return true;
      })
    : [];

  const sourceCategories = allCategories.filter(c => c.budget_source_id === order.budget_source_id);

  const handleFundingChange = (type) => {
    setOrder(o => ({ ...o, funding_source_type: type, budget_source_id: '', budget_source_name: '', budget_category_id: '', budget_category_name: '', credit_id: '' }));
    setFundingError(null);
  };

  const handleBudgetSourceSelect = (sourceId) => {
    const src = budgetSources.find(s => s.id === sourceId);
    setOrder(o => ({ ...o, budget_source_id: sourceId, budget_source_name: src?.name || '', budget_category_id: '', budget_category_name: '' }));
    setFundingError(null);
  };

  const handleBudgetCategorySelect = async (catId) => {
    const cat = allCategories.find(c => c.id === catId);
    setOrder(o => ({ ...o, budget_category_id: catId, budget_category_name: cat?.name || '' }));
    setFundingError(null);
    if (catId) {
      setValidating(true);
      const { valid, error } = await validateBudgetSelection({ ...order, budget_category_id: catId, credit_id: '' });
      setValidating(false);
      if (!valid) setFundingError(error);
    }
  };

  const handleCreditSelect = (creditId) => {
    setOrder(o => ({ ...o, credit_id: creditId }));
    setFundingError(null);
  };

  const updateItem = (i, field, val) => {
    const items = [...(order.items || [])];
    items[i] = { ...items[i], [field]: val };
    if (field === 'quantity' || field === 'unit_price') {
      items[i].total = (items[i].quantity || 0) * (items[i].unit_price || 0);
    }
    const total = items.reduce((s, it) => s + (it.total || 0), 0);
    setOrder(o => ({ ...o, items, total_amount: total }));
  };

  const addItem = () => setOrder(o => ({ ...o, items: [...(o.items || []), { name: '', quantity: 1, unit_price: 0, total: 0 }] }));
  const removeItem = (i) => {
    const items = (order.items || []).filter((_, idx) => idx !== i);
    setOrder(o => ({ ...o, items, total_amount: items.reduce((s, it) => s + (it.total || 0), 0) }));
  };

  const save = async () => {
    setSaving(true);
    const data = { ...order };
    delete data.budget_source;
    if (isNew && user) data.created_by = user.full_name || user.email;
    if (isNew) {
      const created = await base44.entities.PurchaseOrder.create(data);
      toast.success('ההזמנה נשמרה!');
      navigate(`/orders/${created.id}`);
    } else {
      await base44.entities.PurchaseOrder.update(order.id, data);
      toast.success('ההזמנה עודכנה!');
    }
    setSaving(false);
  };

  const submitForApproval = async () => {
    const today = new Date().toISOString().split('T')[0];
    const updates = {
      status: 'pending_approval',
      submitted_by: user?.full_name || user?.email || '',
      submitted_date: today,
    };
    await base44.entities.PurchaseOrder.update(order.id, updates);
    setOrder(o => ({ ...o, ...updates }));
    toast.success('ההזמנה נשלחה לאישור!');
  };

  const approveOrder = async () => {
    const { valid, error } = await validateBudgetSelection(order);
    if (!valid) { toast.error(error); return; }

    const today = new Date().toISOString().split('T')[0];
    const updates = {
      status: 'approved',
      approved_by: user?.full_name || user?.email || '',
      approved_date: today,
    };
    await base44.entities.PurchaseOrder.update(order.id, updates);
    const updatedOrder = { ...order, ...updates };

    try { await handleBudgetOnStatusChange(order, 'approved'); } catch (e) { toast.error('שגיאה בעדכון התקציב'); }

    setOrder(updatedOrder);
    toast.success('ההזמנה אושרה!');

    if (order.budget_source_id || order.credit_id) {
      base44.entities.BudgetAllocation.list('name', 300).then(setAllCategories).catch(() => {});
      base44.entities.BudgetSource.filter({ status: 'active' }, 'name', 100).then(setBudgetSources).catch(() => {});
    }
  };

  const markOrdered = async () => {
    await base44.entities.PurchaseOrder.update(order.id, { status: 'ordered' });
    setOrder(o => ({ ...o, status: 'ordered' }));
    toast.success('סומן כהוזמן!');
  };

  const openReject = () => {
    setRejectionReason('');
    setRejectOpen(true);
  };

  const confirmReject = async () => {
    if (!rejectionReason.trim()) { toast.error('יש להזין סיבת דחייה'); return; }
    setRejecting(true);
    const today = new Date().toISOString().split('T')[0];
    const updates = {
      status: 'rejected',
      rejected_by: user?.full_name || user?.email || '',
      rejected_date: today,
      rejection_reason: rejectionReason.trim(),
    };
    await base44.entities.PurchaseOrder.update(order.id, updates);
    setOrder(o => ({ ...o, ...updates }));
    toast.success('ההזמנה נדחתה');
    setRejecting(false);
    setRejectOpen(false);
  };

  const cancelOrder = async () => {
    if (!confirm('לבטל את ההזמנה?')) return;
    const today = new Date().toISOString().split('T')[0];

    if (order.budget_updated) {
      try { await handleBudgetOnStatusChange(order, 'cancelled'); } catch (e) {}
    }

    await base44.entities.PurchaseOrder.update(order.id, {
      status: 'cancelled',
      cancelled_by: user?.full_name || user?.email || '',
      cancelled_date: today,
      budget_updated: false,
    });
    setOrder(o => ({ ...o, status: 'cancelled', cancelled_by: user?.full_name, cancelled_date: today, budget_updated: false }));
    toast.success('ההזמנה בוטלה');
  };

  const resubmitOrder = async () => {
    await base44.entities.PurchaseOrder.update(order.id, {
      status: 'draft',
      rejection_reason: '',
    });
    setOrder(o => ({ ...o, status: 'draft', rejection_reason: '' }));
    toast.success('ההזמנה חזרה לטיוטה. ניתן לערוך ולהזמין מחדש.');
  };

  const deleteOrder = async () => {
    if (!confirm('למחוק הזמנה זו?')) return;
    if (order.budget_updated && order.status !== 'draft') {
      try { await handleBudgetOnStatusChange(order, 'cancelled'); } catch (e) {}
    }
    await base44.entities.PurchaseOrder.delete(order.id);
    toast.success('ההזמנה נמחקה');
    navigate('/orders');
  };

  const handleReceiptConfirmed = (updates) => {
    const newStatus = updates.status || order.status;
    setOrder(o => ({ ...o, ...updates }));
    if (newStatus === 'received_full' || newStatus === 'received_partial') {
      handleBudgetOnStatusChange(order, newStatus).catch(e => console.error('Budget update on receipt failed:', e));
    }
    toast.success('הקבלה עודכנה והמלאי התעדכן בהתאם');
  };

  const OrderFormProps = { order, setOrder, save, saving, suppliers, mains, getSubcategories, updateItem, addItem, removeItem,
    budgetSources, sourceCategories, filteredCredits, fundingError, validating,
    handleFundingChange, handleBudgetSourceSelect, handleBudgetCategorySelect, handleCreditSelect, projects };

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" /></div>;
  if (isNew) {
    return (
      <div className="p-6 max-w-4xl mx-auto animate-fade-in">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link to="/orders" className="text-muted-foreground hover:text-foreground transition-colors"><ArrowRight className="w-5 h-5" /></Link>
            <h1 className="text-2xl font-bold">הזמנה חדשה</h1>
          </div>
          <Button onClick={save} disabled={saving} className="gap-2 bg-gradient-to-l from-blue-500 to-purple-500 text-white border-0 hover:opacity-90">
            <Save className="w-4 h-4" /> {saving ? 'שומר...' : 'שמור הזמנה'}
          </Button>
        </div>
        <OrderForm {...OrderFormProps} />
      </div>
    );
  }

  const isReceived = order.status === 'received_full' || order.status === 'received_partial';
  const isRejected = order.status === 'rejected';

  return (
    <div className="p-6 max-w-4xl mx-auto animate-fade-in">
      <div className="flex items-center gap-3 mb-4">
        <Link to="/orders" className="text-muted-foreground hover:text-foreground transition-colors"><ArrowRight className="w-5 h-5" /></Link>
        <div className="flex-1">
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-0.5 flex-wrap">
            {order.category && <span className="font-medium text-primary">{getLabel(order.category)}</span>}
            {order.subcategory && <><span>·</span><span>{order.subcategory}</span></>}
            {order.budget_source_name && (
              <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full"><Wallet className="w-3 h-3" /> {order.budget_source_name}</span>
            )}
            {order.budget_category_name && (
              <span className="inline-flex items-center gap-1 text-xs bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full"><Layers className="w-3 h-3" /> {order.budget_category_name}</span>
            )}
            {order.budget_updated && (
              <span className="inline-flex items-center gap-1 text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full"><CheckCircle className="w-3 h-3" /> תקציב עודכן</span>
            )}
            {order.inventory_updated && (
              <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full"><CheckCircle className="w-3 h-3" /> המלאי עודכן</span>
            )}
          </div>
          <h1 className="text-2xl font-bold">{order.title || order.supplier_name}</h1>
        </div>
        {!isNew && <StatusBadge status={order.status} entityType="PurchaseOrder" />}
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {order.status === 'draft' && (
          <>
            <Button onClick={submitForApproval} className="gap-1.5 bg-amber-500 text-white border-0 hover:bg-amber-600">
              <CheckCircle className="w-4 h-4" /> שלח לאישור
            </Button>
            <Button onClick={save} disabled={saving} className="gap-2 bg-gradient-to-l from-blue-500 to-purple-500 text-white border-0 hover:opacity-90">
              <Save className="w-4 h-4" /> {saving ? 'שומר...' : 'שמור'}
            </Button>
          </>
        )}
        {order.status === 'pending_approval' && (
          <>
            {isApprover ? (
              <>
                <Button onClick={approveOrder} className="gap-1.5 bg-blue-500 text-white border-0 hover:bg-blue-600">
                  <CheckCircle className="w-4 h-4" /> אשר הזמנה
                </Button>
                <Button onClick={openReject} variant="outline" className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50">
                  <XCircle className="w-4 h-4" /> דחה הזמנה
                </Button>
              </>
            ) : (
              <div className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2">
                ההזמנה ממתינה לאישור מנהלת
              </div>
            )}
            <Button onClick={save} disabled={saving} variant="outline" className="gap-2">
              <Save className="w-4 h-4" /> {saving ? 'שומר...' : 'שמור'}
            </Button>
          </>
        )}
        {order.status === 'approved' && (
          <>
            <Button onClick={markOrdered} className="gap-1.5 bg-purple-500 text-white border-0 hover:bg-purple-600">
              <CheckCircle className="w-4 h-4" /> סמן כהוזמן
            </Button>
            <Button onClick={save} disabled={saving} variant="outline" className="gap-2">
              <Save className="w-4 h-4" /> {saving ? 'שומר...' : 'שמור'}
            </Button>
          </>
        )}
        {order.status === 'ordered' && canReceiveGoods(user) && (
          <>
            <Button onClick={() => setReceiptOpen(true)} className="gap-1.5 bg-green-500 text-white border-0 hover:bg-green-600">
              <Truck className="w-4 h-4" /> אשר קבלה
            </Button>
            <Button onClick={save} disabled={saving} variant="outline" className="gap-2">
              <Save className="w-4 h-4" /> {saving ? 'שומר...' : 'שמור'}
            </Button>
          </>
        )}
        {(order.status === 'approved' || order.status === 'ordered') && canCancel && (
          <Button onClick={cancelOrder} variant="outline" className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50">
            <Ban className="w-4 h-4" /> בטל הזמנה
          </Button>
        )}
        {order.status === 'rejected' && (
          <>
            <Button onClick={resubmitOrder} className="gap-1.5 bg-amber-500 text-white border-0 hover:bg-amber-600">
              <RotateCcw className="w-4 h-4" /> ערוך והגש מחדש
            </Button>
            <Button onClick={save} disabled={saving} variant="outline" className="gap-2">
              <Save className="w-4 h-4" /> {saving ? 'שומר...' : 'שמור'}
            </Button>
          </>
        )}
      </div>

      {/* Source indicator */}
      {order.source_quote_id && (
        <Link to="/quotes" className="inline-flex items-center gap-1.5 text-sm text-purple-700 bg-purple-50 border border-purple-200 rounded-lg px-3 py-1.5 mb-4 hover:bg-purple-100 transition-colors">
          <FileText className="w-4 h-4" /> מקור ההזמנה: הצעת מחיר
        </Link>
      )}
      {order.source_book_list_id && (
        <Link to="/book-lists" className="inline-flex items-center gap-1.5 text-sm text-pink-700 bg-pink-50 border border-pink-200 rounded-lg px-3 py-1.5 mb-4 hover:bg-pink-100 transition-colors">
          <BookMarked className="w-4 h-4" /> מקור ההזמנה: רשימת ספרים מספקים
        </Link>
      )}
      {order.project_id && (
        <Link to={`/projects/${order.project_id}`} className="inline-flex items-center gap-1.5 text-sm text-cyan-700 bg-cyan-50 border border-cyan-200 rounded-lg px-3 py-1.5 mb-4 hover:bg-cyan-100 transition-colors">
          <FolderKanban className="w-4 h-4" /> פרויקט: {order.project_name}
        </Link>
      )}

      {/* Rejection info */}
      {isRejected && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
          <h3 className="font-bold text-red-700 flex items-center gap-2 mb-2"><XCircle className="w-5 h-5" /> ההזמנה נדחתה</h3>
          {order.rejection_reason && <p className="text-sm text-red-600 mb-1"><strong>סיבה:</strong> {order.rejection_reason}</p>}
          <div className="flex gap-4 text-xs text-red-500">
            {order.rejected_by && <span>נדחה ע"י: {order.rejected_by}</span>}
            {order.rejected_date && <span>תאריך: {new Date(order.rejected_date).toLocaleDateString('he-IL')}</span>}
          </div>
        </div>
      )}

      {/* Audit info */}
      {(order.submitted_by || order.approved_by) && !isRejected && (
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mb-4 bg-muted/40 rounded-lg px-4 py-2">
          {order.submitted_by && <span>הוגש ע"י: {order.submitted_by}{order.submitted_date ? ` (${new Date(order.submitted_date).toLocaleDateString('he-IL')})` : ''}</span>}
          {order.approved_by && <span>· אושר ע"י: {order.approved_by}{order.approved_date ? ` (${new Date(order.approved_date).toLocaleDateString('he-IL')})` : ''}</span>}
          {order.cancelled_by && <span>· בוטל ע"י: {order.cancelled_by}{order.cancelled_date ? ` (${new Date(order.cancelled_date).toLocaleDateString('he-IL')})` : ''}</span>}
          {order.receipt_confirmed_by && <span>· קבלה אושרה ע"י: {order.receipt_confirmed_by}</span>}
        </div>
      )}

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-card border border-border rounded-2xl p-6 space-y-5">
        <OrderForm {...OrderFormProps} isReceived={isReceived} />
        {!isReceived && !isRejected && canDeleteMasterData(user) && (
          <div className="flex justify-end pt-2 border-t border-border">
            <Button variant="ghost" size="sm" onClick={deleteOrder} className="text-destructive hover:text-destructive gap-1.5"><Trash2 className="w-4 h-4" /> מחק</Button>
          </div>
        )}
      </motion.div>

      {/* Reject dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="max-w-sm font-heebo" dir="rtl">
          <DialogHeader><DialogTitle>דחיית הזמנה</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>סיבת דחייה *</Label>
              <Textarea value={rejectionReason} onChange={e => setRejectionReason(e.target.value)} placeholder="הזנת סיבת דחייה..." rows={3} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRejectOpen(false)}>ביטול</Button>
              <Button onClick={confirmReject} disabled={rejecting || !rejectionReason.trim()} className="bg-red-500 text-white border-0 hover:bg-red-600">
                {rejecting ? 'דוחה...' : 'דחה הזמנה'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <GoodsReceiptDialog open={receiptOpen} onOpenChange={setReceiptOpen} order={order} onConfirmed={handleReceiptConfirmed} />
    </div>
  );
}

function OrderForm({ order, setOrder, save, saving, suppliers, isReceived, mains, getSubcategories, updateItem, addItem, removeItem,
  budgetSources, sourceCategories, filteredCredits, fundingError, validating,
  handleFundingChange, handleBudgetSourceSelect, handleBudgetCategorySelect, handleCreditSelect, projects }) {
  const disabled = isReceived;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>קטגוריה ראשית *</Label>
          <Select value={order.category || ''} onValueChange={v => setOrder(o => ({ ...o, category: v, subcategory: '' }))} disabled={disabled}>
            <SelectTrigger><SelectValue placeholder="בחר קטגוריה" /></SelectTrigger>
            <SelectContent>{mains.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>תת-קטגוריה</Label>
          <Select value={order.subcategory || ''} onValueChange={v => setOrder(o => ({ ...o, subcategory: v }))} disabled={!order.category || disabled}>
            <SelectTrigger><SelectValue placeholder="בחר תת-קטגוריה" /></SelectTrigger>
            <SelectContent>{getSubcategories(order.category).map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label>כותרת חופשית</Label>
          <Input value={order.title || ''} onChange={e => setOrder(o => ({ ...o, title: e.target.value }))} placeholder="תיאור קצר" disabled={disabled} />
        </div>
        <div className="space-y-1.5">
          <Label>שם ספק *</Label>
          <Select value={order.supplier_id || ''} onValueChange={v => {
            const sup = suppliers.find(s => s.id === v);
            setOrder(o => ({ ...o, supplier_id: v, supplier_name: sup?.name || '', credit_id: '' }));
          }} disabled={disabled}>
            <SelectTrigger><SelectValue placeholder="בחר ספק" /></SelectTrigger>
            <SelectContent>{suppliers.filter(s => s.status === 'active').map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>פרויקט קשור</Label>
          <Select value={order.project_id || 'none'} onValueChange={v => {
            const proj = projects.find(p => p.id === v);
            setOrder(o => ({ ...o, project_id: v === 'none' ? '' : v, project_name: proj?.name || '' }));
          }} disabled={disabled}>
            <SelectTrigger><SelectValue placeholder="ללא פרויקט" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">ללא פרויקט</SelectItem>
              {projects.filter(p => p.status === 'active' || p.status === 'planning').map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Funding source section */}
      <div className="border border-border rounded-xl p-4 space-y-3 bg-muted/20">
        <h3 className="font-bold text-sm flex items-center gap-2"><Wallet className="w-4 h-4 text-primary" /> מקור מימון</h3>

        <div className="space-y-1.5">
          <Label>סוג מקור מימון</Label>
          <Select value={order.funding_source_type || ''} onValueChange={handleFundingChange} disabled={disabled}>
            <SelectTrigger><SelectValue placeholder="בחר סוג מימון" /></SelectTrigger>
            <SelectContent>{FUNDING_TYPES.map(ft => <SelectItem key={ft.value} value={ft.value}>{ft.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>

        {order.funding_source_type === 'supplier_credit' ? (
          <div className="space-y-1.5">
            <Label>זיכוי ספק</Label>
            <Select value={order.credit_id || ''} onValueChange={handleCreditSelect} disabled={disabled || !order.supplier_id}>
              <SelectTrigger><SelectValue placeholder={order.supplier_id ? 'בחר זיכוי' : 'יש לבחור ספק תחילה'} /></SelectTrigger>
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
        ) : order.funding_source_type ? (
          <>
            <div className="space-y-1.5">
              <Label>מקור תקציב</Label>
              <Select value={order.budget_source_id || ''} onValueChange={handleBudgetSourceSelect} disabled={disabled}>
                <SelectTrigger><SelectValue placeholder="בחר מקור תקציב" /></SelectTrigger>
                <SelectContent>
                  {(budgetSources.filter(bs => bs.funding_source_type === order.funding_source_type)).length === 0 ? (
                    <div className="px-2 py-3 text-sm text-muted-foreground text-center">אין מקורות תקציב מסוג זה</div>
                  ) : (
                    budgetSources.filter(bs => bs.funding_source_type === order.funding_source_type).map(bs => (
                      <SelectItem key={bs.id} value={bs.id}>{bs.name} · יתרה ₪{(bs.available_amount || 0).toLocaleString('he-IL')}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            {order.budget_source_id && sourceCategories.length > 0 && (
              <div className="space-y-1.5">
                <Label>קטגוריית תקציב</Label>
                <Select value={order.budget_category_id || ''} onValueChange={handleBudgetCategorySelect} disabled={disabled}>
                  <SelectTrigger><SelectValue placeholder={validating ? 'בודק...' : 'בחר קטגוריית תקציב'} /></SelectTrigger>
                  <SelectContent>
                    {sourceCategories.map(cat => {
                      const rem = cat.remaining_amount !== undefined ? cat.remaining_amount : Math.max(0, (cat.allocated_amount || 0) - (cat.reserved_amount || 0) - (cat.spent_amount || 0));
                      const insufficient = order.total_amount > rem;
                      return <SelectItem key={cat.id} value={cat.id} disabled={insufficient}>{cat.name} · יתרה ₪{rem.toLocaleString('he-IL')}{insufficient ? ' (אין מספיק)' : ''}</SelectItem>;
                    })}
                  </SelectContent>
                </Select>
              </div>
            )}
            {order.budget_source_id && sourceCategories.length === 0 && (
              <div className="text-sm text-muted-foreground bg-muted/60 rounded-lg p-3">
                <p>אין קטגוריות תקציב במקור זה. צור קטגוריות בדף "מקורות תקציב".</p>
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

      <div className="space-y-1.5">
        <Label>הערות</Label>
        <Textarea value={order.notes || ''} onChange={e => setOrder(o => ({ ...o, notes: e.target.value }))} placeholder="הערות נוספות..." rows={2} disabled={disabled} />
      </div>

      {/* Items */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-foreground flex items-center gap-2"><Package className="w-4 h-4 text-blue-500" /> פריטים</h3>
          {!disabled && <Button variant="outline" size="sm" onClick={addItem} className="gap-1.5 text-xs"><Plus className="w-3.5 h-3.5" /> הוסף פריט</Button>}
        </div>
        {(order.items || []).length === 0 ? (
          <div className="border-2 border-dashed border-border rounded-xl p-6 text-center text-muted-foreground text-sm cursor-pointer hover:border-primary/40 transition-colors" onClick={disabled ? undefined : addItem}>לחץ להוסיף פריטים</div>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-12 gap-2 text-xs text-muted-foreground font-medium px-2">
              <span className="col-span-5">תיאור / ISBN</span>
              <span className="col-span-2 text-center">כמות</span>
              <span className="col-span-2 text-center">מחיר יחידה</span>
              <span className="col-span-2 text-center">סה״כ</span>
              <span className="col-span-1" />
            </div>
            {(order.items || []).map((item, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-center bg-muted/40 rounded-xl px-2 py-1.5">
                <Input className="col-span-5 h-8 text-sm bg-card" placeholder="שם הפריט" value={item.name || ''} onChange={e => updateItem(i, 'name', e.target.value)} disabled={disabled} />
                <Input className="col-span-2 h-8 text-sm text-center bg-card" type="number" min={1} value={item.quantity || ''} onChange={e => updateItem(i, 'quantity', Number(e.target.value))} disabled={disabled} />
                <Input className="col-span-2 h-8 text-sm text-center bg-card" type="number" min={0} step={0.01} value={item.unit_price || ''} onChange={e => updateItem(i, 'unit_price', Number(e.target.value))} disabled={disabled} />
                <span className="col-span-2 text-center text-sm font-medium">₪{(item.total || 0).toFixed(2)}</span>
                {!disabled && <button onClick={() => removeItem(i)} className="col-span-1 flex justify-center text-muted-foreground hover:text-destructive transition-colors"><Trash2 className="w-4 h-4" /></button>}
              </div>
            ))}
            <div className="flex justify-end pt-2">
              <span className="font-bold text-lg">סה״כ: ₪{(order.total_amount || 0).toLocaleString('he-IL')}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}