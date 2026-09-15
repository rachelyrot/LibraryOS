import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import MoneyInput from '@/components/budget/MoneyInput';
import { QUARTERS, num, formatMoney } from '@/lib/workPlan';

const EMPTY = {
  category: '', activity_name: '', description: '', target_audience: '',
  expected_participants: '', quarters: [], municipal_amount: '', ministry_amount: '', notes: '',
};

/**
 * הוספה/עריכה של פעילות בתכנית העבודה.
 * הסכומים מוחזקים כמחרוזות גולמיות בטופס (ראה MoneyInput) ומומרים למספר בשמירה.
 */
export default function WorkPlanItemDialog({ open, onOpenChange, item, categoryOptions, defaultCategory, onSubmit }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (item) {
      setForm({
        ...EMPTY,
        ...item,
        expected_participants: item.expected_participants != null ? String(item.expected_participants) : '',
        municipal_amount: item.municipal_amount != null ? String(item.municipal_amount) : '',
        ministry_amount: item.ministry_amount != null ? String(item.ministry_amount) : '',
        quarters: Array.isArray(item.quarters) ? item.quarters : [],
      });
    } else {
      setForm({ ...EMPTY, category: defaultCategory || '' });
    }
  }, [open, item, defaultCategory]);

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }));
  const toggleQuarter = (q, checked) => setForm(f => ({
    ...f,
    quarters: checked ? QUARTERS.map(x => x.value).filter(v => v === q || f.quarters.includes(v)) : f.quarters.filter(v => v !== q),
  }));

  const total = num(form.municipal_amount) + num(form.ministry_amount);

  const save = async () => {
    if (!form.category.trim()) { toast.error('יש לבחור קטגוריה'); return; }
    if (!form.activity_name.trim()) { toast.error('יש להזין שם פעילות'); return; }
    setSaving(true);
    try {
      await onSubmit({
        category: form.category.trim(),
        activity_name: form.activity_name.trim(),
        description: form.description,
        target_audience: form.target_audience,
        expected_participants: form.expected_participants === '' ? '' : num(form.expected_participants),
        quarters: form.quarters,
        municipal_amount: num(form.municipal_amount),
        ministry_amount: num(form.ministry_amount),
        notes: form.notes,
      });
      onOpenChange(false);
    } catch (e) {
      toast.error(e?.message || 'שגיאה בשמירת הפעילות');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>{item ? 'עריכת פעילות' : 'פעילות חדשה'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>קטגוריה *</Label>
              <Input list="work-plan-categories" value={form.category} onChange={e => set('category', e.target.value)} placeholder="ספרים, רכש, פעילות…" />
              <datalist id="work-plan-categories">
                {categoryOptions.map(c => <option key={c} value={c} />)}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label>קהל יעד</Label>
              <Input value={form.target_audience} onChange={e => set('target_audience', e.target.value)} placeholder="ילדים, נוער, מבוגרים…" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>שם הפעילות *</Label>
            <Input value={form.activity_name} onChange={e => set('activity_name', e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>תיאור</Label>
            <Textarea value={form.description} onChange={e => set('description', e.target.value)} rows={2} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>משתתפים צפויים</Label>
              <Input type="text" inputMode="numeric" dir="ltr" className="text-right"
                value={form.expected_participants}
                onChange={e => set('expected_participants', e.target.value.replace(/[^\d]/g, ''))} />
            </div>
            <div className="space-y-1.5">
              <Label>מועד</Label>
              <div className="flex flex-wrap gap-x-3 gap-y-1.5 pt-2">
                {QUARTERS.map(q => (
                  <label key={q.value} className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <Checkbox checked={form.quarters.includes(q.value)} onCheckedChange={c => toggleQuarter(q.value, c === true)} />
                    {q.label}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-3">
            <p className="text-sm font-semibold">מימון</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>תקציב עירוני ₪</Label>
                <MoneyInput value={form.municipal_amount} onChange={v => set('municipal_amount', v)} />
              </div>
              <div className="space-y-1.5">
                <Label>משרד התרבות ₪</Label>
                <MoneyInput value={form.ministry_amount} onChange={v => set('ministry_amount', v)} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">סה"כ לפעילות: <span className="font-bold text-foreground">{formatMoney(total)}</span></p>
          </div>

          <div className="space-y-1.5">
            <Label>הערות</Label>
            <Textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>ביטול</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'שומר…' : 'שמירה'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
