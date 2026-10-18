import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, Filter } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import { TASK_STATUS_LABELS, TASK_STATUS_COLORS, PRIORITY_LABELS, PRIORITY_COLORS } from '@/lib/projectUtils';
import { canCreateTasks, canUpdateTaskStatus } from '@/lib/permissions';
import ImportTasksDialog from './ImportTasksDialog';
import ProjectDataGrid from './grid/ProjectDataGrid';
import { textColumn, dateColumn, enumColumn, numberColumn, fkPickerColumn } from './grid/columnHelpers';
import { fileUrlsColumn } from './grid/popoverCellEditors';
import { makeGridSaveHandler } from './grid/gridSave';

export default function TasksTab({ project, user, tasks, setTasks, onLoad, projects, domains }) {
  const [importOpen, setImportOpen] = useState(false);
  const [filters, setFilters] = useState({ domain: 'all', sub_domain: 'all', status: 'all', priority: 'all', search: '' });

  const canCreate = canCreateTasks(user);
  const canUpdate = canUpdateTaskStatus(user);

  const domainNames = domains?.filter(d => !d.parent_domain_id).map(d => d.name) || [];
  const subDomainNames = domains?.filter(d => d.parent_domain_id).map(d => d.name) || [];
  const availableSubDomains = filters.domain !== 'all' ? subDomainNames : [...new Set(tasks.map(t => t.sub_domain).filter(Boolean))];

  const filtered = tasks.filter(t => {
    if (filters.domain !== 'all' && t.domain !== filters.domain) return false;
    if (filters.sub_domain !== 'all' && t.sub_domain !== filters.sub_domain) return false;
    if (filters.status !== 'all' && t.status !== filters.status) return false;
    if (filters.priority !== 'all' && t.priority !== filters.priority) return false;
    if (filters.search && !t.task_description?.includes(filters.search) && !t.assignee?.includes(filters.search) && !t.contact_name?.includes(filters.search)) return false;
    return true;
  });

  const handleAdd = async () => {
    try {
      await base44.entities.ProjectTask.create({
        project_id: project.id, project_name: project.name, task_description: 'משימה חדשה', status: 'not_started', priority: 'medium',
      });
      onLoad();
    } catch (e) { toast.error('שגיאה בהוספה'); }
  };

  const handleDelete = async (task) => {
    if (!confirm('למחוק משימה זו?')) return;
    try { await base44.entities.ProjectTask.delete(task.id); toast.success('נמחק'); onLoad(); }
    catch (e) { toast.error('שגיאה במחיקה'); }
  };

  const handleRowsChange = makeGridSaveHandler(base44.entities.ProjectTask, setTasks, {
    pairedFields: { depends_on_task_id: 'depends_on_task_name' },
    onError: onLoad,
  });

  const otherTasks = tasks.filter((t) => t.id !== undefined);

  const columns = [
    textColumn('task_description', 'משימה', { editable: canCreate, width: 220 }),
    enumColumn('status', 'סטטוס', TASK_STATUS_LABELS, TASK_STATUS_COLORS, { editable: canUpdate, width: 140 }),
    enumColumn('priority', 'עדיפות', PRIORITY_LABELS, PRIORITY_COLORS, { editable: canCreate, width: 100 }),
    textColumn('domain', 'תחום', { editable: canCreate, width: 120 }),
    textColumn('sub_domain', 'תת-תחום', { editable: canCreate, width: 120 }),
    textColumn('assignee', 'אחראית', { editable: canCreate, width: 120 }),
    textColumn('partners', 'שותפים', { editable: canCreate, width: 120 }),
    textColumn('executing_parties', 'גורמים לביצוע', { editable: canCreate, width: 150 }),
    textColumn('contact_name', 'איש קשר', { editable: canCreate, width: 120 }),
    textColumn('contact_role', 'תפקיד איש קשר', { editable: canCreate, width: 120 }),
    textColumn('contact_phone', 'טלפון', { editable: canCreate, width: 110 }),
    textColumn('contact_email', 'מייל', { editable: canCreate, width: 150 }),
    dateColumn('start_date', 'תאריך התחלה', { editable: canCreate, width: 110 }),
    dateColumn('due_date', 'תאריך יעד', { editable: canCreate, width: 110 }),
    textColumn('estimated_duration', 'משך משוער', { editable: canCreate, width: 100 }),
    numberColumn('progress_percentage', 'התקדמות %', { editable: canCreate, width: 100, min: 0, max: 100 }),
    fkPickerColumn('depends_on_task_id', 'depends_on_task_name', 'תלוי במשימה', otherTasks, (t) => t.task_description, { editable: canCreate, width: 150 }),
    fileUrlsColumn('file_urls', 'קבצים', { width: 70 }),
    textColumn('notes', 'פירוט', { editable: canCreate, width: 200 }),
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <h3 className="text-lg font-semibold">משימות ({filtered.length})</h3>
        <div className="flex gap-2">
          {canCreate && <Button variant="outline" onClick={() => setImportOpen(true)} className="gap-2"><Upload className="w-4 h-4" /> ייבוא מאקסל</Button>}
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
        <Select value={filters.status} onValueChange={v => setFilters(f => ({ ...f, status: v }))}>
          <SelectTrigger className="w-36"><SelectValue placeholder="סטטוס" /></SelectTrigger>
          <SelectContent><SelectItem value="all">כל הסטטוסים</SelectItem>{Object.entries(TASK_STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={filters.priority} onValueChange={v => setFilters(f => ({ ...f, priority: v }))}>
          <SelectTrigger className="w-32"><SelectValue placeholder="עדיפות" /></SelectTrigger>
          <SelectContent><SelectItem value="all">כל העדיפויות</SelectItem>{Object.entries(PRIORITY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <ProjectDataGrid
        rows={filtered}
        columns={columns}
        onRowsChange={handleRowsChange}
        readOnly={!canCreate}
        onAddRow={canCreate ? handleAdd : undefined}
        addLabel="משימה חדשה"
        onDeleteRow={canCreate ? handleDelete : undefined}
        emptyMessage="אין משימות"
      />

      <ImportTasksDialog open={importOpen} onOpenChange={setImportOpen} projects={projects || [project]} defaultProjectId={project.id} onImported={onLoad} />
    </div>
  );
}
