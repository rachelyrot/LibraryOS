import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import MoneyInput from '@/components/budget/MoneyInput';
import { base44 } from '@/api/base44Client';
import { MINISTRY_PARAMETERS } from '@/lib/workPlan';

const PRESET_COLORS = ['#14b8a6', '#8b5cf6', '#f97316', '#ec4899', '#3b82f6', '#22c55e', '#f43f5e', '#f59e0b'];
const EMPTY = { name: '', category_number: '', supplier_id: '', supplier_name: '', color: '#14b8a6', allocated_amount: '', work_plan_category: '', notes: '' };
const NO_SUPPLIER = '__none__';
const NO_PARAMETER = '__none__';

export default function CategoryDialog({ open, onOpenChange, category, onSubmit }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [suppliers, setSuppliers] = useState([]);

  useEffect(() => {
    base44.entities.Supplier.filter({ status: 'active' }, 'name', 200).then(setSuppliers).catch(() => {});
  }, []);

  useEffect(() => {
    if (open) setForm(category ? {
      name: category.name,
      category_number: category.category_number || '',
      supplier_id: category.supplier_id || '',
      supplier_name: category.supplier_name || '',
      color: category.color || '#14b8a6',
      // allocated_amount מוחזק כמחרוזת גולמית בטופס — ראה MoneyInput
      allocated_amount: category.allocated_amount != null ? String(category.allocated_amount) : '',
      work_plan_category: category.work_plan_category || '',
      notes: category.notes || '',
    } : EMPTY);
  }, [open, category]);

  const amount = Number(form.allocated_amount);
  const amountValid = form.allocated_amount !== '' && Number.isFinite(amount) && amount > 0;

  const handleSubmit = async () => {
    if (!form.name || !amountValid) return;
    setSaving(true);
    try {
      // work_plan_category נשלח רק כשיש בו ערך (או כשמנקים ערך קיים), כדי ששמירת
      // קטגוריה לא תיכשל לפני שמיגרציה 0014 הורצה
      // (ובאותו אופן category_number לפני מיגרציה 0016)
      const { work_plan_category, category_number, ...rest } = form;
      const data = { ...rest, allocated_amount: amount };
      if (work_plan_category || category?.work_plan_category) data.work_plan_category = work_plan_category;
      if (category_number || category?.category_number) data.category_number = category_number.trim();
      await onSubmit(data);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto font-heebo" dir="rtl">
        <DialogHeader><DialogTitle>{category ? 'עריכת קטגוריה' : 'קטגוריה חדשה'}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>מספר קטגוריה</Label>
              <Input value={form.category_number || ''} onChange={e => setForm(f => ({ ...f, category_number: e.target.value }))} placeholder="אופציונלי" dir="ltr" />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>שם הקטגוריה *</Label>
              <Input value={form.name || ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="ספרים, פעולות תרבות..." />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>שם ספק</Label>
            <Select
              value={form.supplier_id || NO_SUPPLIER}
              onValueChange={v => {
                if (v === NO_SUPPLIER) return setForm(f => ({ ...f, supplier_id: '', supplier_name: '' }));
                const sup = suppliers.find(s => s.id === v);
                setForm(f => ({ ...f, supplier_id: v, supplier_name: sup?.name || '' }));
              }}
            >
              <SelectTrigger><SelectValue placeholder="בחר ספק (אופציונלי)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_SUPPLIER}>ללא ספק</SelectItem>
                {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">אם התקציב בקטגוריה זו מיועד לספק מסוים</p>
          </div>
          <div className="space-y-1.5">
            <Label>סכום מוקצה ₪ *</Label>
            <MoneyInput value={form.allocated_amount} onChange={v => setForm(f => ({ ...f, allocated_amount: v }))} placeholder="₪" />
          </div>
          <div className="space-y-1.5">
            <Label>פרמטר בתכנית העבודה</Label>
            <Select
              value={form.work_plan_category || NO_PARAMETER}
              onValueChange={v => setForm(f => ({ ...f, work_plan_category: v === NO_PARAMETER ? '' : v }))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_PARAMETER}>ללא שיוך</SelectItem>
                {MINISTRY_PARAMETERS.map(p => <SelectItem key={p.name} value={p.name}>{p.name}</SelectItem>)}
                {form.work_plan_category && !MINISTRY_PARAMETERS.some(p => p.name === form.work_plan_category) && (
                  <SelectItem value={form.work_plan_category}>{form.work_plan_category}</SelectItem>
                )}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">הניצול בקטגוריה ייספר תחת הפרמטר הזה בתכנית העבודה השנתית</p>
          </div>
          {category && (
            <div className="grid grid-cols-2 gap-3 bg-muted/40 rounded-xl p-3 text-center text-sm">
              <div>
                <p className="text-muted-foreground text-xs">משוריין</p>
                <p className="font-bold text-amber-600">₪{(category.reserved_amount || 0).toLocaleString('he-IL')}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">נוצל</p>
                <p className="font-bold text-red-500">₪{(category.spent_amount || 0).toLocaleString('he-IL')}</p>
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>צבע</Label>
            <div className="flex gap-2 flex-wrap">
              {PRESET_COLORS.map(c => (
                <button key={c} onClick={() => setForm(f => ({ ...f, color: c }))}
                  className={`w-8 h-8 rounded-full transition-all ${form.color === c ? 'ring-2 ring-offset-2 ring-foreground scale-110' : 'hover:scale-105'}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>הערות</Label>
            <Textarea value={form.notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => onOpenChange(false)}>ביטול</Button>
            <Button onClick={handleSubmit} disabled={saving || !form.name || !amountValid}
              className="bg-gradient-to-l from-teal-400 to-green-500 text-white border-0 hover:opacity-90">
              {saving ? 'שומר...' : 'שמור'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
