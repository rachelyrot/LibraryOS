import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import MoneyInput from '@/components/budget/MoneyInput';

export default function AddExpenseDialog({ open, onOpenChange, categories, preselected, onSubmit }) {
  const [form, setForm] = useState({ category_id: '', amount: '', supplier_name: '', description: '', date: new Date().toISOString().split('T')[0] });
  const [saving, setSaving] = useState(false);
  const [suppliers, setSuppliers] = useState([]);

  useEffect(() => {
    if (open) {
      setForm(f => ({ ...f, category_id: preselected?.id || '' }));
      base44.entities.Supplier.list('name', 500).then(setSuppliers).catch(() => {});
    }
  }, [open, preselected]);

  // amount מוחזק כמחרוזת גולמית בטופס — ראה MoneyInput
  const amount = Number(form.amount);
  const amountValid = form.amount !== '' && Number.isFinite(amount) && amount > 0;

  const handleSubmit = async () => {
    if (!form.category_id || !amountValid) return;
    setSaving(true);
    try {
      await onSubmit({ ...form, amount });
      onOpenChange(false);
      setForm({ category_id: '', amount: '', supplier_name: '', description: '', date: new Date().toISOString().split('T')[0] });
    } finally {
      setSaving(false);
    }
  };

  const selected = categories.find(c => c.id === form.category_id);
  const remain = selected
    ? Math.max(0, (selected.allocated_amount || 0) - (selected.reserved_amount || 0) - (selected.spent_amount || 0))
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto font-heebo" dir="rtl">
        <DialogHeader><DialogTitle>הוספת הוצאה ידנית</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>קטגוריית תקציב *</Label>
            <Select value={form.category_id} onValueChange={v => setForm(f => ({ ...f, category_id: v }))}>
              <SelectTrigger><SelectValue placeholder="בחר קטגוריה..." /></SelectTrigger>
              <SelectContent>
                {categories.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: c.color || '#14b8a6' }} />
                      {c.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {remain !== null && (
            <div className="bg-teal-50 border border-teal-200 rounded-xl p-3 flex justify-between text-sm">
              <span className="text-teal-600">יתרה זמינה בקטגוריה:</span>
              <span className="font-bold text-teal-700">₪{remain.toLocaleString('he-IL')}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>סכום ₪ *</Label>
              <MoneyInput value={form.amount} onChange={v => setForm(f => ({ ...f, amount: v }))} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label>תאריך</Label>
              <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>ספק</Label>
            <Select value={form.supplier_name || ''} onValueChange={v => setForm(f => ({ ...f, supplier_name: v }))}>
              <SelectTrigger><SelectValue placeholder="שם הספק..." /></SelectTrigger>
              <SelectContent>
                {suppliers.filter(s => s.status === 'active').map(s => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>תיאור</Label>
            <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="תיאור ההוצאה..." rows={2} />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => onOpenChange(false)}>ביטול</Button>
            <Button onClick={handleSubmit} disabled={saving || !form.category_id || !amountValid}
              className="bg-gradient-to-l from-teal-400 to-green-500 text-white border-0 hover:opacity-90">
              {saving ? 'שומר...' : 'שמור הוצאה'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}