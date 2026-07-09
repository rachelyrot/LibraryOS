import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { VOLUNTEER_ACTIVITY_LABELS, VOLUNTEER_STATUS_LABELS } from '@/lib/staffUtils';

const empty = { first_name: '', last_name: '', phone: '', email: '', preferred_branch_id: '', preferred_days: '', preferred_hours: '', activity_area: 'book_arrangement', status: 'active', notes: '' };

export default function VolunteerDialog({ open, onOpenChange, initialData, branches, onSave }) {
  const [form, setForm] = useState(empty);
  useEffect(() => { setForm(initialData ? { ...empty, ...initialData } : empty); }, [initialData, open]);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = () => {
    if (!form.first_name?.trim() || !form.last_name?.trim()) return;
    const branch = branches.find(b => b.id === form.preferred_branch_id);
    onSave({ ...form, preferred_branch_name: branch?.name || '' });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{initialData ? 'עריכת מתנדבת' : 'מתנדבת חדשה'}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>שם פרטי *</Label><Input value={form.first_name || ''} onChange={e => set('first_name', e.target.value)} /></div>
          <div><Label>שם משפחה *</Label><Input value={form.last_name || ''} onChange={e => set('last_name', e.target.value)} /></div>
          <div><Label>טלפון</Label><Input value={form.phone || ''} onChange={e => set('phone', e.target.value)} /></div>
          <div><Label>מייל</Label><Input type="email" value={form.email || ''} onChange={e => set('email', e.target.value)} /></div>
          <div>
            <Label>סניף מועדף</Label>
            <Select value={form.preferred_branch_id || ''} onValueChange={v => set('preferred_branch_id', v)}>
              <SelectTrigger><SelectValue placeholder="בחרי סניף" /></SelectTrigger>
              <SelectContent>{branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>תחום פעילות</Label>
            <Select value={form.activity_area || 'book_arrangement'} onValueChange={v => set('activity_area', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(VOLUNTEER_ACTIVITY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>ימים מועדפים</Label><Input value={form.preferred_days || ''} onChange={e => set('preferred_days', e.target.value)} placeholder="לדוגמה: א,ב,ג" /></div>
          <div><Label>שעות מועדפות</Label><Input value={form.preferred_hours || ''} onChange={e => set('preferred_hours', e.target.value)} placeholder="09:00-13:00" /></div>
          <div>
            <Label>סטטוס</Label>
            <Select value={form.status || 'active'} onValueChange={v => set('status', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(VOLUNTEER_STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
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