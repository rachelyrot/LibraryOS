import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const PRESET_COLORS = ['#14b8a6', '#8b5cf6', '#f97316', '#ec4899', '#3b82f6', '#22c55e', '#f43f5e', '#f59e0b'];
const EMPTY = { name: '', color: '#14b8a6', allocated_amount: '', notes: '' };

export default function CategoryDialog({ open, onOpenChange, category, onSubmit }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setForm(category ? { name: category.name, color: category.color || '#14b8a6', allocated_amount: category.allocated_amount, notes: category.notes || '' } : EMPTY);
  }, [open, category]);

  const handleSubmit = async () => {
    if (!form.name || !form.allocated_amount) return;
    setSaving(true);
    await onSubmit(form);
    setSaving(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm font-heebo" dir="rtl">
        <DialogHeader><DialogTitle>{category ? 'עריכת קטגוריה' : 'קטגוריה חדשה'}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>שם הקטגוריה *</Label>
            <Input value={form.name || ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="ספרים, פעולות תרבות..." />
          </div>
          <div className="space-y-1.5">
            <Label>סכום מוקצה ₪ *</Label>
            <Input type="number" value={form.allocated_amount || ''} onChange={e => setForm(f => ({ ...f, allocated_amount: Number(e.target.value) }))} />
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
            <Button onClick={handleSubmit} disabled={saving || !form.name || !form.allocated_amount}
              className="bg-gradient-to-l from-teal-400 to-green-500 text-white border-0 hover:opacity-90">
              {saving ? 'שומר...' : 'שמור'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}