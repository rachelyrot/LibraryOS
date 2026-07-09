import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { GOAL_STATUS_LABELS } from '@/lib/projectUtils';

const emptyGoal = {
  name: '', description: '', success_metric: '', target_value: 0, current_value: 0,
  unit: '', progress_percentage: 0, target_date: '', status: 'not_started'
};

export default function GoalDialog({ open, onOpenChange, initialData, onSave }) {
  const [form, setForm] = useState(emptyGoal);

  useEffect(() => {
    if (open) setForm(initialData ? { ...emptyGoal, ...initialData } : emptyGoal);
  }, [open, initialData]);

  const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  const submit = () => {
    if (!form.name?.trim()) return;
    onSave(form);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{initialData ? 'עריכת יעד' : 'יעד חדש'}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>שם יעד *</Label>
            <Input value={form.name || ''} onChange={e => set('name', e.target.value)} />
          </div>
          <div>
            <Label>תיאור יעד</Label>
            <Textarea value={form.description || ''} onChange={e => set('description', e.target.value)} rows={2} />
          </div>
          <div>
            <Label>מדד הצלחה</Label>
            <Input value={form.success_metric || ''} onChange={e => set('success_metric', e.target.value)} placeholder="לדוגמה: מספר ספרים שקוטלגו" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>ערך יעד</Label>
              <Input type="number" value={form.target_value || 0} onChange={e => set('target_value', Number(e.target.value))} />
            </div>
            <div>
              <Label>ערך נוכחי</Label>
              <Input type="number" value={form.current_value || 0} onChange={e => set('current_value', Number(e.target.value))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>יחידת מדידה</Label>
              <Input value={form.unit || ''} onChange={e => set('unit', e.target.value)} placeholder="לדוגמה: ספרים, שעות" />
            </div>
            <div>
              <Label>אחוז התקדמות (%)</Label>
              <Input type="number" min="0" max="100" value={form.progress_percentage || 0} onChange={e => set('progress_percentage', Number(e.target.value))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>תאריך יעד</Label>
              <Input type="date" value={form.target_date || ''} onChange={e => set('target_date', e.target.value)} />
            </div>
            <div>
              <Label>סטטוס</Label>
              <Select value={form.status || 'not_started'} onValueChange={v => set('status', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(GOAL_STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>ביטול</Button>
          <Button onClick={submit}>{initialData ? 'שמור' : 'צור יעד'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}