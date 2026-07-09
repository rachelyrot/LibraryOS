import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { EMPLOYMENT_TYPE_LABELS, EMPLOYEE_STATUS_LABELS, VOLUNTEER_ACTIVITY_LABELS, VOLUNTEER_STATUS_LABELS, SHIFT_TYPE_LABELS, SCHEDULE_STATUS_LABELS, ATTENDANCE_STATUS_LABELS, fullName, getDayName, calcShiftHours, getWeekDates, formatDate } from '@/lib/staffUtils';

export default function ReportsTab({ user, branches }) {
  const [reportType, setReportType] = useState('employees_by_branch');
  const [employees, setEmployees] = useState([]);
  const [volunteers, setVolunteers] = useState([]);
  const [positions, setPositions] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [branchFilter, setBranchFilter] = useState('all');
  const [weekRef, setWeekRef] = useState(new Date().toISOString().split('T')[0]);
  const [attDate, setAttDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    Promise.all([
      base44.entities.Employee.list('-created_date', 500).catch(() => []),
      base44.entities.Volunteer.list('-created_date', 500).catch(() => []),
      base44.entities.ApprovedPosition.list('-created_date', 500).catch(() => []),
      base44.entities.Schedule.list('date', 500).catch(() => []),
    ]).then(([emps, vols, pos, sched]) => { setEmployees(emps); setVolunteers(vols); setPositions(pos); setSchedules(sched); });
  }, []);

  useEffect(() => {
    if (reportType === 'attendance') {
      base44.entities.Attendance.filter({ date: attDate }, '-created_date', 500).then(setAttendance).catch(() => []);
    }
  }, [attDate, reportType]);

  const weekDates = getWeekDates(weekRef);
  const weekSchedules = schedules.filter(s => weekDates.includes(s.date));

  const exportExcel = async (data, filename) => {
    try {
      const { utils, writeFile } = await import('xlsx');
      const ws = utils.json_to_sheet(data);
      const wb = utils.book_new();
      utils.book_append_sheet(wb, ws, 'דוח');
      writeFile(wb, `${filename}.xlsx`);
      toast.success('הדוח יוצא בהצלחה!');
    } catch (e) { toast.error('שגיאה בייצוא'); }
  };

  const report1Data = employees.filter(e => branchFilter === 'all' || e.primary_branch_id === branchFilter).map(e => ({
    'שם': fullName(e), 'תפקיד': e.position || '', 'טלפון': e.phone || '',
    'סוג העסקה': EMPLOYMENT_TYPE_LABELS[e.employment_type] || '',
    'היקף משרה': e.scope_percentage || '', 'שעות שבועיות': e.weekly_hours || '',
    'סטטוס': EMPLOYEE_STATUS_LABELS[e.status] || '', 'סניף ראשי': e.primary_branch_name || '',
  }));

  const report2Data = branches.filter(b => branchFilter === 'all' || b.id === branchFilter).map(b => {
    const bPos = positions.filter(p => p.branch_id === b.id && p.status === 'active');
    const approved = bPos.reduce((s, p) => s + (p.approved_count || 1), 0);
    const approvedHours = bPos.reduce((s, p) => s + (p.weekly_hours_approved || 0) * (p.approved_count || 1), 0);
    const filled = employees.filter(e => e.status === 'active' && e.primary_branch_id === b.id).length;
    const scheduledHours = weekSchedules.filter(s => s.branch_id === b.id && s.status !== 'cancelled').reduce((s, sch) => s + calcShiftHours(sch.start_time, sch.end_time), 0);
    return {
      'סניף': b.name, 'תקנים מאושרים': approved, 'שעות מאושרות': approvedHours,
      'מאוישים בפועל': filled, 'שעות משובצות': Math.round(scheduledHours),
      'פער תקנים': approved - filled, 'פער שעות': Math.round(approvedHours - scheduledHours),
    };
  });

  const report3Data = weekSchedules.filter(s => branchFilter === 'all' || s.branch_id === branchFilter).map(s => ({
    'תאריך': s.date, 'יום': s.day_of_week || getDayName(s.date), 'סניף': s.branch_name || '',
    'עובדת': s.person_name || '', 'שעת התחלה': s.start_time || '', 'שעת סיום': s.end_time || '',
    'סוג משמרת': SHIFT_TYPE_LABELS[s.shift_type] || '', 'סטטוס': SCHEDULE_STATUS_LABELS[s.status] || '',
  }));

  const report4Data = volunteers.map(v => ({
    'שם': fullName(v), 'טלפון': v.phone || '', 'סניף מועדף': v.preferred_branch_name || '',
    'ימים מועדפים': v.preferred_days || '', 'שעות מועדפות': v.preferred_hours || '',
    'תחום פעילות': VOLUNTEER_ACTIVITY_LABELS[v.activity_area] || '', 'סטטוס': VOLUNTEER_STATUS_LABELS[v.status] || '',
  }));

  const report5Data = attendance.filter(a => branchFilter === 'all' || a.branch_id === branchFilter).map(a => ({
    'תאריך': a.date, 'עובדת': a.employee_name || '', 'סניף': a.branch_name || '',
    'כניסה מתוכננת': a.planned_start || '', 'יציאה מתוכננת': a.planned_end || '',
    'כניסה בפועל': a.actual_start || '', 'יציאה בפועל': a.actual_end || '',
    'סטטוס': ATTENDANCE_STATUS_LABELS[a.status] || '', 'הערות': a.notes || '',
  }));

  const reports = {
    employees_by_branch: { title: 'דוח מצבת עובדים', data: report1Data },
    positions_vs_staffing: { title: 'דוח תקנים מול איוש', data: report2Data },
    weekly_schedule: { title: 'דוח סידור עבודה', data: report3Data },
    volunteers: { title: 'דוח מתנדבות', data: report4Data },
    attendance: { title: 'דוח נוכחות', data: report5Data },
  };
  const current = reports[reportType];

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">דוחות כוח אדם</h3>
      <div className="flex flex-wrap gap-2">
        <Select value={reportType} onValueChange={setReportType}>
          <SelectTrigger className="w-[240px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(reports).map(([k, r]) => <SelectItem key={k} value={k}>{r.title}</SelectItem>)}
          </SelectContent>
        </Select>
        {reportType !== 'volunteers' && (
          <Select value={branchFilter} onValueChange={setBranchFilter}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="סניף" /></SelectTrigger>
            <SelectContent><SelectItem value="all">כל הסניפים</SelectItem>{branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
          </Select>
        )}
        {reportType === 'weekly_schedule' && (
          <input type="date" value={weekRef} onChange={e => setWeekRef(e.target.value)} className="h-9 rounded-md border border-input px-3 text-sm" />
        )}
        {reportType === 'attendance' && (
          <input type="date" value={attDate} onChange={e => setAttDate(e.target.value)} className="h-9 rounded-md border border-input px-3 text-sm" />
        )}
        <Button onClick={() => exportExcel(current.data, current.title)} className="gap-2 mr-auto"><Download className="w-4 h-4" /> ייצוא לאקסל</Button>
      </div>
      <div className="border border-border rounded-xl overflow-auto max-h-[60vh]">
        {current.data.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground"><FileText className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>אין נתונים לתצוגה</p></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 sticky top-0">
              <tr className="border-b border-border">
                {Object.keys(current.data[0]).map(key => <th key={key} className="text-right p-3 font-medium whitespace-nowrap">{key}</th>)}
              </tr>
            </thead>
            <tbody>
              {current.data.map((row, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                  {Object.values(row).map((val, j) => <td key={j} className="p-3 whitespace-nowrap">{val ?? '-'}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-sm text-muted-foreground">{current.data.length} רשומות</p>
    </div>
  );
}