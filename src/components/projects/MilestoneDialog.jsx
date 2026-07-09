import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { MILESTONE_STATUS_LABELS } from '@/lib/projectUtils';

const emptyMilestone = {
  name: '', description: '', related_domain: '', target_date: '', status: 'not_started',
  progress_percentage: 0, responsible: '', is_completed: false, completed_date: '', notes: ''
};

export default function MilestoneDialog({ open, onOpenChange, initialData, domains, onSave }) {
  const [form, setForm] = useState(emptyMilestone);

  useEffect(() => {
    if (open) setForm(initialData ? { ...emptyMilestone, ...initialData } : emptyMilestone);
  }, [open, initialData]);

  const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  const submit = () => {
    if (!form.name?.trim()) return;
    const data = { ...form };
    if (data.is_completed && !data.completed_date) {
      data.completed_date = new Date().toISOString().split('T')[0];
    }
    if (!data.is_completed) data.completed_date = '';
    onSave(data);
  };

  const domainNames = domains?.filter(d => !d.parent_domain_id && d.status === 'active').map(d => d.name) || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{initialData ? 'עריכת אבן דרך' : 'אבן דרך חדשה'}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>שם אבן דרך *</Label>
            <Input value={form.name || ''} onChange={e => set('name', e.target.value)} />
          </div>
          <div>
            <Label>תיאור</Label>
            <Textarea value={form.description || ''} onChange={e => set('description', e.target.value)} rows={2} />
          </div>
          <div>
            <Label>תחום קשור</Label>
            <Select value={form.related_domain || 'none'} onValueChange={v => set('related_domain', v === 'none' ? '' : v)}>
              <SelectTrigger><SelectValue placeholder="ללא תחום" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">ללא תחום</SelectItem>
                {domainNames.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
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
                <SelectContent>{Object.entries(MILESTONE_STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>אחראי</Label>
              <Input value={form.responsible || ''} onChange={e => set('responsible', e.target.value)} />
            </div>
            <div>
              <Label>אחוז התקדמות (%)</Label>
              <Input type="number" min="0" max="100" value={form.progress_percentage || 0} onChange={e => set('progress_percentage', Number(e.target.value))} />
            </div>
          </div>
          <div>
            <Label>תאריך השלמה בפועל</Label>
            <Input type="date" value={form.completed_date || ''} onChange={e => set('completed_date', e.target.value)} />
          </div>
          <div>
            <Label>הערות</Label>
            <Textarea value={form.notes || ''} onChange={e => set('notes', e.target.value)} rows={2} />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox checked={form.is_completed || false} onCheckedChange={v => set('is_completed', v)} id="ms-completed" />
            <Label htmlFor="ms-completed" className="cursor-pointer">הושלמה</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>ביטול</Button>
          <Button onClick={submit}>{initialData ? 'שמור' : 'צור אבן דרך'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}