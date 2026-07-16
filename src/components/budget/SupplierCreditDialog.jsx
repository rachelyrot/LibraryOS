import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { base44 } from '@/api/base44Client';

const CREDIT_TYPES = [
  { value: 'supplier_credit', label: 'זיכוי ספק' },
  { value: 'refund', label: 'החזר' },
  { value: 'other', label: 'אחר' },
];
const EMPTY = { supplier_id: '', supplier_name: '', credit_type: 'supplier_credit', total_amount: '', reason: '', start_date: '', valid_until: '', notes: '', status: 'active' };

export default function SupplierCreditDialog({ open, onOpenChange, credit, onSubmit }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [suppliers, setSuppliers] = useState([]);

  useEffect(() => {
    base44.entities.Supplier.filter({ status: 'active' }, 'name', 200).then(setSuppliers).catch(() => {});
  }, []);

  useEffect(() => {
    if (open) setForm(credit ? {
      supplier_id: credit.supplier_id || '',
      supplier_name: credit.supplier_name || '',
      credit_type: credit.credit_type || 'supplier_credit',
      total_amount: credit.total_amount || '',
      reason: credit.reason || '',
      start_date: credit.start_date || '',
      valid_until: credit.valid_until || '',
      notes: credit.notes || '',
      status: credit.status || 'active',
    } : EMPTY);
  }, [open, credit]);

  const handleSubmit = async () => {
    if (!form.supplier_id || !form.total_amount) return;
    setSaving(true);
    await onSubmit(form);
    setSaving(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto font-heebo" dir="rtl">
        <DialogHeader><DialogTitle>{credit ? 'עריכת זיכוי ספק' : 'זיכוי ספק חדש'}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>ספק *</Label>
            <Select value={form.supplier_id || ''} onValueChange={v => {
              const sup = suppliers.find(s => s.id === v);
              setForm(f => ({ ...f, supplier_id: v, supplier_name: sup?.name || '' }));
            }}>
              <SelectTrigger><SelectValue placeholder="בחר ספק" /></SelectTrigger>
              <SelectContent>
                {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>סוג זיכוי</Label>
              <Select value={form.credit_type || 'supplier_credit'} onValueChange={v => setForm(f => ({ ...f, credit_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CREDIT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>סכום זיכוי *</Label>
              <Input type="number" value={form.total_amount || ''} onChange={e => setForm(f => ({ ...f, total_amount: Number(e.target.value) }))} placeholder="₪" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>סיבה</Label>
            <Input value={form.reason || ''} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} placeholder="לדוגמה: זיכוי על החזרת ספרים" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>תאריך יצירה</Label>
              <Input type="date" value={form.start_date || ''} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>תוקף (אופציונלי)</Label>
              <Input type="date" value={form.valid_until || ''} onChange={e => setForm(f => ({ ...f, valid_until: e.target.value }))} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>הערות</Label>
            <Textarea value={form.notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => onOpenChange(false)}>ביטול</Button>
            <Button onClick={handleSubmit} disabled={saving || !form.supplier_id || !form.total_amount}
              className="bg-gradient-to-l from-teal-400 to-green-500 text-white border-0 hover:opacity-90">
              {saving ? 'שומר...' : 'שמור'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}