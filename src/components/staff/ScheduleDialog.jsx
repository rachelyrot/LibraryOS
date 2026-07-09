import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SHIFT_TYPE_LABELS, SCHEDULE_STATUS_LABELS, getDayName, fullName } from '@/lib/staffUtils';

const empty = { date: '', branch_id: '', person_id: '', person_type: 'employee', start_time: '08:00', end_time: '13:00', role_in_shift: '', shift_type: 'full_day', notes: '', status: 'planned' };

export default function ScheduleDialog({ open, onOpenChange, initialData, branches, employees, volunteers, onSave }) {
  const [form, setForm] = useState(empty);
  useEffect(() => { setForm(initialData ? { ...empty, ...initialData } : empty); }, [initialData, open]);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const people = form.person_type === 'volunteer' ? volunteers : employees;
  const dayName = form.date ? getDayName(form.date) : '';

  const handleSave = () => {
    if (!form.date || !form.branch_id || !form.person_id) return;
    const branch = branches.find(b => b.id === form.branch_id);
    const person = people.find(p => p.id === form.person_id);
    onSave({ ...form, day_of_week: dayName, branch_name: branch?.name || '', person_name: person ? fullName(person) : '' });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{initialData ? 'עריכת שיבוץ' : 'שיבוץ חדש'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>תאריך *</Label><Input type="date" value={form.date || ''} onChange={e => set('date', e.target.value)} /></div>
            <div><Label>יום</Label><Input value={dayName} disabled className="bg-muted/50" /></div>
          </div>
          <div>
            <Label>סניף *</Label>
            <Select value={form.branch_id || ''} onValueChange={v => set('branch_id', v)}>
              <SelectTrigger><SelectValue placeholder="בחרי סניף" /></SelectTrigger>
              <SelectContent>{branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>סוג אדם</Label>
              <Select value={form.person_type || 'employee'} onValueChange={v => set('person_type', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="employee">עובדת</SelectItem>
                  <SelectItem value="volunteer">מתנדבת</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{form.person_type === 'volunteer' ? 'מתנדבת' : 'עובדת'} *</Label>
              <Select value={form.person_id || ''} onValueChange={v => set('person_id', v)}>
                <SelectTrigger><SelectValue placeholder="בחרי" /></SelectTrigger>
                <SelectContent>
                  {people.filter(p => p.status === 'active' || p.id === form.person_id).map(p => (
                    <SelectItem key={p.id} value={p.id}>{fullName(p)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>שעת התחלה</Label><Input type="time" value={form.start_time || ''} onChange={e => set('start_time', e.target.value)} /></div>
            <div><Label>שעת סיום</Label><Input type="time" value={form.end_time || ''} onChange={e => set('end_time', e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>תפקיד במשמרת</Label><Input value={form.role_in_shift || ''} onChange={e => set('role_in_shift', e.target.value)} /></div>
            <div>
              <Label>סוג משמרת</Label>
              <Select value={form.shift_type || 'full_day'} onValueChange={v => set('shift_type', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(SHIFT_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>סטטוס</Label>
            <Select value={form.status || 'planned'} onValueChange={v => set('status', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(SCHEDULE_STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>הערות</Label><Textarea value={form.notes || ''} onChange={e => set('notes', e.target.value)} rows={2} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>ביטול</Button>
          <Button onClick={handleSave} disabled={!form.date || !form.branch_id || !form.person_id}>שמור</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}