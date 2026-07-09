import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DOMAIN_STATUS_LABELS } from '@/lib/projectUtils';

const emptyDomain = {
  name: '', parent_domain_id: '', parent_domain_name: '', status: 'active', notes: ''
};

export default function DomainDialog({ open, onOpenChange, initialData, parentDomains, onSave }) {
  const [form, setForm] = useState(emptyDomain);

  useEffect(() => {
    if (open) setForm(initialData ? { ...emptyDomain, ...initialData } : emptyDomain);
  }, [open, initialData]);

  const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  const handleParent = (parentId) => {
    const p = parentDomains?.find(d => d.id === parentId);
    set('parent_domain_id', parentId);
    set('parent_domain_name', p?.name || '');
  };

  const submit = () => {
    if (!form.name?.trim()) return;
    onSave(form);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{initialData ? 'עריכת תחום' : 'תחום חדש'}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>שם תחום *</Label>
            <Input value={form.name || ''} onChange={e => set('name', e.target.value)} placeholder="לדוגמה: בינוי, ריהוט, כוח אדם" />
          </div>
          {parentDomains && parentDomains.length > 0 && (
            <div>
              <Label>תחום אב (לתת-תחום)</Label>
              <Select value={form.parent_domain_id || 'none'} onValueChange={v => v === 'none' ? handleParent('') : handleParent(v)}>
                <SelectTrigger><SelectValue placeholder="תחום ראשי" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">תחום ראשי</SelectItem>
                  {parentDomains.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label>סטטוס</Label>
            <Select value={form.status || 'active'} onValueChange={v => set('status', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(DOMAIN_STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>הערות</Label>
            <Textarea value={form.notes || ''} onChange={e => set('notes', e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>ביטול</Button>
          <Button onClick={submit}>{initialData ? 'שמור' : 'צור תחום'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}