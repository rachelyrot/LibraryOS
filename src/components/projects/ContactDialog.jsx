import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CONTACT_TYPE_LABELS } from '@/lib/projectUtils';

const emptyContact = {
  contact_name: '', contact_role: '', contact_phone: '', contact_email: '', contact_type: 'other', notes: ''
};

export default function ContactDialog({ open, onOpenChange, initialData, onSave }) {
  const [form, setForm] = useState(emptyContact);

  useEffect(() => {
    if (open) setForm(initialData ? { ...emptyContact, ...initialData } : emptyContact);
  }, [open, initialData]);

  const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  const submit = () => {
    if (!form.contact_name?.trim()) return;
    onSave(form);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{initialData ? 'עריכת איש קשר' : 'איש קשר חדש'}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>שם *</Label>
              <Input value={form.contact_name || ''} onChange={e => set('contact_name', e.target.value)} />
            </div>
            <div>
              <Label>תפקיד</Label>
              <Input value={form.contact_role || ''} onChange={e => set('contact_role', e.target.value)} placeholder="לדוגמה: אדריכלית, קבלנית" />
            </div>
          </div>
          <div>
            <Label>סוג קשר</Label>
            <Select value={form.contact_type || 'other'} onValueChange={v => set('contact_type', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(CONTACT_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>טלפון</Label>
              <Input value={form.contact_phone || ''} onChange={e => set('contact_phone', e.target.value)} />
            </div>
            <div>
              <Label>מייל</Label>
              <Input type="email" value={form.contact_email || ''} onChange={e => set('contact_email', e.target.value)} />
            </div>
          </div>
          <div>
            <Label>הערות</Label>
            <Textarea value={form.notes || ''} onChange={e => set('notes', e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>ביטול</Button>
          <Button onClick={submit}>{initialData ? 'שמור' : 'צור איש קשר'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}