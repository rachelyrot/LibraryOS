import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import MoneyInput from '@/components/budget/MoneyInput';
import { MINISTRY_PARAMETERS, MONTHS, ruleLabel, itemMonths, num, formatMoney } from '@/lib/workPlan';

const NOT_SET = '__none__';

const EMPTY = {
  category: '', activity_name: '', description: '', target_audience: '', expected_participants: '',
  start_month: NOT_SET, end_month: NOT_SET, municipal_amount: '', ministry_amount: '', notes: '',
};

/**
 * הוספה/עריכה של שורה מפורטת בתכנית העבודה, תחת אחד מפרמטרי טופס המשרד.
 * הסכומים מוחזקים כמחרוזות גולמיות בטופס (ראה MoneyInput) ומומרים למספר בשמירה.
 */
export default function WorkPlanItemDialog({ open, onOpenChange, item, defaultCategory, onSubmit }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (item) {
      // שורה ישנה עם רבעונים בלבד נפתחת עם טווח החודשים שנגזר מהם, כך שהשמירה
      // הבאה כותבת אותה בפורמט החדש בלי לאבד את התזמון.
      const months = itemMonths(item);
      setForm({
        ...EMPTY,
        ...item,
        expected_participants: item.expected_participants != null ? String(item.expected_participants) : '',
        municipal_amount: item.municipal_amount != null ? String(item.municipal_amount) : '',
        ministry_amount: item.ministry_amount != null ? String(item.ministry_amount) : '',
        start_month: months.length ? String(months[0]) : NOT_SET,
        end_month: months.length ? String(months[months.length - 1]) : NOT_SET,
      });
    } else {
      setForm({ ...EMPTY, category: defaultCategory || MINISTRY_PARAMETERS[0].name });
    }
  }, [open, item, defaultCategory]);

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const setStart = (v) => setForm(f => ({
    ...f,
    start_month: v,
    // ברירת מחדל נוחה: חודש סיום ריק או מוקדם מההתחלה מתיישר לחודש ההתחלה
    end_month: v === NOT_SET ? NOT_SET : (f.end_month === NOT_SET || num(f.end_month) < num(v) ? v : f.end_month),
  }));

  // שורה ישנה שהקטגוריה שלה לא אחד מפרמטרי המשרד — מציגים אותה כאפשרות כדי
  // שהעריכה לא תאפס אותה בשקט.
  const legacyCategory = form.category && !MINISTRY_PARAMETERS.some(p => p.name === form.category) ? form.category : null;
  const total = num(form.municipal_amount) + num(form.ministry_amount);

  const save = async () => {
    if (!form.category) { toast.error('יש לבחור פרמטר'); return; }
    if (!form.activity_name.trim()) { toast.error('יש להזין תיאור לשורה'); return; }
    const start = form.start_month === NOT_SET ? null : num(form.start_month);
    const end = form.end_month === NOT_SET ? start : num(form.end_month);
    if (start && end < start) { toast.error('חודש הסיום מוקדם מחודש ההתחלה'); return; }

    setSaving(true);
    try {
      await onSubmit({
        category: form.category,
        activity_name: form.activity_name.trim(),
        description: form.description,
        target_audience: form.target_audience,
        expected_participants: form.expected_participants === '' ? '' : num(form.expected_participants),
        utilization_start_month: start,
        utilization_end_month: start ? end : null,
        // התזמון עבר לטווח חודשים; מנקים רבעונים ישנים כדי שלא יתנגשו
        quarters: [],
        municipal_amount: num(form.municipal_amount),
        ministry_amount: num(form.ministry_amount),
        notes: form.notes,
      });
      onOpenChange(false);
    } catch (e) {
      toast.error(e?.message || 'שגיאה בשמירת השורה');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>{item ? 'עריכת שורה' : 'שורה חדשה'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>פרמטר *</Label>
            <Select value={form.category} onValueChange={v => set('category', v)}>
              <SelectTrigger className="h-auto min-h-9 text-right whitespace-normal"><SelectValue placeholder="בחרי פרמטר" /></SelectTrigger>
              <SelectContent>
                {MINISTRY_PARAMETERS.map(p => (
                  <SelectItem key={p.name} value={p.name}>
                    {p.name}{ruleLabel(p) && <span className="text-muted-foreground"> · {ruleLabel(p)}</span>}
                  </SelectItem>
                ))}
                {legacyCategory && <SelectItem value={legacyCategory}>{legacyCategory} (לא מטופס המשרד)</SelectItem>}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>פירוט *</Label>
            <Input value={form.activity_name} onChange={e => set('activity_name', e.target.value)} placeholder="למשל: ספרי קריאה לילדים, סדרת הרצאות, מחשבים לעמדות קהל…" />
          </div>

          <div className="space-y-1.5">
            <Label>תיאור</Label>
            <Textarea value={form.description} onChange={e => set('description', e.target.value)} rows={2} />
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
            <p className="text-xs text-muted-foreground">סה"כ לשורה: <span className="font-bold text-foreground">{formatMoney(total)}</span></p>
          </div>

          <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-3">
            <p className="text-sm font-semibold">זמן ניצול התקציב</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>מחודש</Label>
                <Select value={form.start_month} onValueChange={setStart}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NOT_SET}>לא נקבע</SelectItem>
                    {MONTHS.map((m, k) => <SelectItem key={m} value={String(k + 1)}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>עד חודש</Label>
                <Select value={form.end_month} onValueChange={v => set('end_month', v)} disabled={form.start_month === NOT_SET}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {form.start_month === NOT_SET && <SelectItem value={NOT_SET}>לא נקבע</SelectItem>}
                    {MONTHS.map((m, k) => (
                      <SelectItem key={m} value={String(k + 1)} disabled={k + 1 < num(form.start_month)}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">בלוח הניצול החודשי הסכום מתחלק שווה בין החודשים שבטווח.</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>קהל יעד</Label>
              <Input value={form.target_audience} onChange={e => set('target_audience', e.target.value)} placeholder="ילדים, נוער, מבוגרים…" />
            </div>
            <div className="space-y-1.5">
              <Label>משתתפים צפויים</Label>
              <Input type="text" inputMode="numeric" dir="ltr" className="text-right"
                value={form.expected_participants}
                onChange={e => set('expected_participants', e.target.value.replace(/[^\d]/g, ''))} />
            </div>
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
