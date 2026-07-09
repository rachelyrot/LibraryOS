import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Upload, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import { PROJECT_TYPE_LABELS, PROJECT_STATUS_LABELS, PRIORITY_LABELS } from '@/lib/projectUtils';

const emptyProject = {
  name: '', description: '', project_type: 'operational', branch_id: '', branch_name: '',
  manager_name: '', start_date: '', target_end_date: '', status: 'draft', priority: 'medium',
  budget_planned: 0, budget_approved: 0, budget_used: 0, budget_is_approved: false,
  budget_approval_date: '', budget_approver: '', budget_approval_file_url: '',
  budget_source_id: '', budget_source_name: '', notes: ''
};

export default function ProjectDialog({ open, onOpenChange, initialData, branches, budgetSources, onSave }) {
  const [form, setForm] = useState(emptyProject);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (open) setForm(initialData ? { ...emptyProject, ...initialData } : emptyProject);
  }, [open, initialData]);

  const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  const handleBranch = (branchId) => {
    const b = branches.find(x => x.id === branchId);
    set('branch_id', branchId);
    set('branch_name', b?.name || '');
  };

  const handleBudgetSource = (sourceId) => {
    const s = budgetSources.find(x => x.id === sourceId);
    set('budget_source_id', sourceId);
    set('budget_source_name', s?.name || '');
  };

  const handleApprovalFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const res = await base44.integrations.Core.UploadFile({ file });
      set('budget_approval_file_url', res.file_url);
      toast.success('קובץ אישור הועלה');
    } catch (err) { toast.error('שגיאה בהעלאת קובץ'); }
    setUploading(false);
  };

  const submit = () => {
    if (!form.name?.trim()) return;
    onSave(form);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{initialData ? 'עריכת פרויקט' : 'פרויקט חדש'}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Label>שם פרויקט *</Label>
            <Input value={form.name || ''} onChange={e => set('name', e.target.value)} placeholder="לדוגמה: הקמת ספרייה חדשה" />
          </div>
          <div className="col-span-2">
            <Label>תיאור</Label>
            <Textarea value={form.description || ''} onChange={e => set('description', e.target.value)} rows={2} />
          </div>
          <div>
            <Label>סוג פרויקט</Label>
            <Select value={form.project_type || 'operational'} onValueChange={v => set('project_type', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(PROJECT_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>סניף קשור</Label>
            <Select value={form.branch_id || 'none'} onValueChange={v => v === 'none' ? handleBranch('') : handleBranch(v)}>
              <SelectTrigger><SelectValue placeholder="ללא סניף" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">ללא סניף</SelectItem>
                {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>אחראית פרויקט</Label>
            <Input value={form.manager_name || ''} onChange={e => set('manager_name', e.target.value)} />
          </div>
          <div>
            <Label>עדיפות</Label>
            <Select value={form.priority || 'medium'} onValueChange={v => set('priority', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(PRIORITY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>תאריך התחלה</Label>
            <Input type="date" value={form.start_date || ''} onChange={e => set('start_date', e.target.value)} />
          </div>
          <div>
            <Label>תאריך יעד לסיום</Label>
            <Input type="date" value={form.target_end_date || ''} onChange={e => set('target_end_date', e.target.value)} />
          </div>
          <div>
            <Label>סטטוס</Label>
            <Select value={form.status || 'draft'} onValueChange={v => set('status', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(PROJECT_STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>תקציב מתוכנן (₪)</Label>
            <Input type="number" value={form.budget_planned || 0} onChange={e => set('budget_planned', Number(e.target.value))} />
          </div>
          <div>
            <Label>תקציב מאושר (₪)</Label>
            <Input type="number" value={form.budget_approved || 0} onChange={e => set('budget_approved', Number(e.target.value))} />
          </div>
          <div>
            <Label>תקציב מנוצל (₪)</Label>
            <Input type="number" value={form.budget_used || 0} onChange={e => set('budget_used', Number(e.target.value))} />
          </div>
          <div>
            <Label>מקור תקציב</Label>
            <Select value={form.budget_source_id || 'none'} onValueChange={v => v === 'none' ? handleBudgetSource('') : handleBudgetSource(v)}>
              <SelectTrigger><SelectValue placeholder="ללא" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">ללא</SelectItem>
                {budgetSources.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 border-t pt-3 mt-1">
            <p className="text-sm font-medium mb-2">אישור תקציב</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-2">
                <Checkbox checked={form.budget_is_approved || false} onCheckedChange={v => set('budget_is_approved', v)} id="budget-approved" />
                <Label htmlFor="budget-approved" className="cursor-pointer">תקציב אושר</Label>
              </div>
              <div>
                <Label>תאריך אישור</Label>
                <Input type="date" value={form.budget_approval_date || ''} onChange={e => set('budget_approval_date', e.target.value)} />
              </div>
              <div>
                <Label>גורם מאשר</Label>
                <Input value={form.budget_approver || ''} onChange={e => set('budget_approver', e.target.value)} />
              </div>
              <div>
                <Label>קובץ אישור תקציב</Label>
                <div className="flex items-center gap-2">
                  <input type="file" onChange={handleApprovalFile} className="hidden" id="budget-approval-file" />
                  <Button variant="outline" onClick={() => document.getElementById('budget-approval-file').click()} className="gap-2 w-full" disabled={uploading}>
                    {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    {form.budget_approval_file_url ? 'קובץ הועלה ✓' : 'העלאת קובץ'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
          <div className="col-span-2">
            <Label>הערות</Label>
            <Textarea value={form.notes || ''} onChange={e => set('notes', e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>ביטול</Button>
          <Button onClick={submit}>{initialData ? 'שמור' : 'צור פרויקט'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}