import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Pencil, Trash2, Target } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { GOAL_STATUS_LABELS, GOAL_STATUS_COLORS, formatDate, daysUntil } from '@/lib/projectUtils';
import { canCreateTasks } from '@/lib/permissions';
import GoalDialog from './GoalDialog';

export default function GoalsTab({ project, user, goals, onLoad }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const canManage = canCreateTasks(user);

  const handleSave = async (data) => {
    try {
      if (editing) { await base44.entities.ProjectGoal.update(editing.id, data); toast.success('יעד עודכן'); }
      else { await base44.entities.ProjectGoal.create({ ...data, project_id: project.id, project_name: project.name }); toast.success('יעד נוסף'); }
      setEditing(null); onLoad();
    } catch (e) { toast.error('שגיאה בשמירה'); }
  };

  const handleDelete = async (goal) => {
    if (!confirm('למחוק יעד זה?')) return;
    try { await base44.entities.ProjectGoal.delete(goal.id); toast.success('נמחק'); onLoad(); }
    catch (e) { toast.error('שגיאה במחיקה'); }
  };

  const updateValue = async (goal, field, value) => {
    try {
      const updates = { [field]: Number(value) };
      if (field === 'current_value' && goal.target_value > 0) {
        updates.progress_percentage = Math.min(100, Math.round((Number(value) / goal.target_value) * 100));
        if (updates.progress_percentage >= 100) updates.status = 'achieved';
        else if (updates.progress_percentage > 0) updates.status = 'in_progress';
      }
      await base44.entities.ProjectGoal.update(goal.id, updates);
      onLoad();
    } catch (e) { toast.error('שגיאה בעדכון'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">יעדים ומדדים ({goals.length})</h3>
        {canManage && <Button onClick={() => { setEditing(null); setDialogOpen(true); }} className="gap-2"><Plus className="w-4 h-4" /> יעד חדש</Button>}
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        {goals.map(g => {
          const dDay = daysUntil(g.target_date);
          return (
            <Card key={g.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <Target className="w-4 h-4 text-primary mt-0.5" />
                    <div>
                      <h4 className="font-medium">{g.name}</h4>
                      {g.description && <p className="text-xs text-muted-foreground">{g.description}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className={cn('text-xs px-2 py-0.5 rounded', GOAL_STATUS_COLORS[g.status])}>{GOAL_STATUS_LABELS[g.status]}</span>
                    {canManage && (
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditing(g); setDialogOpen(true); }}><Pencil className="w-3.5 h-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => handleDelete(g)}><Trash2 className="w-3.5 h-3.5" /></Button>
                      </div>
                    )}
                  </div>
                </div>
                {g.success_metric && <p className="text-sm mt-2 text-muted-foreground">מדד: {g.success_metric}</p>}
                <div className="grid grid-cols-3 gap-2 mt-3">
                  <div>
                    <label className="text-xs text-muted-foreground">יעד</label>
                    <p className="font-bold">{g.target_value} {g.unit || ''}</p>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">נוכחי</label>
                    {canManage ? (
                      <Input type="number" value={g.current_value || 0} onChange={e => updateValue(g, 'current_value', e.target.value)} className="h-7 text-sm" />
                    ) : (
                      <p className="font-bold">{g.current_value} {g.unit || ''}</p>
                    )}
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">תאריך יעד</label>
                    <p className={cn('text-sm', dDay !== null && dDay < 0 && g.status !== 'achieved' && 'text-red-600')}>{formatDate(g.target_date)}</p>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <Progress value={g.progress_percentage} className="h-2 flex-1" />
                  <span className="text-xs font-medium">{g.progress_percentage}%</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {goals.length === 0 && <div className="col-span-2 text-center py-12 text-muted-foreground">אין יעדים</div>}
      </div>

      <GoalDialog open={dialogOpen} onOpenChange={setDialogOpen} initialData={editing} onSave={handleSave} />
    </div>
  );
}