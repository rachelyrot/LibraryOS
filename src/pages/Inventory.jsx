import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Search, AlertTriangle, Package, Upload, Clock } from 'lucide-react';
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
import { readExcelRows, cleanColumnName, detectKey } from '@/lib/excelImport';

// ── Deterministic column-mapped inventory import (replaces the old AI-based extractor) ──
const INVENTORY_COLUMN_MAP = {
  name: ['שם', 'שם פריט', 'שם הפריט', 'name', 'item name', 'item', 'תיאור'],
  category: ['קטגוריה', 'category', 'סוג'],
  subcategory: ['תת קטגוריה', 'תת-קטגוריה', 'subcategory'],
  current_quantity: ['כמות', 'כמות נוכחית', 'quantity', 'current_quantity', 'מלאי'],
  minimum_quantity: ['כמות מינימום', 'מינימום', 'minimum', 'minimum_quantity', 'סף מינימום'],
  unit: ['יחידה', 'יחידת מידה', 'unit'],
  isbn: ['isbn', 'מסת"ב', 'מסתב', 'ברקוד'],
  author: ['מחבר', 'author', 'סופר'],
};
const INVENTORY_HEADER_SIGNALS = Object.values(INVENTORY_COLUMN_MAP).flat();

function parseInventoryRow(row) {
  const g = (f) => { const k = detectKey(row, INVENTORY_COLUMN_MAP, f); return k ? row[k] : undefined; };
  const current_quantity = parseFloat(g('current_quantity'));
  const minimum_quantity = parseFloat(g('minimum_quantity'));
  return {
    name: (g('name') || '').toString().trim(),
    category: (g('category') || '').toString().trim(),
    subcategory: (g('subcategory') || '').toString().trim(),
    current_quantity: isNaN(current_quantity) ? 0 : current_quantity,
    minimum_quantity: isNaN(minimum_quantity) ? 0 : minimum_quantity,
    unit: (g('unit') || 'יחידות').toString().trim(),
    isbn: (g('isbn') || '').toString().trim(),
    author: (g('author') || '').toString().trim(),
  };
}

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
  const [importMode, setImportMode] = useState(false);
  const [importing, setImporting] = useState(false);
  const [suppliers, setSuppliers] = useState([]);
  const [user, setUser] = useState(null);
  const canEditInventory = canManageInventory(user);
  const { mains, getLabel, getSubcategories } = useCategories();

  const load = () => base44.entities.InventoryItem.list('-updated_date', 200).then(data => { setItems(data); setLoading(false); });
  const loadSuppliers = () => base44.entities.Supplier.list('name', 500).then(setSuppliers).catch(() => {});
  useEffect(() => { load(); loadSuppliers(); base44.auth.me().then(setUser).catch(() => {}); }, []);

  const openNew = () => { setEditing(null); setForm(EMPTY); setOpen(true); };
  const openEdit = (item) => { setEditing(item); setForm(item); setOpen(true); };

  const save = async () => {
    setSaving(true);
    if (editing) { await base44.entities.InventoryItem.update(editing.id, form); toast.success('עודכן!'); }
    else { await base44.entities.InventoryItem.create(form); toast.success('נוסף!'); }
    setSaving(false); setOpen(false); load();
  };

  const handleImport = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    setImporting(true);
    try {
      const { dataRows, detectedColumns, allColumns } = await readExcelRows(file, {
        columnMap: INVENTORY_COLUMN_MAP,
        anchorField: 'name',
        headerSignals: INVENTORY_HEADER_SIGNALS,
      });

      if (allColumns.length === 0) {
        toast.error('לא זוהו נתונים. ודאו שהקובץ מכיל רשימת פריטים ואינו ריק.');
      } else if (!detectedColumns.name) {
        const foundCols = allColumns.map(k => cleanColumnName(k)).filter(Boolean).join(', ');
        toast.error(`לא נמצאה עמודת "שם פריט" בקובץ.\nעמודות שנמצאו: ${foundCols || 'לא זוהו'}`, { duration: 8000 });
      } else {
        const items = dataRows.map(parseInventoryRow).filter(item => item.name);
        if (items.length === 0) {
          toast.error('לא נמצאו פריטים תקינים בקובץ.');
        } else {
          await base44.entities.InventoryItem.bulkCreate(items);
          toast.success(`יובאו ${items.length} פריטים!`);
          load();
        }
      }
    } catch (err) {
      toast.error('שגיאה בייבוא הקובץ');
    }
    setImporting(false); setImportMode(false);
  };

  const filtered = items.filter(i => {
    const matchSearch = !search || i.name?.includes(search) || i.isbn?.includes(search) || i.author?.includes(search);
    const matchCat = !catFilter || i.category === catFilter;
    const matchLow = !showLow || i.current_quantity <= i.minimum_quantity;
    return matchSearch && matchCat && matchLow;
  });

  const lowCount = items.filter(i => i.current_quantity <= i.minimum_quantity).length;

  return (
    <div className="p-6 max-w-6xl mx-auto animate-fade-in">
      <PageHeader
        title="ניהול מלאי"
        subtitle={`${items.length} פריטים`}
        gradient="from-orange-400 to-amber-500"
        actions={
          <div className="flex gap-2">
            {canEditInventory && <Button variant="outline" size="sm" onClick={() => setImportMode(true)} className="gap-1.5"><Upload className="w-3.5 h-3.5" /> ייבוא מאגרון</Button>}
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
            <button key={m.value} onClick={() => setCatFilter(catFilter === m.value ? '' : m.value)} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${catFilter === m.value ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-secondary'}`}>{m.label}</button>
          ))}
          <button onClick={() => setShowLow(!showLow)} className={`px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1 transition-all ${showLow ? 'bg-red-500 text-white' : 'bg-muted text-muted-foreground hover:bg-secondary'}`}>
            <AlertTriangle className="w-3 h-3" /> מלאי נמוך {lowCount > 0 && `(${lowCount})`}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" /></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(item => {
            const isLow = item.current_quantity <= item.minimum_quantity;
            const hasMovements = (item.movements || []).length > 0;
            return (
              <motion.div key={item.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className={cn('bg-card border rounded-2xl p-4 cursor-pointer hover:shadow-sm transition-all', isLow ? 'border-red-300 bg-red-50/50' : 'border-border hover:border-orange-300')}
                onClick={() => { if (canEditInventory) openEdit(item); }}>
                <div className="flex items-start justify-between gap-2">
                  <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${CAT_COLORS[mains.findIndex(m => m.value === item.category) % CAT_COLORS.length] || CAT_COLORS[CAT_COLORS.length - 1]} flex items-center justify-center shrink-0`}>
                    <Package className="w-4 h-4" />
                  </div>
                  {isLow && <span className="flex items-center gap-1 text-xs text-red-500 font-medium"><AlertTriangle className="w-3 h-3" /> נמוך</span>}
                  {hasMovements && !isLow && <span className="flex items-center gap-1 text-xs text-green-600 font-medium"><Clock className="w-3 h-3" /> {item.movements.length}</span>}
                </div>
                <p className="font-semibold mt-2 text-sm">{item.name}</p>
                {item.author && <p className="text-xs text-muted-foreground">{item.author}</p>}
                <div className="flex items-end justify-between mt-3">
                  <span className="text-xs text-muted-foreground">{getLabel(item.category)}{item.subcategory ? ` · ${item.subcategory}` : ''}</span>
                  <div className="text-left">
                    <span className={cn('text-2xl font-bold', isLow ? 'text-red-500' : 'text-foreground')}>{item.current_quantity}</span>
                    <span className="text-xs text-muted-foreground"> / {item.minimum_quantity} מינ׳</span>
                  </div>
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
              <div className="space-y-1.5"><Label>כמות נוכחית</Label><Input type="number" value={form.current_quantity ?? ''} onChange={e => setForm(f => ({ ...f, current_quantity: Number(e.target.value) }))} /></div>
              <div className="space-y-1.5"><Label>כמות מינימום</Label><Input type="number" value={form.minimum_quantity ?? ''} onChange={e => setForm(f => ({ ...f, minimum_quantity: Number(e.target.value) }))} /></div>
              <div className="space-y-1.5"><Label>יחידת מידה</Label><Input value={form.unit || ''} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>ISBN (לספרים)</Label><Input value={form.isbn || ''} onChange={e => setForm(f => ({ ...f, isbn: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>מחבר</Label><Input value={form.author || ''} onChange={e => setForm(f => ({ ...f, author: e.target.value }))} /></div>
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
              <div className="space-y-1.5"><Label>עותקים באגרון</Label><Input type="number" value={form.copies_in_agron ?? ''} onChange={e => setForm(f => ({ ...f, copies_in_agron: Number(e.target.value) }))} /></div>
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

      {/* Import dialog */}
      <Dialog open={importMode} onOpenChange={setImportMode}>
        <DialogContent className="max-w-md font-heebo" dir="rtl">
          <DialogHeader><DialogTitle>ייבוא מלאי מקובץ</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">העלה קובץ Excel/CSV עם רשימת פריטי מלאי — המערכת תזהה אוטומטית את העמודות (שם, קטגוריה, כמות, כמות מינימום, יחידה, ISBN, מחבר).</p>
            <label className={cn('flex flex-col items-center gap-3 cursor-pointer border-2 border-dashed border-border rounded-2xl p-8 hover:border-orange-400 transition-colors', importing && 'opacity-60 pointer-events-none')}>
              <Upload className="w-8 h-8 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">{importing ? 'מעבד...' : 'לחץ לבחירת קובץ Excel / CSV'}</span>
              <input type="file" className="hidden" accept=".csv,.xlsx,.xls" onChange={handleImport} disabled={importing} />
            </label>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}