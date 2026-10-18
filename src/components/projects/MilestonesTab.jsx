import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import { CheckCircle2 } from 'lucide-react';
import { MILESTONE_STATUS_LABELS, MILESTONE_STATUS_COLORS, taskMilestones, formatDate } from '@/lib/projectUtils';
import { canCreateTasks } from '@/lib/permissions';
import ProjectDataGrid from './grid/ProjectDataGrid';
import { textColumn, dateColumn, enumColumn, numberColumn, booleanColumn } from './grid/columnHelpers';
import { taskPickerColumn } from './grid/popoverCellEditors';
import { makeGridSaveHandler } from './grid/gridSave';

export default function MilestonesTab({ project, user, milestones, setMilestones, tasks, onLoad }) {
  const canManage = canCreateTasks(user);

  const handleDelete = async (ms) => {
    if (!confirm('למחוק אבן דרך זו?')) return;
    try { await base44.entities.ProjectMilestone.delete(ms.id); toast.success('נמחק'); onLoad(); }
    catch (e) { toast.error('שגיאה במחיקה'); }
  };

  const handleRowsChange = makeGridSaveHandler(base44.entities.ProjectMilestone, setMilestones, {
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
    numberColumn('progress_percentage', 'התקדמות %', { editable: canManage, width: 100, min: 0, max: 100 }),
    textColumn('responsible', 'אחראי', { editable: canManage, width: 120 }),
    textColumn('related_domain', 'תחום קשור', { editable: canManage, width: 120 }),
    taskPickerColumn('related_task_ids', 'משימות', tasks, { width: 80 }),
    textColumn('description', 'תיאור', { editable: canManage, width: 180 }),
    textColumn('notes', 'הערות', { editable: canManage, width: 160 }),
  ];

  // אבני הדרך נגזרות מהמשימות: כל משימה שהושלמה היא אבן דרך שהושגה
  const achieved = taskMilestones(tasks);

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div>
          <h3 className="text-lg font-semibold">אבני דרך ({achieved.length})</h3>
          <p className="text-xs text-muted-foreground">כל משימה שמגיעה ל"הושלם" מופיעה כאן לבד. כדי להוסיף אבן דרך — מסמנים משימה כ"הושלם" בלשונית המשימות.</p>
        </div>
        {achieved.length === 0 ? (
          <p className="text-sm text-muted-foreground border border-dashed border-border rounded-xl px-4 py-6 text-center">עדיין אין משימות שהושלמו</p>
        ) : (
          <div className="overflow-x-auto border border-border rounded-xl">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground bg-muted/40 border-b border-border">
                  <th className="text-right font-medium p-2.5">אבן דרך</th>
                  <th className="text-right font-medium p-2.5 whitespace-nowrap">תחום</th>
                  <th className="text-right font-medium p-2.5 whitespace-nowrap">אחראית</th>
                  <th className="text-right font-medium p-2.5 whitespace-nowrap">תאריך יעד</th>
                  <th className="text-right font-medium p-2.5 whitespace-nowrap">הושלם ב</th>
                </tr>
              </thead>
              <tbody>
                {achieved.map(m => (
                  <tr key={m.id} className="border-b border-border/40">
                    <td className="p-2.5">
                      <span className="inline-flex items-center gap-1.5 font-medium"><CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />{m.name}</span>
                      {m.notes && <p className="text-xs text-muted-foreground mt-0.5 mr-6">{m.notes}</p>}
                    </td>
                    <td className="p-2.5 text-xs">{m.related_domain || '-'}</td>
                    <td className="p-2.5 text-xs">{m.responsible || '-'}</td>
                    <td className="p-2.5 text-xs whitespace-nowrap">{formatDate(m.target_date) || '-'}</td>
                    <td className="p-2.5 text-xs whitespace-nowrap text-green-700 font-medium">{formatDate(m.completed_date) || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* אבני דרך שהוזנו ידנית לפני שהן נגזרו מהמשימות — נשארות כדי לא לאבד אותן */}
      {milestones.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-base font-semibold text-muted-foreground">אבני דרך שהוזנו ידנית ({milestones.length})</h3>
          <ProjectDataGrid
            rows={milestones}
            columns={columns}
            onRowsChange={handleRowsChange}
            readOnly={!canManage}
            onDeleteRow={handleDelete}
            emptyMessage="אין אבני דרך"
          />
        </div>
      )}
    </div>
  );
}
