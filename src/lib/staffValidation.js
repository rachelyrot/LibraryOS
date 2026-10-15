import { calcShiftHours, employeeHours, positionTotalHours } from './staffUtils';

function timeOverlap(start1, end1, start2, end2) {
  return start1 < end2 && start2 < end1;
}

// 1. עובדת שובצה באותו זמן בשני סניפים שונים
export function findDoubleBooking(schedules) {
  const warnings = [];
  const active = schedules.filter(s => s.status !== 'cancelled');
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i];
      const b = active[j];
      if (a.person_id && a.person_id === b.person_id && a.date === b.date && a.branch_id !== b.branch_id) {
        if (timeOverlap(a.start_time, a.end_time, b.start_time, b.end_time)) {
          warnings.push({
            type: 'double_booking',
            severity: 'error',
            message: `${a.person_name} משובצת באותו זמן בשני סניפים (${a.branch_name}, ${b.branch_name}) בתאריך ${a.date}`,
          });
        }
      }
    }
  }
  return warnings;
}

// 2. עובדת שובצה מעבר לשעות השבועיות שלה
export function findOverScheduled(schedules, employees) {
  const warnings = [];
  const empMap = new Map(employees.map(e => [e.id, e]));
  const hoursByPerson = new Map();
  schedules.filter(s => s.status !== 'cancelled' && s.person_type === 'employee').forEach(s => {
    if (!s.person_id) return;
    const hours = calcShiftHours(s.start_time, s.end_time);
    hoursByPerson.set(s.person_id, (hoursByPerson.get(s.person_id) || 0) + hours);
  });
  hoursByPerson.forEach((hours, personId) => {
    const emp = empMap.get(personId);
    // השעות של העובדת נגזרות מאחוז המשרה (100% = 40 ש')
    const allowed = emp ? employeeHours(emp) : 0;
    if (emp && allowed && hours > allowed) {
      warnings.push({
        type: 'over_scheduled',
        severity: 'warning',
        message: `${emp.first_name} ${emp.last_name} שובצה ${hours} שעות השבוע, מעבר להיקף המשרה שלה (${allowed} שעות)`,
      });
    }
  });
  return warnings;
}

// 5. פער בין שעות תקן מאושרות לבין שעות שיבוץ בפועל
export function findApprovedVsScheduledGap(positions, schedules) {
  const warnings = [];
  const active = schedules.filter(s => s.status !== 'cancelled');
  const branchApproved = {};
  positions.filter(p => p.status === 'active').forEach(p => {
    if (!branchApproved[p.branch_id]) branchApproved[p.branch_id] = { name: p.branch_name, approved: 0 };
    branchApproved[p.branch_id].approved += positionTotalHours(p);
  });
  const scheduledByBranch = {};
  active.forEach(s => {
    if (!scheduledByBranch[s.branch_id]) scheduledByBranch[s.branch_id] = 0;
    scheduledByBranch[s.branch_id] += calcShiftHours(s.start_time, s.end_time);
  });
  Object.entries(branchApproved).forEach(([branchId, data]) => {
    const scheduled = scheduledByBranch[branchId] || 0;
    const gap = data.approved - scheduled;
    if (gap > 5) {
      warnings.push({
        type: 'hours_gap',
        severity: 'warning',
        message: `סניף ${data.name}: פער של ${Math.round(gap)} שעות בין תקנים מאושרים (${Math.round(data.approved)}) לשיבוץ בפועל (${Math.round(scheduled)})`,
      });
    }
  });
  return warnings;
}

// 6. מתנדבת שובצה ללא סטטוס פעיל
export function findInactiveVolunteerScheduled(schedules, volunteers) {
  const warnings = [];
  const volMap = new Map(volunteers.map(v => [v.id, v]));
  schedules.filter(s => s.status !== 'cancelled' && s.person_type === 'volunteer').forEach(s => {
    const vol = volMap.get(s.person_id);
    if (vol && vol.status !== 'active') {
      warnings.push({
        type: 'inactive_volunteer',
        severity: 'error',
        message: `מתנדבת ${s.person_name} משובצת אך סטטוס שלה אינו פעיל (${vol.status})`,
      });
    }
  });
  return warnings;
}

export function validateAll(schedules, employees, volunteers, positions) {
  return [
    ...findDoubleBooking(schedules),
    ...findOverScheduled(schedules, employees),
    ...findApprovedVsScheduledGap(positions, schedules),
    ...findInactiveVolunteerScheduled(schedules, volunteers),
  ];
}