import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { ATTENDANCE_STATUS_LABELS, ATTENDANCE_STATUS_COLORS, formatDate, fullName } from '@/lib/staffUtils';
import { canManageSchedule } from '@/lib/permissions';
import AttendanceDialog from './AttendanceDialog';

export default function AttendanceTab({ user, branches }) {
  const [records, setRecords] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [branchFilter, setBranchFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const canManage = canManageSchedule(user);

  const load = () => {
    base44.entities.Employee.list('-created_date', 500).then(setEmployees).catch(() => []);
    base44.entities.Schedule.filter({}, 'date', 500).catch(() => []);
    base44.entities.Attendance.filter({ date: selectedDate }, '-created_date', 500).then(setRecords).catch(() => []);
  };
  useEffect(() => { load(); }, [selectedDate]);

  const filtered = records.filter(r => branchFilter === 'all' || r.branch_id === branchFilter);

  const handleSave = async (data) => {
    try {
      if (editing) { await base44.entities.Attendance.update(editing.id, data); toast.success('נוכחות עודכנה'); }
      else { await base44.entities.Attendance.create(data); toast.success('נוכחות נרשמה'); }
      setEditing(null); setDialogOpen(false); load();
    } catch (e) { toast.error('שגיאה בשמירה'); }
  };

  const handleDelete = async (rec) => {
    if (!confirm('למחוק רישום זה?')) return;
    try { await base44.entities.Attendance.delete(rec.id); toast.success('נמחק'); load(); }
    catch (e) { toast.error('שגיאה במחיקה'); }
  };

  const stats = {
    present: records.filter(r => r.status === 'present').length,
    late: records.filter(r => r.status === 'late').length,
    absent: records.filter(r => r.status === 'absent').length,
    vacation: records.filter(r => r.status === 'vacation').length,
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-between items-center gap-2">
        <h3 className="text-lg font-semibold">נוכחות - {formatDate(selectedDate)}</h3>
        {canManage && <Button onClick={() => { setEditing(null); setDialogOpen(true); }} className="gap-2"><Plus className="w-4 h-4" /> רישום נוכחות</Button>}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-card rounded-xl p-3 border border-border text-center"><p className="text-2xl font-bold text-green-600">{stats.present}</p><p className="text-xs text-muted-foreground">נכחה</p></div>
        <div className="bg-card rounded-xl p-3 border border-border text-center"><p className="text-2xl font-bold text-amber-600">{stats.late}</p><p className="text-xs text-muted-foreground">איחור</p></div>
        <div className="bg-card rounded-xl p-3 border border-border text-center"><p className="text-2xl font-bold text-red-600">{stats.absent}</p><p className="text-xs text-muted-foreground">חיסור</p></div>
        <div className="bg-card rounded-xl p-3 border border-border text-center"><p className="text-2xl font-bold text-blue-600">{stats.vacation}</p><p className="text-xs text-muted-foreground">חופשה</p></div>
      </div>

      <div className="flex flex-wrap gap-2">
        <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="h-9 rounded-md border border-input px-3 text-sm" />
        <Select value={branchFilter} onValueChange={setBranchFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="סניף" /></SelectTrigger>
          <SelectContent><SelectItem value="all">כל הסניפים</SelectItem>{branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <div className="border border-border rounded-xl overflow-auto max-h-[55vh]">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 sticky top-0">
            <tr className="border-b border-border">
              <th className="text-right p-3 font-medium">עובדת</th>
              <th className="text-right p-3 font-medium hidden md:table-cell">סניף</th>
              <th className="text-center p-3 font-medium hidden md:table-cell">מתוכנן</th>
              <th className="text-center p-3 font-medium hidden md:table-cell">בפועל</th>
              <th className="text-center p-3 font-medium">סטטוס</th>
              {canManage && <th className="p-3"></th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.id} className="border-b border-border/50 hover:bg-muted/30">
                <td className="p-3 font-medium">{r.employee_name || fullName(employees.find(e => e.id === r.employee_id)) || '-'}</td>
                <td className="p-3 hidden md:table-cell text-muted-foreground">{r.branch_name || '-'}</td>
                <td className="p-3 text-center hidden md:table-cell text-xs">{r.planned_start || '-'} - {r.planned_end || '-'}</td>
                <td className="p-3 text-center hidden md:table-cell text-xs">{r.actual_start || '-'} - {r.actual_end || '-'}</td>
                <td className="p-3 text-center"><span className={cn('text-xs px-2 py-0.5 rounded', ATTENDANCE_STATUS_COLORS[r.status])}>{ATTENDANCE_STATUS_LABELS[r.status]}</span></td>
                {canManage && (
                  <td className="p-3"><div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditing(r); setDialogOpen(true); }}><Pencil className="w-3.5 h-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => handleDelete(r)}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div></td>
                )}
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={canManage ? 6 : 5} className="text-center py-12 text-muted-foreground">אין רישומי נוכחות לתאריך זה</td></tr>}
          </tbody>
        </table>
      </div>

      <AttendanceDialog open={dialogOpen} onOpenChange={setDialogOpen} initialData={editing} employees={employees} branches={branches} onSave={handleSave} />
    </div>
  );
}