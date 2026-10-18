import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BRANCH_STATUS_LABELS } from '@/lib/staffUtils';

const empty = { name: '', address: '', phone: '', email: '', manager_name: '', notes: '', status: 'active' };

export default function BranchDialog({ open, onOpenChange, initialData, onSave }) {
  const [form, setForm] = useState(empty);

  useEffect(() => { setForm(initialData ? { ...empty, ...initialData } : empty); }, [initialData, open]);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = () => {
    if (!form.name?.trim()) return;
    onSave(form);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>{initialData ? 'עריכת סניף' : 'סניף חדש'}</DialogTitle></DialogHeader>
        <div className="form-grid">
          <div><Label>שם סניף *</Label><Input value={form.name || ''} onChange={e => set('name', e.target.value)} /></div>
          <div><Label>כתובת</Label><Input value={form.address || ''} onChange={e => set('address', e.target.value)} /></div>
          <div><Label>טלפון</Label><Input value={form.phone || ''} onChange={e => set('phone', e.target.value)} /></div>
          <div><Label>מייל</Label><Input type="email" value={form.email || ''} onChange={e => set('email', e.target.value)} /></div>
          <div><Label>אחראית סניף</Label><Input value={form.manager_name || ''} onChange={e => set('manager_name', e.target.value)} /></div>
          <div>
            <Label>סטטוס</Label>
            <Select value={form.status || 'active'} onValueChange={v => set('status', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(BRANCH_STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>הערות</Label><Textarea value={form.notes || ''} onChange={e => set('notes', e.target.value)} rows={2} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>ביטול</Button>
          <Button onClick={handleSave} disabled={!form.name?.trim()}>שמור</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}