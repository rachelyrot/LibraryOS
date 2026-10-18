import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Search, AlertTriangle, Package, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import PageHeader from '@/components/PageHeader';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { canManageInventory } from '@/lib/permissions';
import useCategories from '@/hooks/useCategories';
import { cn } from '@/lib/utils';
import { isSoftwareItem, isLowStock, licenseState } from '@/lib/inventory';

const CAT_COLORS = [
  'from-blue-100 to-purple-100 text-blue-600',
  'from-teal-100 to-green-100 text-teal-600',
  'from-orange-100 to-amber-100 text-orange-600',
  'from-pink-100 to-rose-100 text-pink-600',
  'from-green-100 to-emerald-100 text-green-600',
  'from-cyan-100 to-sky-100 text-cyan-600',
  'from-violet-100 to-indigo-100 text-violet-600',
  'from-rose-100 to-red-100 text-rose-600',
  'from-amber-100 to-yellow-100 text-amber-600',
  'from-gray-100 to-slate-100 text-slate-600',
];

// צבע הרקע של כרטיס לפי הקטגוריה (באותו סדר כמו CAT_COLORS), וצבע הכפתור שלה
// בסינון — כך שרואים מיד לאיזו קטגוריה פריט שייך. מלאי נמוך מסומן במסגרת.
const CAT_CARD = [
  { card: 'bg-blue-50 border-blue-100', chip: 'bg-blue-100 text-blue-700' },
  { card: 'bg-teal-50 border-teal-100', chip: 'bg-teal-100 text-teal-700' },
  { card: 'bg-orange-50 border-orange-100', chip: 'bg-orange-100 text-orange-700' },
  { card: 'bg-pink-50 border-pink-100', chip: 'bg-pink-100 text-pink-700' },
  { card: 'bg-green-50 border-green-100', chip: 'bg-green-100 text-green-700' },
  { card: 'bg-cyan-50 border-cyan-100', chip: 'bg-cyan-100 text-cyan-700' },
  { card: 'bg-violet-50 border-violet-100', chip: 'bg-violet-100 text-violet-700' },
  { card: 'bg-rose-50 border-rose-100', chip: 'bg-rose-100 text-rose-700' },
  { card: 'bg-amber-50 border-amber-100', chip: 'bg-amber-100 text-amber-700' },
  { card: 'bg-slate-50 border-slate-200', chip: 'bg-slate-100 text-slate-700' },
];

const LICENSE_LABEL = { expired: 'התוקף פג', soon: 'תוקף מסתיים בקרוב' };
const needsAttention = (i) => isLowStock(i) || ['expired', 'soon'].includes(licenseState(i));

const EMPTY = { name: '', category: '', subcategory: '', current_quantity: 0, minimum_quantity: 0, unit: 'יחידות', supplier_id: '', supplier_name: '', notes: '', isbn: '', author: '' };

