import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BRANCH_STATUS_LABELS } from '@/lib/staffUtils';

const empty = { branch_id: '', position_name: '', scope_percentage: 100, weekly_hours_approved: 0, approved_count: 1, approval_date: '', approval_source: '', status: 'active' };

export default function PositionDialog({ open, onOpenChange, initialData, branches, onSave }) {
  const [form, setForm] = useState(empty);
  useEffect(() => { setForm(initialData ? { ...empty, ...initialData } : empty); }, [initialData, open]);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = () => {
    if (!form.branch_id || !form.position_name?.trim()) return;
    const branch = branches.find(b => b.id === form.branch_id);
    onSave({ ...form, branch_name: branch?.name || '' });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{initialData ? 'עריכת תקן' : 'תקן חדש'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>סניף *</Label>
            <Select value={form.branch_id || ''} onValueChange={v => set('branch_id', v)}>
              <SelectTrigger><SelectValue placeholder="בחרי סניף" /></SelectTrigger>
              <SelectContent>{branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>שם תקן / תפקיד *</Label><Input value={form.position_name || ''} onChange={e => set('position_name', e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>היקף תקן (%)</Label><Input type="number" min="0" max="100" value={form.scope_percentage ?? ''} onChange={e => set('scope_percentage', parseFloat(e.target.value) || 0)} /></div>
            <div><Label>שעות שבועיות מאושרות</Label><Input type="number" min="0" value={form.weekly_hours_approved ?? ''} onChange={e => set('weekly_hours_approved', parseFloat(e.target.value) || 0)} /></div>
            <div><Label>מספר תקנים</Label><Input type="number" min="1" value={form.approved_count ?? 1} onChange={e => set('approved_count', parseInt(e.target.value) || 1)} /></div>
            <div><Label>תאריך אישור</Label><Input type="date" value={form.approval_date || ''} onChange={e => set('approval_date', e.target.value)} /></div>
          </div>
          <div>
            <Label>סטטוס</Label>
            <Select value={form.status || 'active'} onValueChange={v => set('status', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(BRANCH_STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>מקור אישור / הערות</Label><Textarea value={form.approval_source || ''} onChange={e => set('approval_source', e.target.value)} rows={2} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>ביטול</Button>
          <Button onClick={handleSave} disabled={!form.branch_id || !form.position_name?.trim()}>שמור</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}