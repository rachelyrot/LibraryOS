import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Pencil, Trash2, Upload, Filter } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import { cn } from '@/lib/utils';
import { TASK_STATUS_LABELS, TASK_STATUS_COLORS, PRIORITY_LABELS, PRIORITY_COLORS, formatDate, isOverdue, daysUntil } from '@/lib/projectUtils';
import { canCreateTasks, canUpdateTaskStatus } from '@/lib/permissions';
import TaskDialog from './TaskDialog';
import ImportTasksDialog from './ImportTasksDialog';

export default function TasksTab({ project, user, tasks, onLoad, projects, domains }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filters, setFilters] = useState({ domain: 'all', sub_domain: 'all', status: 'all', priority: 'all', phase: 'all', search: '' });

  const canCreate = canCreateTasks(user);
  const canUpdate = canUpdateTaskStatus(user);

  const phases = [...new Set(tasks.map(t => t.phase).filter(Boolean))];
  const domainNames = domains?.filter(d => !d.parent_domain_id).map(d => d.name) || [];
  const subDomainNames = domains?.filter(d => d.parent_domain_id).map(d => d.name) || [];
  const availableSubDomains = filters.domain !== 'all' ? subDomainNames : [...new Set(tasks.map(t => t.sub_domain).filter(Boolean))];

  const filtered = tasks.filter(t => {
    if (filters.domain !== 'all' && t.domain !== filters.domain) return false;
    if (filters.sub_domain !== 'all' && t.sub_domain !== filters.sub_domain) return false;
    if (filters.status !== 'all' && t.status !== filters.status) return false;
    if (filters.priority !== 'all' && t.priority !== filters.priority) return false;
    if (filters.phase !== 'all' && t.phase !== filters.phase) return false;
    if (filters.search && !t.task_description?.includes(filters.search) && !t.assignee?.includes(filters.search) && !t.contact_name?.includes(filters.search)) return false;
    return true;
  });

  const handleSave = async (data) => {
    try {
      if (editing) {
        await base44.entities.ProjectTask.update(editing.id, data);
        toast.success('משימה עודכנה');
      } else {
        await base44.entities.ProjectTask.create({ ...data, project_id: project.id, project_name: project.name });
        toast.success('משימה נוספה');
      }
      setEditing(null); setDialogOpen(false); onLoad();
    } catch (e) { toast.error('שגיאה בשמירה'); }
  };

  const handleDelete = async (task) => {
    if (!confirm('למחוק משימה זו?')) return;
    try { await base44.entities.ProjectTask.delete(task.id); toast.success('נמחק'); onLoad(); }
    catch (e) { toast.error('שגיאה במחיקה'); }
  };

  const quickStatus = async (task, status) => {
    try {
      const updates = { status };
      if (status === 'completed') updates.progress_percentage = 100;
      await base44.entities.ProjectTask.update(task.id, updates);
      onLoad();
    } catch (e) { toast.error('שגיאה בעדכון'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <h3 className="text-lg font-semibold">משימות ({filtered.length})</h3>
        <div className="flex gap-2">
          {canCreate && <Button variant="outline" onClick={() => setImportOpen(true)} className="gap-2"><Upload className="w-4 h-4" /> ייבוא מאקסל</Button>}
          {canCreate && <Button onClick={() => { setEditing(null); setDialogOpen(true); }} className="gap-2"><Plus className="w-4 h-4" /> משימה חדשה</Button>}
        </div>
      </div>

      <div className="flex gap-2 flex-wrap items-center">
        <div className="flex items-center gap-1 text-sm text-muted-foreground"><Filter className="w-4 h-4" /> סינון:</div>
        <Input placeholder="חיפוש..." value={filters.search} onChange={e => setFilters(f => ({ ...f, search: e.target.value }))} className="w-40" />
        <Select value={filters.domain} onValueChange={v => setFilters(f => ({ ...f, domain: v, sub_domain: 'all' }))}>
          <SelectTrigger className="w-36"><SelectValue placeholder="תחום" /></SelectTrigger>
          <SelectContent><SelectItem value="all">כל התחומים</SelectItem>{domainNames.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={filters.sub_domain} onValueChange={v => setFilters(f => ({ ...f, sub_domain: v }))}>
          <SelectTrigger className="w-32"><SelectValue placeholder="תת-תחום" /></SelectTrigger>
          <SelectContent><SelectItem value="all">כל תתי-התחומים</SelectItem>{availableSubDomains.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={filters.phase} onValueChange={v => setFilters(f => ({ ...f, phase: v }))}>
          <SelectTrigger className="w-32"><SelectValue placeholder="שלב" /></SelectTrigger>
          <SelectContent><SelectItem value="all">כל השלבים</SelectItem>{phases.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={filters.status} onValueChange={v => setFilters(f => ({ ...f, status: v }))}>
          <SelectTrigger className="w-36"><SelectValue placeholder="סטטוס" /></SelectTrigger>
          <SelectContent><SelectItem value="all">כל הסטטוסים</SelectItem>{Object.entries(TASK_STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={filters.priority} onValueChange={v => setFilters(f => ({ ...f, priority: v }))}>
          <SelectTrigger className="w-32"><SelectValue placeholder="עדיפות" /></SelectTrigger>
          <SelectContent><SelectItem value="all">כל העדיפויות</SelectItem>{Object.entries(PRIORITY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <div className="border border-border rounded-xl overflow-auto max-h-[55vh]">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 sticky top-0">
            <tr className="border-b border-border">
              <th className="text-right p-2 font-medium">תחום</th>
              <th className="text-right p-2 font-medium hidden md:table-cell">תת-תחום</th>
              <th className="text-right p-2 font-medium">משימה</th>
              <th className="text-right p-2 font-medium hidden md:table-cell">אחראית</th>
              <th className="text-right p-2 font-medium hidden lg:table-cell">גורמים לביצוע</th>
              <th className="text-center p-2 font-medium hidden lg:table-cell">יעד</th>
              <th className="text-center p-2 font-medium">סטטוס</th>
              <th className="text-center p-2 font-medium hidden md:table-cell">התקדמות</th>
              {canCreate && <th className="p-2"></th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map(t => {
              const overdue = isOverdue(t.due_date, t.status);
              const dDay = daysUntil(t.due_date);
              return (
                <tr key={t.id} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="p-2 text-xs">{t.domain || '-'}</td>
                  <td className="p-2 text-xs hidden md:table-cell text-muted-foreground">{t.sub_domain || '-'}</td>
                  <td className="p-2">
                    <p className="font-medium truncate max-w-xs">{t.task_description}</p>
                    {t.contact_name && <p className="text-xs text-muted-foreground">קשר: {t.contact_name}{t.contact_phone && ` • ${t.contact_phone}`}</p>}
                  </td>
                  <td className="p-2 hidden md:table-cell text-xs">{t.assignee || '-'}</td>
                  <td className="p-2 hidden lg:table-cell text-xs text-muted-foreground">{t.executing_parties || '-'}</td>
                  <td className="p-2 text-center hidden lg:table-cell text-xs">
                    {t.due_date ? <span className={cn(overdue && 'text-red-600 font-medium')}>{formatDate(t.due_date)}{overdue && ` (${Math.abs(dDay)}י)`}</span> : '-'}
                  </td>
                  <td className="p-2 text-center">
                    {canUpdate ? (
                      <Select value={t.status} onValueChange={v => quickStatus(t, v)}>
                        <SelectTrigger className="h-7 text-xs w-36"><span className={cn('text-xs px-1.5 py-0.5 rounded', TASK_STATUS_COLORS[t.status])}>{TASK_STATUS_LABELS[t.status]}</span></SelectTrigger>
                        <SelectContent>{Object.entries(TASK_STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                      </Select>
                    ) : (
                      <span className={cn('text-xs px-2 py-0.5 rounded', TASK_STATUS_COLORS[t.status])}>{TASK_STATUS_LABELS[t.status]}</span>
                    )}
                  </td>
                  <td className="p-2 text-center hidden md:table-cell">
                    <div className="flex items-center gap-1">
                      <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden"><div className="h-full bg-primary rounded-full" style={{ width: `${t.progress_percentage || 0}%` }} /></div>
                      <span className="text-xs">{t.progress_percentage || 0}%</span>
                    </div>
                  </td>
                  {canCreate && (
                    <td className="p-2"><div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditing(t); setDialogOpen(true); }}><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => handleDelete(t)}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div></td>
                  )}
                </tr>
              );
            })}
            {filtered.length === 0 && <tr><td colSpan={canCreate ? 9 : 8} className="text-center py-12 text-muted-foreground">אין משימות</td></tr>}
          </tbody>
        </table>
      </div>

      <TaskDialog open={dialogOpen} onOpenChange={setDialogOpen} initialData={editing} projectTasks={tasks} domains={domains} onSave={handleSave} />
      <ImportTasksDialog open={importOpen} onOpenChange={setImportOpen} projects={projects || [project]} defaultProjectId={project.id} onImported={onLoad} />
    </div>
  );
}