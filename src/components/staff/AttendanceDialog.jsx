import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ATTENDANCE_STATUS_LABELS } from '@/lib/staffUtils';
import { fullName } from '@/lib/staffUtils';

const emptyAttendance = {
  date: new Date().toISOString().split('T')[0], employee_id: '', employee_name: '',
  branch_id: '', branch_name: '', planned_start: '', planned_end: '',
  actual_start: '', actual_end: '', status: 'present', notes: ''
};

export default function AttendanceDialog({ open, onOpenChange, initialData, employees, branches, onSave }) {
  const [form, setForm] = useState(emptyAttendance);

  useEffect(() => {
    if (open) setForm(initialData ? { ...emptyAttendance, ...initialData } : emptyAttendance);
  }, [open, initialData]);

  const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  const handleEmployee = (empId) => {
    const emp = employees.find(e => e.id === empId);
    set('employee_id', empId);
    set('employee_name', emp ? fullName(emp) : '');
    if (emp?.primary_branch_id) {
      set('branch_id', emp.primary_branch_id);
      set('branch_name', emp.primary_branch_name || '');
    }
  };

  const submit = () => {
    if (!form.employee_id || !form.date) return;
    onSave(form);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{initialData ? 'עריכת נוכחות' : 'רישום נוכחות'}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>תאריך *</Label>
              <Input type="date" value={form.date || ''} onChange={e => set('date', e.target.value)} />
            </div>
            <div>
              <Label>עובדת *</Label>
              <Select value={form.employee_id || 'none'} onValueChange={v => v === 'none' ? handleEmployee('') : handleEmployee(v)}>
                <SelectTrigger><SelectValue placeholder="בחר" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">בחירה</SelectItem>
                  {employees.map(e => <SelectItem key={e.id} value={e.id}>{fullName(e)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>סניף</Label>
            <Select value={form.branch_id || 'none'} onValueChange={v => {
              const b = branches.find(x => x.id === v);
              set('branch_id', v === 'none' ? '' : v);
              set('branch_name', b?.name || '');
            }}>
              <SelectTrigger><SelectValue placeholder="סניף" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">ללא סניף</SelectItem>
                {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>כניסה מתוכננת</Label>
              <Input type="time" value={form.planned_start || ''} onChange={e => set('planned_start', e.target.value)} />
            </div>
            <div>
              <Label>יציאה מתוכננת</Label>
              <Input type="time" value={form.planned_end || ''} onChange={e => set('planned_end', e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>כניסה בפועל</Label>
              <Input type="time" value={form.actual_start || ''} onChange={e => set('actual_start', e.target.value)} />
            </div>
            <div>
              <Label>יציאה בפועל</Label>
              <Input type="time" value={form.actual_end || ''} onChange={e => set('actual_end', e.target.value)} />
            </div>
          </div>
          <div>
            <Label>סטטוס</Label>
            <Select value={form.status || 'present'} onValueChange={v => set('status', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(ATTENDANCE_STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>הערות</Label>
            <Textarea value={form.notes || ''} onChange={e => set('notes', e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>ביטול</Button>
          <Button onClick={submit}>{initialData ? 'שמור' : 'צור רישום'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}