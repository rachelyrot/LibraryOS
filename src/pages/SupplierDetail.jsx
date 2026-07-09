import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { ArrowRight, Building2, Phone, Mail, MapPin, Clock, CreditCard, Edit, ShoppingCart, FileText, DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import StatusBadge from '@/components/StatusBadge';
import useCategories from '@/hooks/useCategories';
import { canDeleteMasterData } from '@/lib/permissions';
import { toast } from 'sonner';

export default function SupplierDetail() {
  const { id } = useParams();
  const [supplier, setSupplier] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [orders, setOrders] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [credits, setCredits] = useState([]);
  const [user, setUser] = useState(null);
  const canManageSupplier = canDeleteMasterData(user);
  const { mains: supplierTypes, getLabel: getTypeLabel } = useCategories();

  useEffect(() => { loadSupplier(); loadRelated(); base44.auth.me().then(setUser).catch(() => {}); }, [id]);

  const loadSupplier = () => {
    base44.entities.Supplier.get(id).then(data => {
      setSupplier(data);
      setLoading(false);
    }).catch(() => setLoading(false));
  };

  const loadRelated = async () => {
    const s = await base44.entities.Supplier.get(id);
    const [ordersData, quotesData, creditsData] = await Promise.all([
      base44.entities.PurchaseOrder.filter({ supplier_id: id }, '-created_date', 50),
      base44.entities.QuoteRequest.filter({ supplier_id: id }, '-created_date', 50),
      base44.entities.SupplierCredit.filter({ supplier_id: id }, '-created_date', 50),
    ]);
    setOrders(ordersData);
    setQuotes(quotesData);
    setCredits(creditsData);
  };

  const openEdit = () => { setForm({ ...supplier }); setEditOpen(true); };

  const save = async () => {
    setSaving(true);
    const data = { ...form };
    await base44.entities.Supplier.update(id, data);
    toast.success('עודכן!');
    setSaving(false);
    setEditOpen(false);
    loadSupplier();
  };

  const toggleStatus = async () => {
    const newStatus = supplier.status === 'active' ? 'inactive' : 'active';
    await base44.entities.Supplier.update(id, { status: newStatus });
    toast.success(newStatus === 'active' ? 'הספק הופעל' : 'הספק הושבת');
    loadSupplier();
  };

  if (loading) return <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" /></div>;
  if (!supplier) return <div className="p-6 text-center text-muted-foreground">הספק לא נמצא</div>;

  return (
    <div className="p-6 max-w-6xl mx-auto animate-fade-in">
      <Link to="/suppliers" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors">
        <ArrowRight className="w-4 h-4" /> חזרה לספקים
      </Link>

      <div className="bg-card border border-border rounded-2xl p-6 mb-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-100 to-teal-100 flex items-center justify-center">
              <Building2 className="w-7 h-7 text-emerald-600" />
            </div>
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-bold">{supplier.name}</h1>
                {supplier.type && <span className="text-sm bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full font-medium">{getTypeLabel(supplier.type)}</span>}
                {supplier.is_fixed && <span className="text-sm bg-amber-100 text-amber-700 px-2 py-1 rounded-full font-medium">ספק קבוע</span>}
              </div>
              <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                {supplier.contact_name && <span>{supplier.contact_name}</span>}
                {supplier.phone && <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> {supplier.phone}</span>}
                {supplier.email && <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" /> {supplier.email}</span>}
                {supplier.address && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {supplier.address}</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {canManageSupplier && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">{supplier.status === 'active' ? 'פעיל' : 'לא פעיל'}</span>
                <Switch checked={supplier.status === 'active'} onCheckedChange={toggleStatus} />
              </div>
            )}
            {canManageSupplier && <Button variant="outline" size="sm" onClick={openEdit} className="gap-1"><Edit className="w-4 h-4" /> עריכה</Button>}
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4 mt-6 pt-4 border-t border-border">
          {supplier.payment_terms && (
            <div className="flex items-center gap-2 text-sm"><CreditCard className="w-4 h-4 text-muted-foreground" /><span className="text-muted-foreground">תנאי תשלום:</span><span className="font-medium">{supplier.payment_terms}</span></div>
          )}
          {supplier.avg_delivery_time && (
            <div className="flex items-center gap-2 text-sm"><Clock className="w-4 h-4 text-muted-foreground" /><span className="text-muted-foreground">זמן אספקה:</span><span className="font-medium">{supplier.avg_delivery_time}</span></div>
          )}
          {(() => {
            const activeCredits = credits.filter(c => c.status === 'active');
            const totalAvail = activeCredits.reduce((s, c) => s + Math.max(0, (c.total_amount || 0) - (c.reserved_amount || 0) - (c.used_amount || 0)), 0);
            return (
              <div className="flex items-center gap-2 text-sm col-span-2">
                <DollarSign className="w-4 h-4 text-emerald-500" />
                <span className="text-muted-foreground">זיכויים:</span>
                <span className="font-medium text-emerald-600">{activeCredits.length} פעילים · ₪{totalAvail.toLocaleString('he-IL')}</span>
              </div>
            );
          })()}
        </div>
        {supplier.notes && <p className="mt-4 text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">{supplier.notes}</p>}
      </div>

      <Tabs defaultValue="orders">
        <TabsList>
          <TabsTrigger value="orders" className="gap-1.5"><ShoppingCart className="w-4 h-4" /> הזמנות רכש ({orders.length})</TabsTrigger>
          <TabsTrigger value="quotes" className="gap-1.5"><FileText className="w-4 h-4" /> הצעות מחיר ({quotes.length})</TabsTrigger>
          <TabsTrigger value="credits" className="gap-1.5"><DollarSign className="w-4 h-4" /> זיכויים ({credits.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="orders">
          {orders.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground"><ShoppingCart className="w-10 h-10 mx-auto mb-2 opacity-30" /><p>אין הזמנות רכש לספק זה</p></div>
          ) : (
            <div className="space-y-2 mt-4">
              {orders.map(o => (
                <Link key={o.id} to={`/orders/${o.id}`} className="flex items-center gap-4 bg-card border border-border rounded-xl px-4 py-3 hover:border-primary/40 transition-all">
                  <div className="flex-1 min-w-0">
                    <span className="font-semibold">{o.title || o.supplier_name}</span>
                    {o.order_number && <span className="text-sm text-muted-foreground mr-2">#{o.order_number}</span>}
                  </div>
                  <div className="flex items-center gap-3">
                    {o.total_amount && <span className="font-bold">₪{Number(o.total_amount).toLocaleString('he-IL')}</span>}
                    <StatusBadge status={o.status} entityType="PurchaseOrder" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="quotes">
          {quotes.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground"><FileText className="w-10 h-10 mx-auto mb-2 opacity-30" /><p>אין הצעות מחיר לספק זה</p></div>
          ) : (
            <div className="space-y-2 mt-4">
              {quotes.map(q => (
                <div key={q.id} className="flex items-center gap-4 bg-card border border-border rounded-xl px-4 py-3">
                  <div className="flex-1 min-w-0"><span className="font-semibold">{q.title}</span></div>
                  <div className="flex items-center gap-3">
                    {q.total_amount && <span className="font-bold">₪{Number(q.total_amount).toLocaleString('he-IL')}</span>}
                    <StatusBadge status={q.status} entityType="QuoteRequest" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="credits">
          {credits.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground"><DollarSign className="w-10 h-10 mx-auto mb-2 opacity-30" /><p>אין זיכויים לספק זה</p></div>
          ) : (
            <div className="space-y-4 mt-4">
              {credits.map(c => {
                const reserved = c.reserved_amount || 0;
                const used = c.used_amount || 0;
                const rem = Math.max(0, (c.total_amount || 0) - reserved - used);
                const txs = (c.transactions || []).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
                const typeLabel = c.credit_type === 'refund' ? 'החזר' : c.credit_type === 'other' ? 'אחר' : 'זיכוי ספק';
                const statusColors = { active: 'bg-green-100 text-green-700', exhausted: 'bg-slate-100 text-slate-600', expired: 'bg-red-100 text-red-600', cancelled: 'bg-gray-100 text-gray-500' };
                const statusLabels = { active: 'פעיל', exhausted: 'נוצל', expired: 'פג תוקף', cancelled: 'בוטל' };
                return (
                  <div key={c.id} className="bg-card border border-border rounded-2xl p-5">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <span className="font-bold">{typeLabel}</span>
                        {c.reason && <span className="text-sm text-muted-foreground mr-2">· {c.reason}</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold">₪{(c.total_amount || 0).toLocaleString('he-IL')}</span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[c.status || 'active']}`}>{statusLabels[c.status || 'active']}</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3 mb-3 text-center text-sm">
                      <div><p className="text-muted-foreground text-xs">משוריין</p><p className="font-bold text-amber-600">₪{reserved.toLocaleString('he-IL')}</p></div>
                      <div><p className="text-muted-foreground text-xs">נוצל</p><p className="font-bold text-red-500">₪{used.toLocaleString('he-IL')}</p></div>
                      <div><p className="text-muted-foreground text-xs">יתרה</p><p className="font-bold text-emerald-600">₪{rem.toLocaleString('he-IL')}</p></div>
                    </div>
                    <div className="flex gap-4 text-xs text-muted-foreground mb-3">
                      {c.start_date && <span>נוצר: {new Date(c.start_date).toLocaleDateString('he-IL')}</span>}
                      {c.valid_until && <span>תוקף: {new Date(c.valid_until).toLocaleDateString('he-IL')}</span>}
                      {c.notes && <span className="truncate max-w-64">{c.notes}</span>}
                    </div>
                    {txs.length > 0 && (
                      <div className="pt-3 border-t border-border">
                        <p className="text-xs font-medium text-muted-foreground mb-2">היסטוריית שימוש ({txs.length})</p>
                        <div className="space-y-1">
                          {txs.map((tx, i) => {
                            const actionLabel = tx.action === 'used' ? 'נוצל' : tx.action === 'released' ? 'שוחרר' : 'שוריין';
                            const actionColor = tx.action === 'used' ? 'text-red-600' : tx.action === 'released' ? 'text-gray-500' : 'text-amber-600';
                            return (
                              <div key={i} className="flex items-center justify-between gap-2 text-xs bg-muted/40 rounded-lg px-2 py-1.5">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="text-muted-foreground shrink-0">{tx.date}</span>
                                  <span className={`font-medium shrink-0 ${actionColor}`}>{actionLabel}</span>
                                  {tx.description && <span className="text-muted-foreground truncate">{tx.description}</span>}
                                </div>
                                <span className="font-bold shrink-0">₪{(tx.amount || 0).toLocaleString('he-IL')}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-xl font-heebo" dir="rtl">
          <DialogHeader><DialogTitle>עריכת ספק</DialogTitle></DialogHeader>
          {form && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>שם ספק *</Label><Input value={form.name || ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
                <div className="space-y-1.5">
                  <Label>סוג ספק *</Label>
                  <Select value={form.type || ''} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{supplierTypes.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5"><Label>איש קשר</Label><Input value={form.contact_name || ''} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} /></div>
                <div className="space-y-1.5"><Label>טלפון</Label><Input value={form.phone || ''} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
                <div className="space-y-1.5"><Label>מייל</Label><Input value={form.email || ''} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
              </div>
              <div className="space-y-1.5"><Label>כתובת</Label><Input value={form.address || ''} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>תנאי תשלום</Label><Input value={form.payment_terms || ''} onChange={e => setForm(f => ({ ...f, payment_terms: e.target.value }))} /></div>
                <div className="space-y-1.5"><Label>זמן אספקה ממוצע</Label><Input value={form.avg_delivery_time || ''} onChange={e => setForm(f => ({ ...f, avg_delivery_time: e.target.value }))} /></div>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.is_fixed || false} onCheckedChange={v => setForm(f => ({ ...f, is_fixed: v }))} />
                <Label>ספק קבוע</Label>
              </div>
              <div className="space-y-1.5"><Label>הערות</Label><Textarea value={form.notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} /></div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setEditOpen(false)}>ביטול</Button>
                <Button onClick={save} disabled={saving} className="bg-gradient-to-l from-emerald-500 to-teal-500 text-white border-0 hover:opacity-90">{saving ? 'שומר...' : 'שמור'}</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}