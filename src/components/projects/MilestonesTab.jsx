import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import { MILESTONE_STATUS_LABELS, MILESTONE_STATUS_COLORS } from '@/lib/projectUtils';
import { canCreateTasks } from '@/lib/permissions';
import ProjectDataGrid from './grid/ProjectDataGrid';
import { textColumn, dateColumn, enumColumn, numberColumn, booleanColumn } from './grid/columnHelpers';
import { taskPickerColumn } from './grid/popoverCellEditors';
import { makeGridSaveHandler } from './grid/gridSave';

export default function MilestonesTab({ project, user, milestones, tasks, onLoad }) {
  const canManage = canCreateTasks(user);

  const handleAdd = async () => {
    try {
      await base44.entities.ProjectMilestone.create({
        project_id: project.id, project_name: project.name, name: 'אבן דרך חדשה', status: 'not_started',
      });
      onLoad();
    } catch (e) { toast.error('שגיאה בהוספה'); }
  };

  const handleDelete = async (ms) => {
    if (!confirm('למחוק אבן דרך זו?')) return;
    try { await base44.entities.ProjectMilestone.delete(ms.id); toast.success('נמחק'); onLoad(); }
    catch (e) { toast.error('שגיאה במחיקה'); }
  };

  const handleRowsChange = makeGridSaveHandler(base44.entities.ProjectMilestone, {
    computeExtra: {
      // Mirrors the old toggleComplete() logic: flipping is_completed also drives
      // status/completed_date/progress_percentage together.
      is_completed: (row) => ({
        status: row.status,
        completed_date: row.completed_date,
        progress_percentage: row.progress_percentage,
      }),
    },
    onError: onLoad,
  });

  const columns = [
    textColumn('name', 'שם אבן דרך', { editable: canManage, width: 180 }),
    booleanColumn('is_completed', 'הושלם', {
      editable: canManage,
      width: 80,
      onToggle: (row, checked) => ({
        ...row,
        is_completed: checked,
        status: checked ? 'completed' : 'not_started',
        completed_date: checked ? new Date().toISOString().split('T')[0] : null,
        progress_percentage: checked ? 100 : row.progress_percentage,
      }),
    }),
    enumColumn('status', 'סטטוס', MILESTONE_STATUS_LABELS, MILESTONE_STATUS_COLORS, { editable: canManage, width: 120 }),
    dateColumn('target_date', 'תאריך יעד', { editable: canManage, width: 110 }),
    dateColumn('completed_date', 'תאריך השלמה', { editable: false, width: 110 }),
    numberColumn('progress_percentage', 'התקדמות %', { editable: canManage, width: 100 }),
    textColumn('responsible', 'אחראי', { editable: canManage, width: 120 }),
    textColumn('related_domain', 'תחום קשור', { editable: canManage, width: 120 }),
    taskPickerColumn('related_task_ids', 'משימות', tasks, { width: 80 }),
    textColumn('description', 'תיאור', { editable: canManage, width: 180 }),
    textColumn('notes', 'הערות', { editable: canManage, width: 160 }),
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">אבני דרך ({milestones.length})</h3>
      </div>

      <ProjectDataGrid
        rows={milestones}
        columns={columns}
        onRowsChange={handleRowsChange}
        readOnly={!canManage}
        onAddRow={handleAdd}
        addLabel="אבן דרך חדשה"
        onDeleteRow={handleDelete}
        emptyMessage="אין אבני דרך"
      />
    </div>
  );
}
