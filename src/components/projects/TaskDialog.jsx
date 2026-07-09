import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TASK_STATUS_LABELS, PRIORITY_LABELS, DEFAULT_SUBDOMAINS } from '@/lib/projectUtils';

const emptyTask = {
  phase: '', domain: '', sub_domain: '', task_description: '', assignee: '', partners: '',
  executing_parties: '', contact_name: '', contact_role: '', contact_phone: '', contact_email: '',
  start_date: '', due_date: '', estimated_duration: '', priority: 'medium',
  status: 'not_started', progress_percentage: 0, notes: '', depends_on_task_id: '', depends_on_task_name: ''
};

export default function TaskDialog({ open, onOpenChange, initialData, projectTasks, domains, onSave }) {
  const [form, setForm] = useState(emptyTask);

  useEffect(() => {
    if (open) setForm(initialData ? { ...emptyTask, ...initialData } : emptyTask);
  }, [open, initialData]);

  const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  const handleDepends = (taskId) => {
    const t = projectTasks.find(x => x.id === taskId);
    set('depends_on_task_id', taskId);
    set('depends_on_task_name', t?.task_description || '');
  };

  const submit = () => {
    if (!form.task_description?.trim()) return;
    onSave(form);
  };

  const domainNames = domains?.filter(d => !d.parent_domain_id && d.status === 'active').map(d => d.name) || [];
  const subDomainOptions = form.domain ? (DEFAULT_SUBDOMAINS[form.domain] || []) : [];
  const dbSubDomains = domains?.filter(d => d.parent_domain_name === form.domain && d.status === 'active').map(d => d.name) || [];
  const allSubDomains = [...new Set([...subDomainOptions, ...dbSubDomains])];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{initialData ? 'עריכת משימה' : 'משימה חדשה'}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>שלב</Label>
            <Input value={form.phase || ''} onChange={e => set('phase', e.target.value)} placeholder="ללא שלב" />
          </div>
          <div>
            <Label>תחום</Label>
            <Select value={form.domain || 'none'} onValueChange={v => { set('domain', v === 'none' ? '' : v); set('sub_domain', ''); }}>
              <SelectTrigger><SelectValue placeholder="בחר תחום" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">ללא תחום</SelectItem>
                {domainNames.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>תת-תחום</Label>
            <Select value={form.sub_domain || 'none'} onValueChange={v => set('sub_domain', v === 'none' ? '' : v)}>
              <SelectTrigger><SelectValue placeholder="ללא תת-תחום" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">ללא</SelectItem>
                {allSubDomains.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label>משימה מפורטת *</Label>
            <Textarea value={form.task_description || ''} onChange={e => set('task_description', e.target.value)} rows={2} />
          </div>
          <div>
            <Label>אחראי בפועל</Label>
            <Input value={form.assignee || ''} onChange={e => set('assignee', e.target.value)} />
          </div>
          <div>
            <Label>שותפים לפרויקט</Label>
            <Input value={form.partners || ''} onChange={e => set('partners', e.target.value)} />
          </div>
          <div>
            <Label>גורמים לביצוע</Label>
            <Input value={form.executing_parties || ''} onChange={e => set('executing_parties', e.target.value)} placeholder="ספקים / יועצים / עירייה" />
          </div>
          <div>
            <Label>שם איש קשר</Label>
            <Input value={form.contact_name || ''} onChange={e => set('contact_name', e.target.value)} />
          </div>
          <div>
            <Label>תפקיד איש קשר</Label>
            <Input value={form.contact_role || ''} onChange={e => set('contact_role', e.target.value)} />
          </div>
          <div>
            <Label>טלפון איש קשר</Label>
            <Input value={form.contact_phone || ''} onChange={e => set('contact_phone', e.target.value)} />
          </div>
          <div>
            <Label>מייל איש קשר</Label>
            <Input type="email" value={form.contact_email || ''} onChange={e => set('contact_email', e.target.value)} />
          </div>
          <div>
            <Label>תאריך התחלה</Label>
            <Input type="date" value={form.start_date || ''} onChange={e => set('start_date', e.target.value)} />
          </div>
          <div>
            <Label>תאריך יעד</Label>
            <Input type="date" value={form.due_date || ''} onChange={e => set('due_date', e.target.value)} />
          </div>
          <div>
            <Label>משך משוער</Label>
            <Input value={form.estimated_duration || ''} onChange={e => set('estimated_duration', e.target.value)} placeholder="לדוגמה: 3 ימים" />
          </div>
          <div>
            <Label>עדיפות</Label>
            <Select value={form.priority || 'medium'} onValueChange={v => set('priority', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(PRIORITY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>סטטוס</Label>
            <Select value={form.status || 'not_started'} onValueChange={v => set('status', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(TASK_STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>אחוז התקדמות (%)</Label>
            <Input type="number" min="0" max="100" value={form.progress_percentage || 0} onChange={e => set('progress_percentage', Number(e.target.value))} />
          </div>
          {projectTasks && projectTasks.length > 0 && (
            <div className="col-span-2">
              <Label>תלות במשימה אחרת</Label>
              <Select value={form.depends_on_task_id || 'none'} onValueChange={v => v === 'none' ? handleDepends('') : handleDepends(v)}>
                <SelectTrigger><SelectValue placeholder="ללא תלות" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">ללא תלות</SelectItem>
                  {projectTasks.filter(t => t.id !== initialData?.id).map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.task_description?.substring(0, 60)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="col-span-2">
            <Label>הערות</Label>
            <Textarea value={form.notes || ''} onChange={e => set('notes', e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>ביטול</Button>
          <Button onClick={submit}>{initialData ? 'שמור' : 'צור משימה'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}