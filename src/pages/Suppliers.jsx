import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Plus, Search, Building2, Phone, Mail, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import StatusBadge from '@/components/StatusBadge';
import PageHeader from '@/components/PageHeader';
import useCategories from '@/hooks/useCategories';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { canDeleteMasterData } from '@/lib/permissions';

const EMPTY = {
  name: '', type: '', contact_name: '', phone: '', email: '', address: '',
  status: 'active', payment_terms: '', avg_delivery_time: '',
  is_fixed: false, notes: ''
};

export default function Suppliers() {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [user, setUser] = useState(null);
  const canManageSuppliers = canDeleteMasterData(user);
  const { mains: supplierTypes, getLabel: getTypeLabel } = useCategories();

  const load = async () => {
    const data = await base44.entities.Supplier.list('-created_date', 200);
    setSuppliers(data);
    setLoading(false);
  };
  useEffect(() => { load(); base44.auth.me().then(setUser).catch(() => {}); }, []);

  const openNew = () => { setEditing(null); setForm(EMPTY); setOpen(true); };
  const openEdit = (s) => { setEditing(s); setForm(s); setOpen(true); };

  const save = async () => {
    setSaving(true);
    const data = { ...form };
    if (editing) { await base44.entities.Supplier.update(editing.id, data); toast.success('עודכן!'); }
    else { await base44.entities.Supplier.create(data); toast.success('נשמר!'); }
    setSaving(false); setOpen(false); load();
  };

  const filtered = suppliers.filter(s =>
    (!search || s.name?.includes(search) || s.contact_name?.includes(search) || s.phone?.includes(search) || s.email?.includes(search)) &&
    (typeFilter === 'all' || s.type === typeFilter) &&
    (statusFilter === 'all' || s.status === statusFilter)
  );

  return (
    <div className="p-6 max-w-7xl mx-auto animate-fade-in">
      <PageHeader
        title="ספקים"
        subtitle={`${suppliers.length} ספקים`}
        gradient="from-emerald-500 to-teal-500"
        actions={canManageSuppliers && <Button onClick={openNew} className="gap-2 bg-gradient-to-l from-emerald-500 to-teal-500 text-white border-0 hover:opacity-90"><Plus className="w-4 h-4" /> ספק חדש</Button>}
      />

      <div className="flex flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="חיפוש לפי שם, איש קשר, טלפון או מייל..." className="pr-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="סוג ספק" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">כל הסוגים</SelectItem>
            {supplierTypes.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36"><SelectValue placeholder="סטטוס" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">כל הסטטוסים</SelectItem>
            <SelectItem value="active">פעיל</SelectItem>
            <SelectItem value="inactive">לא פעיל</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground"><Building2 className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>אין ספקים</p></div>
      ) : (
        <div className="space-y-2">
          {filtered.map(s => (
            <motion.div key={s.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <Link to={`/suppliers/${s.id}`}
                className="flex items-center gap-4 bg-card border border-border rounded-2xl px-5 py-4 hover:border-emerald-300 hover:shadow-sm transition-all group">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-100 to-teal-100 flex items-center justify-center shrink-0">
                  <Building2 className="w-5 h-5 text-emerald-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-foreground group-hover:text-emerald-600 transition-colors">{s.name}</span>
                    {s.type && <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">{getTypeLabel(s.type)}</span>}
                    {s.is_fixed && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">ספק קבוע</span>}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                    {s.contact_name && <span>{s.contact_name}</span>}
                    {s.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {s.phone}</span>}
                    {s.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {s.email}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${s.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                    {s.status === 'active' ? 'פעיל' : 'לא פעיל'}
                  </span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl font-heebo" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editing ? 'עריכת ספק' : 'ספק חדש'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>שם ספק *</Label><Input value={form.name || ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
              <div className="space-y-1.5">
                <Label>סוג ספק *</Label>
                <Select value={form.type || ''} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                  <SelectTrigger><SelectValue placeholder="בחר סוג" /></SelectTrigger>
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
              <Button variant="outline" onClick={() => setOpen(false)}>ביטול</Button>
              <Button onClick={save} disabled={saving} className="bg-gradient-to-l from-emerald-500 to-teal-500 text-white border-0 hover:opacity-90">{saving ? 'שומר...' : 'שמור'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}