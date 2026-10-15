import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { WEEKDAY_LABELS, calcShiftHours } from '@/lib/staffUtils';
import MoneyInput from '@/components/budget/MoneyInput';

const empty = {
  branch_id: '', company_name: '', contact_name: '', contact_phone: '', contact_email: '',
  workers: [], days: [0, 1, 2, 3, 4], start_time: '08:00', end_time: '19:00',
  monthly_cost: '', contract_start: '', contract_end: '', status: 'active', notes: '',
};

/** הוספה/עריכה של חברת אבטחה או ניקיון לסניף (מיגרציה 0018). */
export default function ServiceContractDialog({ open, onOpenChange, initialData, branches, serviceLabel, showCost, onSave }) {
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(initialData ? {
      ...empty, ...initialData,
      workers: initialData.workers || [],
      days: initialData.days || [],
      monthly_cost: initialData.monthly_cost != null ? String(initialData.monthly_cost) : '',
    } : empty);
  }, [initialData, open]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const toggleDay = (d) => setForm(f => ({ ...f, days: f.days.includes(d) ? f.days.filter(x => x !== d) : [...f.days, d].sort() }));
  const setWorker = (i, k, v) => setForm(f => ({ ...f, workers: f.workers.map((w, j) => (j === i ? { ...w, [k]: v } : w)) }));
  const weeklyHours = Math.round(calcShiftHours(form.start_time, form.end_time) * form.days.length * 10) / 10;
  const valid = form.branch_id && form.company_name.trim();

  const handleSave = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      const branch = branches.find(b => b.id === form.branch_id);
      // מחיר שלא מוצג למשתמשת לא נשלח, כדי שעריכה לא תדרוס אותו
      const { monthly_cost, ...rest } = form;
      const data = {
        ...rest,
        branch_name: branch?.name || '',
        workers: form.workers.filter(w => (w.name || '').trim()),
      };
      if (showCost) data.monthly_cost = monthly_cost === '' ? '' : Number(monthly_cost);
      await onSave(data);
      onOpenChange(false);
    } catch {
      // onSave כבר הציג הודעת שגיאה; הטופס נשאר פתוח עם מה שהוקלד
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-auto" dir="rtl">
        <DialogHeader><DialogTitle>{initialData ? `עריכת ${serviceLabel}` : `${serviceLabel} — חברה חדשה`}</DialogTitle></DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>סניף *</Label>
            <Select value={form.branch_id || ''} onValueChange={v => set('branch_id', v)}>
              <SelectTrigger><SelectValue placeholder="בחרי סניף" /></SelectTrigger>
              <SelectContent>{branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>שם החברה *</Label><Input value={form.company_name} onChange={e => set('company_name', e.target.value)} /></div>
          <div><Label>איש קשר</Label><Input value={form.contact_name || ''} onChange={e => set('contact_name', e.target.value)} /></div>
          <div><Label>טלפון איש קשר</Label><Input dir="ltr" className="text-right" value={form.contact_phone || ''} onChange={e => set('contact_phone', e.target.value)} /></div>
          <div className="col-span-2"><Label>מייל</Label><Input type="email" dir="ltr" className="text-right" value={form.contact_email || ''} onChange={e => set('contact_email', e.target.value)} /></div>
        </div>

        <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-3">
          <p className="text-sm font-semibold">ימים ושעות</p>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAY_LABELS.map((d, i) => (
              <button key={d} type="button" onClick={() => toggleDay(i)}
                className={cn('px-3 py-1.5 rounded-lg text-sm border transition-colors',
                  form.days.includes(i) ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border hover:bg-muted')}>
                {d}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>משעה</Label><Input type="time" value={form.start_time || ''} onChange={e => set('start_time', e.target.value)} /></div>
            <div><Label>עד שעה</Label><Input type="time" value={form.end_time || ''} onChange={e => set('end_time', e.target.value)} /></div>
          </div>
          <p className="text-xs text-muted-foreground">סה"כ {weeklyHours} שעות שבועיות</p>
        </div>

        <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">עובדים שהחברה שולחת</p>
            <Button type="button" size="sm" variant="outline" className="gap-1 h-7"
              onClick={() => set('workers', [...form.workers, { name: '', phone: '' }])}>
              <Plus className="w-3.5 h-3.5" /> עובד
            </Button>
          </div>
          {form.workers.length === 0 && <p className="text-xs text-muted-foreground">לא הוזנו עובדים</p>}
          {form.workers.map((w, i) => (
            <div key={i} className="flex gap-2">
              <Input placeholder="שם" value={w.name || ''} onChange={e => setWorker(i, 'name', e.target.value)} />
              <Input placeholder="טלפון" dir="ltr" className="text-right" value={w.phone || ''} onChange={e => setWorker(i, 'phone', e.target.value)} />
              <Button type="button" variant="ghost" size="icon" className="shrink-0 text-red-500"
                onClick={() => set('workers', form.workers.filter((_, j) => j !== i))}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          {showCost && (
            <div className="col-span-2 sm:col-span-1"><Label>עלות חודשית ₪</Label><MoneyInput value={form.monthly_cost} onChange={v => set('monthly_cost', v)} /></div>
          )}
          <div>
            <Label>סטטוס</Label>
            <Select value={form.status} onValueChange={v => set('status', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">פעיל</SelectItem>
                <SelectItem value="ended">הסתיים</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>תחילת חוזה</Label><Input type="date" value={form.contract_start || ''} onChange={e => set('contract_start', e.target.value)} /></div>
          <div><Label>סיום חוזה</Label><Input type="date" value={form.contract_end || ''} onChange={e => set('contract_end', e.target.value)} /></div>
        </div>

        <div><Label>הערות</Label><Textarea value={form.notes || ''} onChange={e => set('notes', e.target.value)} rows={2} /></div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>ביטול</Button>
          <Button onClick={handleSave} disabled={!valid || saving}>{saving ? 'שומר…' : 'שמור'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
