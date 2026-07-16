import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { BRANCH_STATUS_LABELS, EMPLOYER_TYPE_LABELS } from '@/lib/staffUtils';

const empty = { branch_id: '', position_name: '', scope_percentage: 100, weekly_hours_approved: 0, approved_count: 1, approval_date: '', category: [], notes: '', status: 'active' };

export default function PositionDialog({ open, onOpenChange, initialData, branches, onSave }) {
  const [form, setForm] = useState(empty);
  useEffect(() => { setForm(initialData ? { ...empty, ...initialData, category: initialData.category || [] } : empty); }, [initialData, open]);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const toggleCategory = (k) => setForm(f => {
    const cats = f.category || [];
    return { ...f, category: cats.includes(k) ? cats.filter(c => c !== k) : [...cats, k] };
  });

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
          <div>
            <Label>קטגוריה</Label>
            <div className="flex flex-wrap gap-3 mt-1">
              {Object.entries(EMPLOYER_TYPE_LABELS).map(([k, label]) => (
                <label key={k} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <Checkbox checked={(form.category || []).includes(k)} onCheckedChange={() => toggleCategory(k)} />
                  {label}
                </label>
              ))}
            </div>
          </div>
          <div><Label>הערות</Label><Textarea value={form.notes || ''} onChange={e => set('notes', e.target.value)} rows={2} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>ביטול</Button>
          <Button onClick={handleSave} disabled={!form.branch_id || !form.position_name?.trim()}>שמור</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}