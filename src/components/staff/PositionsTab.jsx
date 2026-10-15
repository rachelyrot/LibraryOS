import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { BRANCH_STATUS_LABELS, EMPLOYER_TYPE_LABELS, positionPct, positionTotalPct, positionTotalHours, employeePct, pctToHours, formatFte } from '@/lib/staffUtils';
import { canManagePositions } from '@/lib/permissions';
import PositionDialog from './PositionDialog';
import PositionsCategoryChart from './PositionsCategoryChart';

export default function PositionsTab({ user, branches, employees }) {
  const [positions, setPositions] = useState([]);
  const [branchFilter, setBranchFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const canManage = canManagePositions(user);

  const load = () => base44.entities.ApprovedPosition.list('-created_date', 500).then(setPositions).catch(() => []);
  useEffect(() => { load(); }, []);

  const filtered = positions.filter(p => branchFilter === 'all' || p.branch_id === branchFilter);

  const handleSave = async (data) => {
    try {
      if (editing) { await base44.entities.ApprovedPosition.update(editing.id, data); toast.success('התקן עודכן'); }
      else { await base44.entities.ApprovedPosition.create(data); toast.success('התקן נוסף'); }
      setEditing(null); load();
    } catch (e) { toast.error('שגיאה בשמירה'); }
  };

  const handleDelete = async (pos) => {
    if (!confirm(`למחוק את התקן "${pos.position_name}"?`)) return;
    try { await base44.entities.ApprovedPosition.delete(pos.id); toast.success('נמחק'); load(); }
    catch (e) { toast.error('שגיאה במחיקה'); }
  };

  // הכל במשרות מלאות (100% = 40 ש'): שני תקנים של 50% הם משרה אחת, ועובדת
  // אחת ב-100% ממלאת אותה — ולא "2 תקנים מול עובדת אחת"
  const branchStats = branches.map(b => {
    const bPos = positions.filter(p => p.branch_id === b.id && p.status === 'active');
    const approvedPct = bPos.reduce((s, p) => s + positionTotalPct(p), 0);
    const emps = employees.filter(e => e.status === 'active' && e.primary_branch_id === b.id);
    const filledPct = emps.reduce((s, e) => s + employeePct(e), 0);
    return { branch: b, approvedPct, filledPct, people: emps.length, gapPct: approvedPct - filledPct };
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">תקנים מאושרים ({filtered.length})</h3>
        {canManage && <Button onClick={() => { setEditing(null); setDialogOpen(true); }} className="gap-2"><Plus className="w-4 h-4" /> תקן חדש</Button>}
      </div>
      <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
        {branchStats.map(({ branch, approvedPct, filledPct, people, gapPct }) => (
          <div key={branch.id} className="bg-card rounded-xl p-4 border border-border">
            <p className="font-medium text-sm">{branch.name}</p>
            <div className="mt-2 space-y-1 text-xs text-muted-foreground">
              <p>תקן מאושר: <span className="font-bold text-foreground">{formatFte(approvedPct)}</span> · {pctToHours(approvedPct)} ש'</p>
              <p>מאויש: <span className="font-bold text-foreground">{formatFte(filledPct)}</span> · {pctToHours(filledPct)} ש' ({people} עובדות)</p>
              <p>פער: <span className={cn('font-bold', gapPct > 0.5 ? 'text-amber-600' : gapPct < -0.5 ? 'text-red-600' : 'text-green-600')}>
                {gapPct > 0.5 ? `חסר ${formatFte(gapPct)} (${pctToHours(gapPct)} ש')` : gapPct < -0.5 ? `עודף ${formatFte(-gapPct)} (${pctToHours(-gapPct)} ש')` : 'מאוזן'}
              </span></p>
            </div>
          </div>
        ))}
      </div>
      <PositionsCategoryChart positions={positions} />
      <Select value={branchFilter} onValueChange={setBranchFilter}>
        <SelectTrigger className="w-[180px]"><SelectValue placeholder="סניף" /></SelectTrigger>
        <SelectContent><SelectItem value="all">כל הסניפים</SelectItem>{branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
      </Select>
      <div className="border border-border rounded-xl overflow-auto max-h-[50vh]">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 sticky top-0">
            <tr className="border-b border-border">
              <th className="text-right p-3 font-medium">סניף</th>
              <th className="text-right p-3 font-medium">תפקיד</th>
              <th className="text-center p-3 font-medium">תקנים</th>
              <th className="text-center p-3 font-medium hidden md:table-cell">היקף לתקן</th>
              <th className="text-center p-3 font-medium">שעות/שבוע</th>
              <th className="text-center p-3 font-medium hidden lg:table-cell">תאריך אישור</th>
              <th className="text-right p-3 font-medium hidden lg:table-cell">קטגוריה</th>
              <th className="text-center p-3 font-medium">סטטוס</th>
              {canManage && <th className="p-3"></th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map(pos => (
              <tr key={pos.id} className="border-b border-border/50 hover:bg-muted/30">
                <td className="p-3">{pos.branch_name || '-'}</td>
                <td className="p-3 font-medium">{pos.position_name}</td>
                <td className="p-3 text-center">{pos.approved_count || 1}</td>
                <td className="p-3 text-center hidden md:table-cell">{positionPct(pos)}%</td>
                <td className="p-3 text-center">
                  {pctToHours(positionPct(pos))}
                  {(pos.approved_count || 1) > 1 && <span className="block text-[11px] text-muted-foreground">סה"כ {positionTotalHours(pos)}</span>}
                </td>
                <td className="p-3 text-center hidden lg:table-cell">{pos.approval_date || '-'}</td>
                <td className="p-3 hidden lg:table-cell text-muted-foreground">{(pos.category || []).map(c => EMPLOYER_TYPE_LABELS[c]).filter(Boolean).join(', ') || '-'}</td>
                <td className="p-3 text-center"><span className={cn('text-xs px-2 py-0.5 rounded', pos.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700')}>{BRANCH_STATUS_LABELS[pos.status] || pos.status}</span></td>
                {canManage && (
                  <td className="p-3"><div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditing(pos); setDialogOpen(true); }}><Pencil className="w-3.5 h-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => handleDelete(pos)}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div></td>
                )}
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={canManage ? 9 : 8} className="text-center py-12 text-muted-foreground">אין תקנים</td></tr>}
          </tbody>
        </table>
      </div>
      <PositionDialog open={dialogOpen} onOpenChange={setDialogOpen} initialData={editing} branches={branches} onSave={handleSave} />
    </div>
  );
}