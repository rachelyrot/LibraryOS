import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import MoneyInput from '@/components/budget/MoneyInput';

const PRESET_COLORS = ['#8b5cf6', '#14b8a6', '#f97316', '#ec4899', '#3b82f6', '#22c55e', '#f43f5e', '#f59e0b', '#6366f1', '#0ea5e9'];
const EMPTY = { name: '', funding_source_type: '', color: '#8b5cf6', total_amount: '', year: new Date().getFullYear().toString(), notes: '', status: 'active', start_date: '', end_date: '' };
const PRESETS = ['עיריית בני ברק', 'משרד התרבות', 'משרד הפריפריה', 'מפעל הפייס', 'קרן תרבות', 'ג\'וינט', 'עמותה מקומית'];

const FUNDING_TYPES = [
  { value: 'municipal', label: 'תקציב עירוני' },
  { value: 'culture_ministry', label: 'תקציב משרד התרבות' },
  { value: 'mifal_hapais', label: 'מפעל הפיס' },
  { value: 'kol_kore', label: 'קול קורא / תמיכה' },
  { value: 'other', label: 'אחר' },
];

export default function BudgetSourceDialog({ open, onOpenChange, source, onSubmit }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setForm(source ? {
      name: source.name,
      funding_source_type: source.funding_source_type || '',
      color: source.color || '#8b5cf6',
      // total_amount מוחזק כמחרוזת גולמית בטופס — ראה MoneyInput
      total_amount: source.total_amount != null ? String(source.total_amount) : '',
      year: source.year || '',
      start_date: source.start_date || '',
      end_date: source.end_date || '',
      notes: source.notes || '',
      status: source.status || 'active',
    } : EMPTY);
  }, [open, source]);

  const handleSubmit = async () => {
    if (!form.name) return;
    setSaving(true);
    try {
      await onSubmit({ ...form, total_amount: form.total_amount === '' ? '' : Number(form.total_amount) });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto font-heebo" dir="rtl">
        <DialogHeader><DialogTitle>{source ? 'עריכת מקור תקציב' : 'מקור תקציב חדש'}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>שם מקור התקציב *</Label>
            <Input value={form.name || ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="עיריית בני ברק, משרד התרבות..." />
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {PRESETS.map(p => (
                <button key={p} onClick={() => setForm(f => ({ ...f, name: p }))}
                  className="text-xs bg-muted hover:bg-secondary text-muted-foreground hover:text-foreground px-2 py-1 rounded-lg transition-all">{p}</button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>סוג מקור מימון</Label>
            <Select value={form.funding_source_type || ''} onValueChange={v => setForm(f => ({ ...f, funding_source_type: v }))}>
              <SelectTrigger><SelectValue placeholder="בחר סוג מימון" /></SelectTrigger>
              <SelectContent>
                {FUNDING_TYPES.map(ft => <SelectItem key={ft.value} value={ft.value}>{ft.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>סכום התחלתי ₪</Label>
              <MoneyInput value={form.total_amount} onChange={v => setForm(f => ({ ...f, total_amount: v }))} />
              <p className="text-xs text-muted-foreground">לעיון בלבד – הסכום מחושב מהקטגוריות</p>
            </div>
            <div className="space-y-1.5">
              <Label>שנה</Label>
              <Input value={form.year || ''} onChange={e => setForm(f => ({ ...f, year: e.target.value }))} placeholder="2026" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>תאריך התחלה</Label>
              <Input type="date" value={form.start_date || ''} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>תאריך סיום</Label>
              <Input type="date" value={form.end_date || ''} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>סטטוס</Label>
            <Select value={form.status || 'active'} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">פעיל</SelectItem>
                <SelectItem value="frozen">מוקפא</SelectItem>
                <SelectItem value="pending">ממתין</SelectItem>
                <SelectItem value="closed">סגור</SelectItem>
              </SelectContent>
            </Select>
          </div>
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
            <Button onClick={handleSubmit} disabled={saving || !form.name}
              className="bg-gradient-to-l from-violet-500 to-purple-600 text-white border-0 hover:opacity-90">
              {saving ? 'שומר...' : 'שמור'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}