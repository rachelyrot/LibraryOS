import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { fullName } from '@/lib/staffUtils';

const emptyMember = {
  person_type: 'employee', person_id: '', person_name: '', role_in_project: '',
  branch_id: '', branch_name: '', planned_hours: 0, actual_hours: 0, notes: ''
};

export default function MemberDialog({ open, onOpenChange, initialData, employees, volunteers, branches, onSave }) {
  const [form, setForm] = useState(emptyMember);

  useEffect(() => {
    if (open) setForm(initialData ? { ...emptyMember, ...initialData } : emptyMember);
  }, [open, initialData]);

  const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  const handlePerson = (personId) => {
    const list = form.person_type === 'employee' ? employees : volunteers;
    const person = list.find(p => p.id === personId);
    set('person_id', personId);
    set('person_name', person ? fullName(person) : '');
    if (person?.primary_branch_id) {
      set('branch_id', person.primary_branch_id);
      const b = branches.find(br => br.id === person.primary_branch_id);
      set('branch_name', b?.name || '');
    } else if (person?.preferred_branch_id) {
      set('branch_id', person.preferred_branch_id);
      const b = branches.find(br => br.id === person.preferred_branch_id);
      set('branch_name', b?.name || '');
    }
  };

  const handleTypeChange = (type) => {
    set('person_type', type);
    set('person_id', '');
    set('person_name', '');
  };

  const handleBranch = (branchId) => {
    const b = branches.find(x => x.id === branchId);
    set('branch_id', branchId);
    set('branch_name', b?.name || '');
  };

  const submit = () => {
    if (!form.person_name?.trim()) return;
    onSave(form);
  };

  const personList = form.person_type === 'employee' ? employees : volunteers;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{initialData ? 'עריכת שיוך' : 'שיוך כוח אדם לפרויקט'}</DialogTitle></DialogHeader>
        <div className="form-grid">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>סוג</Label>
              <Select value={form.person_type || 'employee'} onValueChange={handleTypeChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="employee">עובדת</SelectItem>
                  <SelectItem value="volunteer">מתנדבת</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>בחירת איש צוות</Label>
              <Select value={form.person_id || 'none'} onValueChange={v => v === 'none' ? handlePerson('') : handlePerson(v)}>
                <SelectTrigger><SelectValue placeholder="בחר" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">בחירה ידנית</SelectItem>
                  {personList.map(p => <SelectItem key={p.id} value={p.id}>{fullName(p)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>שם (אם ידני)</Label>
            <Input value={form.person_name || ''} onChange={e => set('person_name', e.target.value)} />
          </div>
          <div>
            <Label>תפקיד בפרויקט</Label>
            <Input value={form.role_in_project || ''} onChange={e => set('role_in_project', e.target.value)} placeholder="לדוגמה: אחראית קטלוג" />
          </div>
          <div>
            <Label>סניף</Label>
            <Select value={form.branch_id || 'none'} onValueChange={v => v === 'none' ? handleBranch('') : handleBranch(v)}>
              <SelectTrigger><SelectValue placeholder="ללא סניף" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">ללא סניף</SelectItem>
                {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>שעות מתוכננות</Label>
              <Input type="number" value={form.planned_hours || 0} onChange={e => set('planned_hours', Number(e.target.value))} />
            </div>
            <div>
              <Label>שעות בפועל</Label>
              <Input type="number" value={form.actual_hours || 0} onChange={e => set('actual_hours', Number(e.target.value))} />
            </div>
          </div>
          <div>
            <Label>הערות</Label>
            <Textarea value={form.notes || ''} onChange={e => set('notes', e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>ביטול</Button>
          <Button onClick={submit}>{initialData ? 'שמור' : 'צור שיוך'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}