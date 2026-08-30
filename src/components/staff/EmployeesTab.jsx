import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Pencil, Trash2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { EMPLOYMENT_TYPE_LABELS, EMPLOYER_TYPE_LABELS, EMPLOYEE_STATUS_LABELS, EMPLOYEE_STATUS_COLORS, fullName } from '@/lib/staffUtils';
import { canManageEmployees, canDeleteEmployee } from '@/lib/permissions';
import EmployeeDialog from './EmployeeDialog';

export default function EmployeesTab({ user, branches, employees, onEmployeesChange }) {
  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const canManage = canManageEmployees(user);
  const canDelete = canDeleteEmployee(user);

  const filtered = employees.filter(e => {
    if (search && !fullName(e).includes(search) && !(e.position || '').includes(search)) return false;
    if (branchFilter !== 'all' && e.primary_branch_id !== branchFilter && !(e.additional_branch_ids || []).includes(branchFilter)) return false;
    if (statusFilter !== 'all' && e.status !== statusFilter) return false;
    return true;
  });

  // מציגים את הסיבה האמיתית מהשרת ולא רק "שגיאה": כשעמודה חסרה במסד (מיגרציה
  // שלא הורצה) הטוסט הגנרי הסתיר את זה לגמרי — השמירה נכשלה שוב ושוב, הרשימה
  // נשארה ריקה, ולא הייתה שום דרך להבין מהמסך שהסכמה והמסד לא מסונכרנים.
  const errorText = (err) => err?.message || err?.details || 'שגיאה לא ידועה';

  const handleSave = async (data) => {
    try {
      if (editing) { await base44.entities.Employee.update(editing.id, data); toast.success('העובדת עודכנה'); }
      else { await base44.entities.Employee.create(data); toast.success('העובדת נוספה'); }
      setEditing(null); onEmployeesChange();
    } catch (e) { toast.error(`שגיאה בשמירה: ${errorText(e)}`); }
  };

  const handleDelete = async (emp) => {
    if (!confirm(`למחוק את ${fullName(emp)}?`)) return;
    try { await base44.entities.Employee.delete(emp.id); toast.success('נמחקה'); onEmployeesChange(); }
    catch (e) { toast.error(`שגיאה במחיקה: ${errorText(e)}`); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-between items-center gap-2">
        <h3 className="text-lg font-semibold">עובדות ({filtered.length})</h3>
        {canManage && <Button onClick={() => { setEditing(null); setDialogOpen(true); }} className="gap-2"><Plus className="w-4 h-4" /> עובדת חדשה</Button>}
      </div>
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="חיפוש עובדת..." className="pr-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={branchFilter} onValueChange={setBranchFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="סניף" /></SelectTrigger>
          <SelectContent><SelectItem value="all">כל הסניפים</SelectItem>{branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="סטטוס" /></SelectTrigger>
          <SelectContent><SelectItem value="all">כל הסטטוסים</SelectItem>{Object.entries(EMPLOYEE_STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="border border-border rounded-xl overflow-auto max-h-[60vh]">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 sticky top-0">
            <tr className="border-b border-border">
              <th className="text-right p-3 font-medium">שם</th>
              <th className="text-right p-3 font-medium hidden md:table-cell">תפקיד</th>
              <th className="text-right p-3 font-medium hidden lg:table-cell">סניף ראשי</th>
              <th className="text-right p-3 font-medium hidden lg:table-cell">מעסיק</th>
              <th className="text-right p-3 font-medium hidden md:table-cell">סטטוס העסקה</th>
              <th className="text-center p-3 font-medium">היקף</th>
              <th className="text-center p-3 font-medium hidden md:table-cell">שעות/שבוע</th>
              <th className="text-center p-3 font-medium">סטטוס</th>
              {canManage && <th className="p-3"></th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map(emp => (
              <tr key={emp.id} className="border-b border-border/50 hover:bg-muted/30">
                <td className="p-3 font-medium">{fullName(emp)}</td>
                <td className="p-3 hidden md:table-cell text-muted-foreground">{emp.position || '-'}</td>
                <td className="p-3 hidden lg:table-cell text-muted-foreground">{emp.primary_branch_name || '-'}</td>
                <td className="p-3 hidden lg:table-cell text-muted-foreground">{EMPLOYER_TYPE_LABELS[emp.employer_type] || '-'}</td>
                <td className="p-3 hidden md:table-cell">{EMPLOYMENT_TYPE_LABELS[emp.employment_type] || '-'}</td>
                <td className="p-3 text-center">{emp.scope_percentage ? `${emp.scope_percentage}%` : '-'}</td>
                <td className="p-3 text-center hidden md:table-cell">{emp.weekly_hours || '-'}</td>
                <td className="p-3 text-center"><span className={cn('text-xs px-2 py-0.5 rounded', EMPLOYEE_STATUS_COLORS[emp.status] || 'bg-gray-100')}>{EMPLOYEE_STATUS_LABELS[emp.status] || emp.status}</span></td>
                {canManage && (
                  <td className="p-3"><div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditing(emp); setDialogOpen(true); }}><Pencil className="w-3.5 h-3.5" /></Button>
                    {canDelete && <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => handleDelete(emp)}><Trash2 className="w-3.5 h-3.5" /></Button>}
                  </div></td>
                )}
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={canManage ? 9 : 8} className="text-center py-12 text-muted-foreground">אין עובדות</td></tr>}
          </tbody>
        </table>
      </div>
      <EmployeeDialog open={dialogOpen} onOpenChange={setDialogOpen} initialData={editing} branches={branches} onSave={handleSave} />
    </div>
  );
}