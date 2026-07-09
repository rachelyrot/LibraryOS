import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Plus, Pencil, Trash2, CheckCircle2, Circle } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import { MILESTONE_STATUS_LABELS, MILESTONE_STATUS_COLORS, formatDate, daysUntil } from '@/lib/projectUtils';
import { canCreateTasks } from '@/lib/permissions';
import MilestoneDialog from './MilestoneDialog';

export default function MilestonesTab({ project, user, milestones, domains, onLoad }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const canManage = canCreateTasks(user);

  const handleSave = async (data) => {
    try {
      if (editing) { await base44.entities.ProjectMilestone.update(editing.id, data); toast.success('אבן דרך עודכנה'); }
      else { await base44.entities.ProjectMilestone.create({ ...data, project_id: project.id, project_name: project.name }); toast.success('אבן דרך נוספה'); }
      setEditing(null); onLoad();
    } catch (e) { toast.error('שגיאה בשמירה'); }
  };

  const handleDelete = async (ms) => {
    if (!confirm('למחוק אבן דרך זו?')) return;
    try { await base44.entities.ProjectMilestone.delete(ms.id); toast.success('נמחק'); onLoad(); }
    catch (e) { toast.error('שגיאה במחיקה'); }
  };

  const toggleComplete = async (ms) => {
    try {
      const isCompleted = !ms.is_completed;
      await base44.entities.ProjectMilestone.update(ms.id, {
        is_completed: isCompleted,
        status: isCompleted ? 'completed' : 'not_started',
        completed_date: isCompleted ? new Date().toISOString().split('T')[0] : '',
        progress_percentage: isCompleted ? 100 : ms.progress_percentage
      });
      onLoad();
    } catch (e) { toast.error('שגיאה בעדכון'); }
  };

  const sorted = [...milestones].sort((a, b) => {
    if (a.is_completed !== b.is_completed) return a.is_completed ? 1 : -1;
    return (a.target_date || '9999') > (b.target_date || '9999') ? 1 : -1;
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">אבני דרך ({milestones.length})</h3>
        {canManage && <Button onClick={() => { setEditing(null); setDialogOpen(true); }} className="gap-2"><Plus className="w-4 h-4" /> אבן דרך חדשה</Button>}
      </div>

      <div className="space-y-3">
        {sorted.map(ms => {
          const dDay = daysUntil(ms.target_date);
          return (
            <div key={ms.id} className={cn('bg-card rounded-xl p-4 border border-border', ms.is_completed && 'opacity-60')}>
              <div className="flex items-start gap-3">
                <button onClick={() => canManage && toggleComplete(ms)} disabled={!canManage} className="mt-0.5">
                  {ms.is_completed ? <CheckCircle2 className="w-5 h-5 text-green-500" /> : <Circle className="w-5 h-5 text-muted-foreground" />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className={cn('font-medium', ms.is_completed && 'line-through')}>{ms.name}</h4>
                    <div className="flex items-center gap-2">
                      <span className={cn('text-xs px-2 py-0.5 rounded', MILESTONE_STATUS_COLORS[ms.status])}>{MILESTONE_STATUS_LABELS[ms.status]}</span>
                      {canManage && (
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditing(ms); setDialogOpen(true); }}><Pencil className="w-3.5 h-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => handleDelete(ms)}><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                      )}
                    </div>
                  </div>
                  {ms.description && <p className="text-sm text-muted-foreground mt-1">{ms.description}</p>}
                  <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
                    {ms.related_domain && <span>תחום: {ms.related_domain}</span>}
                    {ms.responsible && <span>אחראי: {ms.responsible}</span>}
                    <span>יעד: {formatDate(ms.target_date)}</span>
                    {!ms.is_completed && dDay !== null && dDay < 0 && <span className="text-red-600">{Math.abs(dDay)} ימים באיחור</span>}
                    {ms.completed_date && <span className="text-green-600">הושלם: {formatDate(ms.completed_date)}</span>}
                  </div>
                  {ms.progress_percentage > 0 && !ms.is_completed && (
                    <div className="mt-2 flex items-center gap-2">
                      <Progress value={ms.progress_percentage} className="h-1.5 flex-1" />
                      <span className="text-xs">{ms.progress_percentage}%</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {milestones.length === 0 && <div className="text-center py-12 text-muted-foreground">אין אבני דרך</div>}
      </div>

      <MilestoneDialog open={dialogOpen} onOpenChange={setDialogOpen} initialData={editing} domains={domains} onSave={handleSave} />
    </div>
  );
}