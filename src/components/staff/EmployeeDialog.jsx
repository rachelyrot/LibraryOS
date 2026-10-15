import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { EMPLOYMENT_TYPE_LABELS, EMPLOYER_TYPE_LABELS, EMPLOYEE_STATUS_LABELS, FULL_TIME_HOURS, pctToHours, hoursToPct, employeePct } from '@/lib/staffUtils';

const empty = { first_name: '', last_name: '', id_number: '', phone: '', email: '', address: '', start_date: '', position: '', primary_branch_id: '', additional_branch_ids: [], employer_type: '', employment_type: 'permanent', scope_percentage: 100, weekly_hours: FULL_TIME_HOURS, status: 'active', notes: '' };

export default function EmployeeDialog({ open, onOpenChange, initialData, branches, onSave }) {
  const [form, setForm] = useState(empty);

  useEffect(() => {
    if (!initialData) { setForm(empty); return; }
    // עובדת ישנה שהאחוז והשעות שלה לא מסתדרים נפתחת לפי האחוז (100% = 40 ש')
    const pct = employeePct(initialData);
    setForm({ ...empty, ...initialData, additional_branch_ids: initialData.additional_branch_ids || [], scope_percentage: pct, weekly_hours: pctToHours(pct) });
  }, [initialData, open]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  // היקף ושעות מחוברים: שינוי של אחד מעדכן את השני
  const setPct = (v) => setForm(f => ({ ...f, scope_percentage: v, weekly_hours: pctToHours(v) }));
  const setHours = (v) => setForm(f => ({ ...f, weekly_hours: v, scope_percentage: hoursToPct(v) }));
  const toggleBranch = (id) => setForm(f => {
    const ids = f.additional_branch_ids || [];
    return { ...f, additional_branch_ids: ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id] };
  });

  const handleSave = () => {
    if (!form.first_name?.trim() || !form.last_name?.trim()) return;
    const branch = branches.find(b => b.id === form.primary_branch_id);
    const addNames = (form.additional_branch_ids || []).map(id => branches.find(b => b.id === id)?.name).filter(Boolean);
    onSave({ ...form, primary_branch_name: branch?.name || '', additional_branch_names: addNames });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-auto">
        <DialogHeader><DialogTitle>{initialData ? 'עריכת עובדת' : 'עובדת חדשה'}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>שם פרטי *</Label><Input value={form.first_name || ''} onChange={e => set('first_name', e.target.value)} /></div>
          <div><Label>שם משפחה *</Label><Input value={form.last_name || ''} onChange={e => set('last_name', e.target.value)} /></div>
          <div><Label>מספר זהות</Label><Input value={form.id_number || ''} onChange={e => set('id_number', e.target.value)} /></div>
          <div><Label>טלפון</Label><Input value={form.phone || ''} onChange={e => set('phone', e.target.value)} /></div>
          <div><Label>מייל</Label><Input type="email" value={form.email || ''} onChange={e => set('email', e.target.value)} /></div>
          <div><Label>תאריך תחילת עבודה</Label><Input type="date" value={form.start_date || ''} onChange={e => set('start_date', e.target.value)} /></div>
          <div className="col-span-2"><Label>כתובת</Label><Input value={form.address || ''} onChange={e => set('address', e.target.value)} /></div>
          <div><Label>תפקיד</Label><Input value={form.position || ''} onChange={e => set('position', e.target.value)} /></div>
          <div>
            <Label>סניף ראשי</Label>
            <Select value={form.primary_branch_id || ''} onValueChange={v => set('primary_branch_id', v)}>
              <SelectTrigger><SelectValue placeholder="בחרי סניף" /></SelectTrigger>
              <SelectContent>{branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>מעסיק</Label>
            <Select value={form.employer_type || ''} onValueChange={v => set('employer_type', v)}>
              <SelectTrigger><SelectValue placeholder="בחרי מעסיק" /></SelectTrigger>
              <SelectContent>{Object.entries(EMPLOYER_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>סטטוס העסקה</Label>
            <Select value={form.employment_type || 'permanent'} onValueChange={v => set('employment_type', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(EMPLOYMENT_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>סטטוס</Label>
            <Select value={form.status || 'active'} onValueChange={v => set('status', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(EMPLOYEE_STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>היקף משרה (%)</Label><Input type="number" min="0" max="100" value={form.scope_percentage ?? ''} onChange={e => setPct(parseFloat(e.target.value) || 0)} /></div>
          <div><Label>שעות שבועיות</Label><Input type="number" min="0" max={FULL_TIME_HOURS} value={form.weekly_hours ?? ''} onChange={e => setHours(parseFloat(e.target.value) || 0)} /></div>
          <p className="col-span-2 -mt-1 text-xs text-muted-foreground">100% משרה = {FULL_TIME_HOURS} שעות שבועיות. מספיק למלא אחד מהשדות.</p>
        </div>
        <div>
          <Label>סניפים נוספים</Label>
          <div className="flex flex-wrap gap-3 mt-1">
            {branches.filter(b => b.id !== form.primary_branch_id).map(b => (
              <label key={b.id} className="flex items-center gap-1.5 text-sm cursor-pointer">
                <Checkbox checked={(form.additional_branch_ids || []).includes(b.id)} onCheckedChange={() => toggleBranch(b.id)} />
                {b.name}
              </label>
            ))}
          </div>
        </div>
        <div><Label>הערות</Label><Textarea value={form.notes || ''} onChange={e => set('notes', e.target.value)} rows={2} /></div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>ביטול</Button>
          <Button onClick={handleSave} disabled={!form.first_name?.trim() || !form.last_name?.trim()}>שמור</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}