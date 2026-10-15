import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { BRANCH_STATUS_LABELS, positionTotalPct, employeePct, pctToHours, formatFte } from '@/lib/staffUtils';
import { canManageBranches } from '@/lib/permissions';
import BranchDialog from './BranchDialog';

export default function BranchesTab({ user, branches, employees, onBranchesChange }) {
  const [volunteers, setVolunteers] = useState([]);
  const [positions, setPositions] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const canManage = canManageBranches(user);

  useEffect(() => {
    Promise.all([
      base44.entities.Volunteer.list('-created_date', 500).catch(() => []),
      base44.entities.ApprovedPosition.list('-created_date', 500).catch(() => []),
    ]).then(([vols, pos]) => { setVolunteers(vols); setPositions(pos); });
  }, [branches]);

  const getStats = (branchId) => {
    const emps = employees.filter(e => e.primary_branch_id === branchId || (e.additional_branch_ids || []).includes(branchId));
    const vols = volunteers.filter(v => v.preferred_branch_id === branchId);
    const pos = positions.filter(p => p.branch_id === branchId && p.status === 'active');
    // במשרות מלאות (100% = 40 ש'). המאויש נספר לפי עובדות שזה הסניף הראשי
    // שלהן — עובדת שעובדת בכמה סניפים לא נספרת במלואה בכל אחד מהם
    const approvedPct = pos.reduce((s, p) => s + positionTotalPct(p), 0);
    const activeEmps = emps.filter(e => e.status === 'active').length;
    const filledPct = emps.filter(e => e.status === 'active' && e.primary_branch_id === branchId).reduce((s, e) => s + employeePct(e), 0);
    return { approvedPct, activeEmps, activeVols: vols.filter(v => v.status === 'active').length, filledPct, gapPct: approvedPct - filledPct };
  };

  const handleSave = async (data) => {
    try {
      if (editing) { await base44.entities.Branch.update(editing.id, data); toast.success('הסניף עודכן'); }
      else { await base44.entities.Branch.create(data); toast.success('הסניף נוסף'); }
      setEditing(null); onBranchesChange();
    } catch (e) { toast.error('שגיאה בשמירה'); }
  };

  const handleDelete = async (branch) => {
    if (!confirm(`למחוק את הסניף "${branch.name}"?`)) return;
    try { await base44.entities.Branch.delete(branch.id); toast.success('הסניף נמחק'); onBranchesChange(); }
    catch (e) { toast.error('שגיאה במחיקה'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">סניפים ({branches.length})</h3>
        {canManage && <Button onClick={() => { setEditing(null); setDialogOpen(true); }} className="gap-2"><Plus className="w-4 h-4" /> סניף חדש</Button>}
      </div>
      <div className="border border-border rounded-xl overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 sticky top-0">
            <tr className="border-b border-border">
              <th className="text-right p-3 font-medium">סניף</th>
              <th className="text-right p-3 font-medium hidden md:table-cell">כתובת</th>
              <th className="text-right p-3 font-medium hidden lg:table-cell">אחראית</th>
              <th className="text-center p-3 font-medium">תקנים</th>
              <th className="text-center p-3 font-medium">עובדות</th>
              <th className="text-center p-3 font-medium">מתנדבות</th>
              <th className="text-center p-3 font-medium hidden md:table-cell">שעות מאוישות</th>
              <th className="text-center p-3 font-medium">פער</th>
              <th className="text-center p-3 font-medium">סטטוס</th>
              {canManage && <th className="p-3"></th>}
            </tr>
          </thead>
          <tbody>
            {branches.map(branch => {
              const s = getStats(branch.id);
              return (
                <tr key={branch.id} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="p-3 font-medium">{branch.name}</td>
                  <td className="p-3 hidden md:table-cell text-muted-foreground">{branch.address || '-'}</td>
                  <td className="p-3 hidden lg:table-cell text-muted-foreground">{branch.manager_name || '-'}</td>
                  <td className="p-3 text-center">
                    {formatFte(s.approvedPct)}
                    <span className="block text-[11px] text-muted-foreground">{pctToHours(s.approvedPct)} ש'</span>
                  </td>
                  <td className="p-3 text-center">{s.activeEmps}</td>
                  <td className="p-3 text-center">{s.activeVols}</td>
                  <td className="p-3 text-center hidden md:table-cell">{pctToHours(s.filledPct)}</td>
                  <td className="p-3 text-center">
                    <span className={cn('text-xs px-2 py-0.5 rounded font-medium', s.gapPct > 0.5 ? 'bg-amber-100 text-amber-700' : s.gapPct < -0.5 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700')}>
                      {s.gapPct > 0.5 ? `חסר ${formatFte(s.gapPct)}` : s.gapPct < -0.5 ? `עודף ${formatFte(-s.gapPct)}` : 'מאוזן'}
                    </span>
                  </td>
                  <td className="p-3 text-center"><span className={cn('text-xs px-2 py-0.5 rounded', branch.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700')}>{BRANCH_STATUS_LABELS[branch.status] || branch.status}</span></td>
                  {canManage && (
                    <td className="p-3"><div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditing(branch); setDialogOpen(true); }}><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => handleDelete(branch)}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div></td>
                  )}
                </tr>
              );
            })}
            {branches.length === 0 && <tr><td colSpan={canManage ? 10 : 9} className="text-center py-12 text-muted-foreground">אין סניפים</td></tr>}
          </tbody>
        </table>
      </div>
      <BranchDialog open={dialogOpen} onOpenChange={setDialogOpen} initialData={editing} onSave={handleSave} />
    </div>
  );
}