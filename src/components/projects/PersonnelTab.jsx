import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Plus, Pencil, Trash2, User, HeartHandshake, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import { cn } from '@/lib/utils';
import { canAssignPersonnel } from '@/lib/permissions';
import MemberDialog from './MemberDialog';

export default function PersonnelTab({ project, user, members, employees, volunteers, branches, onLoad }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const canManage = canAssignPersonnel(user);

  const handleSave = async (data) => {
    try {
      if (editing) { await base44.entities.ProjectMember.update(editing.id, data); toast.success('שיוך עודכן'); }
      else { await base44.entities.ProjectMember.create({ ...data, project_id: project.id, project_name: project.name }); toast.success('שיוך נוסף'); }
      setEditing(null); setDialogOpen(false); onLoad();
    } catch (e) { toast.error('שגיאה בשמירה'); }
  };

  const handleDelete = async (m) => {
    if (!confirm('להסיר שיוך זה?')) return;
    try { await base44.entities.ProjectMember.delete(m.id); toast.success('הוסר'); onLoad(); }
    catch (e) { toast.error('שגיאה במחיקה'); }
  };

  const totalPlanned = members.reduce((s, m) => s + (m.planned_hours || 0), 0);
  const totalActual = members.reduce((s, m) => s + (m.actual_hours || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">כוח אדם בפרויקט ({members.length})</h3>
          <p className="text-sm text-muted-foreground">שעות מתוכננות: {totalPlanned} | שעות בפועל: {totalActual}</p>
        </div>
        {canManage && <Button onClick={() => { setEditing(null); setDialogOpen(true); }} className="gap-2"><Plus className="w-4 h-4" /> שיוך חדש</Button>}
      </div>

      <div className="border border-border rounded-xl overflow-auto max-h-[55vh]">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 sticky top-0">
            <tr className="border-b border-border">
              <th className="text-right p-2 font-medium">סוג</th>
              <th className="text-right p-2 font-medium">שם</th>
              <th className="text-right p-2 font-medium">תפקיד בפרויקט</th>
              <th className="text-right p-2 font-medium hidden md:table-cell">סניף</th>
              <th className="text-center p-2 font-medium">שעות מתוכננות</th>
              <th className="text-center p-2 font-medium">שעות בפועל</th>
              {canManage && <th className="p-2"></th>}
            </tr>
          </thead>
          <tbody>
            {members.map(m => (
              <tr key={m.id} className="border-b border-border/50 hover:bg-muted/30">
                <td className="p-2">
                  <span className={cn('inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded', m.person_type === 'employee' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700')}>
                    {m.person_type === 'employee' ? <User className="w-3 h-3" /> : <HeartHandshake className="w-3 h-3" />}
                    {m.person_type === 'employee' ? 'עובדת' : 'מתנדבת'}
                  </span>
                </td>
                <td className="p-2 font-medium">{m.person_name}</td>
                <td className="p-2">{m.role_in_project || '-'}</td>
                <td className="p-2 hidden md:table-cell text-xs">{m.branch_name || '-'}</td>
                <td className="p-2 text-center">{m.planned_hours || 0}</td>
                <td className="p-2 text-center">{m.actual_hours || 0}</td>
                {canManage && (
                  <td className="p-2"><div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditing(m); setDialogOpen(true); }}><Pencil className="w-3.5 h-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => handleDelete(m)}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div></td>
                )}
              </tr>
            ))}
            {members.length === 0 && <tr><td colSpan={canManage ? 7 : 6} className="text-center py-12 text-muted-foreground">אין כוח אדם משויך</td></tr>}
          </tbody>
        </table>
      </div>

      <MemberDialog open={dialogOpen} onOpenChange={setDialogOpen} initialData={editing} employees={employees} volunteers={volunteers} branches={branches} onSave={handleSave} />
    </div>
  );
}