export default function Inventory() {
  const [searchParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [showLow, setShowLow] = useState(searchParams.get('low') === '1');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [suppliers, setSuppliers] = useState([]);
  const [user, setUser] = useState(null);
  const canEditInventory = canManageInventory(user);
  const { mains, getLabel, getSubcategories } = useCategories();

  const load = () => base44.entities.InventoryItem.list('-updated_date', 200).then(data => { setItems(data); setLoading(false); });
  const loadSuppliers = () => base44.entities.Supplier.list('name', 500).then(setSuppliers).catch(() => {});
  useEffect(() => { load(); loadSuppliers(); base44.auth.me().then(setUser).catch(() => {}); }, []);

  // פריט חדש מתוך סינון של קטגוריה — הקטגוריה כבר ממולאת, ונשאר לבחור תת-קטגוריה
  const openNew = () => { setEditing(null); setForm({ ...EMPTY, category: catFilter || '' }); setOpen(true); };
  const openEdit = (item) => { setEditing(item); setForm(item); setOpen(true); };

  const save = async () => {
    setSaving(true);
    if (editing) { await base44.entities.InventoryItem.update(editing.id, form); toast.success('עודכן!'); }
    else { await base44.entities.InventoryItem.create(form); toast.success('נוסף!'); }
    setSaving(false); setOpen(false); load();
  };

  const filtered = items.filter(i => {
    const matchSearch = !search || i.name?.includes(search) || i.isbn?.includes(search) || i.author?.includes(search);
    const matchCat = !catFilter || i.category === catFilter;
    // "מלאי נמוך" כולל גם תוכנה שהתוקף שלה עבר או קרוב
    const matchLow = !showLow || needsAttention(i);
    return matchSearch && matchCat && matchLow;
  });

  const lowCount = items.filter(needsAttention).length;
  // מספר הצבע של קטגוריה — לפי המיקום שלה ברשימה; קטגוריה לא מוכרת מקבלת אפור
  const catIndex = (category) => {
    const i = mains.findIndex(m => m.value === category);
    return i < 0 ? CAT_CARD.length - 1 : i % CAT_CARD.length;
  };

  return (
    <div className="p-6 max-w-6xl mx-auto animate-fade-in">
      <PageHeader
        title="ניהול מלאי"
        subtitle={`${items.length} פריטים`}
        gradient="from-orange-400 to-amber-500"
        actions={
          <div className="flex gap-2">
            {canEditInventory && <Button onClick={openNew} className="gap-2 bg-gradient-to-l from-orange-400 to-amber-500 text-white border-0 hover:opacity-90"><Plus className="w-4 h-4" /> פריט חדש</Button>}
          </div>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="חיפוש..." className="pr-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setCatFilter('')} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${!catFilter ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-secondary'}`}>הכל</button>
          {mains.map(m => (
            <button key={m.value} onClick={() => setCatFilter(catFilter === m.value ? '' : m.value)} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${catFilter === m.value ? 'bg-primary text-primary-foreground' : `${CAT_CARD[catIndex(m.value)].chip} hover:opacity-80`}`}>{m.label}</button>
          ))}
          <button onClick={() => setShowLow(!showLow)} className={`px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1 transition-all ${showLow ? 'bg-red-500 text-white' : 'bg-muted text-muted-foreground hover:bg-secondary'}`}>
            <AlertTriangle className="w-3 h-3" /> מלאי נמוך / תוקף {lowCount > 0 && `(${lowCount})`}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" /></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(item => {
            const software = isSoftwareItem(item);
            const license = licenseState(item);
            // מסגרת: מלאי נמוך, או תוכנה שהתוקף שלה עבר / מסתיים בקרוב
            const isLow = needsAttention(item);
            const hasMovements = (item.movements || []).length > 0;
            return (
              <motion.div key={item.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className={cn('rounded-2xl p-4 cursor-pointer hover:shadow-md transition-all', CAT_CARD[catIndex(item.category)].card,
                  isLow ? 'border-2 border-red-500 ring-2 ring-red-200' : 'border')}
                onClick={() => { if (canEditInventory) openEdit(item); }}>
                <div className="flex items-start justify-between gap-2">
                  <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${CAT_COLORS[catIndex(item.category)]} flex items-center justify-center shrink-0`}>
                    <Package className="w-4 h-4" />
                  </div>
                  {isLow && <span className="flex items-center gap-1 text-xs text-red-500 font-medium"><AlertTriangle className="w-3 h-3" /> {software ? LICENSE_LABEL[license] : 'נמוך'}</span>}
                  {hasMovements && !isLow && <span className="flex items-center gap-1 text-xs text-green-600 font-medium"><Clock className="w-3 h-3" /> {item.movements.length}</span>}
                </div>
                <p className="font-semibold mt-2 text-sm">{item.name}</p>
                {item.author && <p className="text-xs text-muted-foreground">{item.author}</p>}
                <div className="flex items-end justify-between mt-3">
                  <span className={cn('text-xs px-2 py-0.5 rounded-full', CAT_CARD[catIndex(item.category)].chip)}>{getLabel(item.category) || 'ללא קטגוריה'}{item.subcategory ? ` · ${item.subcategory}` : ''}</span>
                  {software ? (
                    <div className="text-left">
                      <span className="text-[11px] text-muted-foreground block">תוקף</span>
                      <span className={cn('text-sm font-bold', isLow ? 'text-red-500' : 'text-foreground')}>
                        {item.license_expiry ? new Date(`${item.license_expiry}T00:00:00`).toLocaleDateString('he-IL') : 'לא הוזן'}
                      </span>
                    </div>
                  ) : (
                    <div className="text-left">
                      <span className={cn('text-2xl font-bold', isLow ? 'text-red-500' : 'text-foreground')}>{item.current_quantity}</span>
                      <span className="text-xs text-muted-foreground"> / {item.minimum_quantity} מינ׳</span>
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Item Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto font-heebo" dir="rtl">
          <DialogHeader><DialogTitle>{editing ? 'עריכת פריט' : 'פריט חדש'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-2"><Label>שם הפריט *</Label><Input value={form.name || ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
              <div className="space-y-1.5">
                <Label>קטגוריה</Label>
                <Select value={form.category || ''} onValueChange={v => setForm(f => ({ ...f, category: v, subcategory: '' }))}>
                  <SelectTrigger><SelectValue placeholder="בחר קטגוריה" /></SelectTrigger>
                  <SelectContent>
                    {mains.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>תת-קטגוריה</Label>
                <Select value={form.subcategory || ''} onValueChange={v => setForm(f => ({ ...f, subcategory: v }))} disabled={!form.category}>
                  <SelectTrigger><SelectValue placeholder="בחר תת-קטגוריה" /></SelectTrigger>
                  <SelectContent>
                    {getSubcategories(form.category).map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {/* תקשורת ומחשוב — תוכנות: תוקף במקום כמויות */}
              {isSoftwareItem(form) ? (
                <div className="space-y-1.5"><Label>תוקף התוכנה</Label><Input type="date" value={form.license_expiry || ''} onChange={e => setForm(f => ({ ...f, license_expiry: e.target.value }))} /></div>
              ) : (
                <>
                  <div className="space-y-1.5"><Label>כמות נוכחית</Label><Input type="number" value={form.current_quantity ?? ''} onChange={e => setForm(f => ({ ...f, current_quantity: Number(e.target.value) }))} /></div>
                  <div className="space-y-1.5"><Label>כמות מינימום</Label><Input type="number" value={form.minimum_quantity ?? ''} onChange={e => setForm(f => ({ ...f, minimum_quantity: Number(e.target.value) }))} /></div>
                  <div className="space-y-1.5"><Label>יחידת מידה</Label><Input value={form.unit || ''} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} /></div>
                </>
              )}
              {/* ISBN ומחבר — רק לספרים */}
              {(form.category || '').trim() === 'ספרים' && (
                <>
                  <div className="space-y-1.5"><Label>ISBN</Label><Input value={form.isbn || ''} onChange={e => setForm(f => ({ ...f, isbn: e.target.value }))} /></div>
                  <div className="space-y-1.5"><Label>מחבר</Label><Input value={form.author || ''} onChange={e => setForm(f => ({ ...f, author: e.target.value }))} /></div>
                </>
              )}
              <div className="space-y-1.5">
                <Label>ספק</Label>
                <Select value={form.supplier_id || ''} onValueChange={v => {
                  const sup = suppliers.find(s => s.id === v);
                  setForm(f => ({ ...f, supplier_id: v, supplier_name: sup?.name || '' }));
                }}>
                  <SelectTrigger><SelectValue placeholder="בחר ספק" /></SelectTrigger>
                  <SelectContent>
                    {suppliers.filter(s => s.status === 'active').map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 col-span-2"><Label>הערות</Label><Textarea value={form.notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} /></div>
            </div>

            {/* Movement history */}
            {editing && (editing.movements || []).length > 0 && (
              <div className="border border-border rounded-xl overflow-hidden">
                <div className="px-4 py-2 bg-muted/30 border-b border-border">
                  <h4 className="font-medium text-sm flex items-center gap-2"><Clock className="w-4 h-4 text-muted-foreground" /> היסטוריית תנועות</h4>
                </div>
                <div className="divide-y divide-border/50 max-h-[200px] overflow-y-auto">
                  {(editing.movements || []).map((m, i) => (
                    <div key={i} className="px-4 py-2.5 text-sm flex items-center justify-between">
                      <div>
                        <span className="font-medium">{m.type || 'קבלת הזמנה'}</span>
                        {m.supplier_name && <span className="text-muted-foreground"> · {m.supplier_name}</span>}
                      </div>
                      <div className="flex items-center gap-3">
                        {m.purchase_order_id && (
                          <Link to={`/orders/${m.purchase_order_id}`} className="text-xs text-primary hover:underline">#{m.purchase_order_id?.slice(0, 8)}</Link>
                        )}
                        <span className="text-green-600 font-medium">+{m.quantity_added || 0}</span>
                        {m.date && <span className="text-xs text-muted-foreground">{new Date(m.date).toLocaleDateString('he-IL')}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setOpen(false)}>ביטול</Button>
              <Button onClick={save} disabled={saving} className="bg-gradient-to-l from-orange-400 to-amber-500 text-white border-0 hover:opacity-90">{saving ? 'שומר...' : 'שמור'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}