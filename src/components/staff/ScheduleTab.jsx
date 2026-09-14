import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, ChevronRight, ChevronLeft, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { getWeekDates, formatDate, fullName, calcShiftHours } from '@/lib/staffUtils';
import { validateAll } from '@/lib/staffValidation';
import { canManageSchedule, scopeToBranches } from '@/lib/permissions';
import ScheduleDialog from './ScheduleDialog';
import ScheduleWarnings from './ScheduleWarnings';
import WeeklyScheduleTable from './WeeklyScheduleTable';

export default function ScheduleTab({ user, branches, employees }) {
  const [schedules, setSchedules] = useState([]);
  const [volunteers, setVolunteers] = useState([]);
  const [positions, setPositions] = useState([]);
  const [weekRef, setWeekRef] = useState(new Date().toISOString().split('T')[0]);
  const [viewMode, setViewMode] = useState('all');
  const [selectedBranch, setSelectedBranch] = useState('all');
  const [selectedPerson, setSelectedPerson] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const canManage = canManageSchedule(user);

  const load = () => {
    Promise.all([
      base44.entities.Volunteer.list('-created_date', 500).catch(() => []),
      base44.entities.ApprovedPosition.list('-created_date', 500).catch(() => []),
    ]).then(([vols, pos]) => { setVolunteers(vols); setPositions(pos); });
  };
  useEffect(() => { load(); }, []);

  const weekDates = getWeekDates(weekRef);
  const loadSchedules = () => {
    base44.entities.Schedule.filter({}, 'date', 500).then(all => {
      setSchedules(all.filter(s => weekDates.includes(s.date)));
    }).catch(() => {});
  };
  useEffect(() => { loadSchedules(); }, [weekRef]);

  // `employees` arrives already scoped from Staff.jsx; volunteers and schedules
  // are fetched here, so they get the same treatment.
  const scopedVolunteers = scopeToBranches(user, volunteers, 'preferred_branch_id');
  const allPeople = [...employees.map(e => ({ ...e, _type: 'employee' })), ...scopedVolunteers.map(v => ({ ...v, _type: 'volunteer' }))];

  const filteredSchedules = scopeToBranches(user, schedules, 'branch_id').filter(s => {
    if (viewMode === 'branch' && selectedBranch !== 'all' && s.branch_id !== selectedBranch) return false;
    if (viewMode === 'employee' && selectedPerson !== 'all' && s.person_id !== selectedPerson) return false;
    return true;
  });

  const warnings = validateAll(filteredSchedules, employees, scopedVolunteers, positions);

  const shiftWeek = (direction) => {
    const d = new Date(weekRef + 'T00:00:00');
    d.setDate(d.getDate() + direction * 7);
    setWeekRef(d.toISOString().split('T')[0]);
  };

  const handleSave = async (data) => {
    try {
      if (editing) { await base44.entities.Schedule.update(editing.id, data); toast.success('השיבוץ עודכן'); }
      else { await base44.entities.Schedule.create(data); toast.success('השיבוץ נוסף'); }
      setEditing(null); loadSchedules();
    } catch (e) { toast.error('שגיאה בשמירה'); }
  };

  const handleDelete = async (shift) => {
    if (!confirm(`למחוק את השיבוץ של ${shift.person_name}?`)) return;
    try { await base44.entities.Schedule.delete(shift.id); toast.success('נמחק'); loadSchedules(); }
    catch (e) { toast.error('שגיאה במחיקה'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-between items-center gap-2">
        <h3 className="text-lg font-semibold">מערכת שעות</h3>
        {canManage && <Button onClick={() => { setEditing(null); setDialogOpen(true); }} className="gap-2"><Plus className="w-4 h-4" /> שיבוץ חדש</Button>}
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={() => shiftWeek(-1)}><ChevronRight className="w-4 h-4" /></Button>
        <div className="flex-1 text-center font-medium">
          <Calendar className="w-4 h-4 inline ml-1" />
          {formatDate(weekDates[0])} - {formatDate(weekDates[5])}
        </div>
        <Button variant="outline" size="icon" onClick={() => shiftWeek(1)}><ChevronLeft className="w-4 h-4" /></Button>
        <Button variant="outline" size="sm" onClick={() => setWeekRef(new Date().toISOString().split('T')[0])}>השבוע</Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Select value={viewMode} onValueChange={setViewMode}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">כל השיבוצים</SelectItem>
            <SelectItem value="branch">לפי סניף</SelectItem>
            <SelectItem value="employee">לפי עובדת</SelectItem>
          </SelectContent>
        </Select>
        {viewMode === 'branch' && (
          <Select value={selectedBranch} onValueChange={setSelectedBranch}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="סניף" /></SelectTrigger>
            <SelectContent><SelectItem value="all">כל הסניפים</SelectItem>{branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
          </Select>
        )}
        {viewMode === 'employee' && (
          <Select value={selectedPerson} onValueChange={setSelectedPerson}>
            <SelectTrigger className="w-[220px]"><SelectValue placeholder="עובדת/מתנדבת" /></SelectTrigger>
            <SelectContent><SelectItem value="all">כולן</SelectItem>{allPeople.map(p => <SelectItem key={p.id} value={p.id}>{fullName(p)} ({p._type === 'volunteer' ? 'מתנדבת' : 'עובדת'})</SelectItem>)}</SelectContent>
          </Select>
        )}
      </div>

      {warnings.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">התראות ({warnings.length})</p>
          <ScheduleWarnings warnings={warnings} />
        </div>
      )}

      <WeeklyScheduleTable
        schedules={filteredSchedules}
        weekDates={weekDates}
        onEditShift={(shift) => { setEditing(shift); setDialogOpen(true); }}
        onDeleteShift={handleDelete}
        canManage={canManage}
      />

      <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
        <span>סך שיבוצים: {filteredSchedules.filter(s => s.status !== 'cancelled').length}</span>
        <span>סך שעות: {filteredSchedules.filter(s => s.status !== 'cancelled').reduce((sum, s) => sum + calcShiftHours(s.start_time, s.end_time), 0)}</span>
        <span>ממתינים לאישור: {filteredSchedules.filter(s => s.status === 'planned').length}</span>
      </div>

      <ScheduleDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initialData={editing}
        branches={branches}
        employees={employees}
        volunteers={volunteers}
        onSave={handleSave}
      />
    </div>
  );
}