import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Users, HeartHandshake, Building2, Briefcase, AlertTriangle, CalendarDays, UserX, Sunrise, Sunset } from 'lucide-react';
import { getWeekDates, SHIFT_TYPE_LABELS, positionTotalPct, employeePct, pctToHours, formatFte } from '@/lib/staffUtils';
import { cn } from '@/lib/utils';

export default function StaffDashboardCards() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    const load = async () => {
      const today = new Date().toISOString().split('T')[0];
      const [branches, employees, volunteers, positions, schedules] = await Promise.all([
        base44.entities.Branch.list('-created_date', 500).catch(() => []),
        base44.entities.Employee.list('-created_date', 500).catch(() => []),
        base44.entities.Volunteer.list('-created_date', 500).catch(() => []),
        base44.entities.ApprovedPosition.list('-created_date', 500).catch(() => []),
        base44.entities.Schedule.filter({ date: today }, 'start_time', 500).catch(() => []),
      ]);
      const weekDates = getWeekDates(today);
      const weekSchedulesAll = await base44.entities.Schedule.list('date', 500).catch(() => []);
      const weekSchedules = weekSchedulesAll.filter(s => weekDates.includes(s.date));
      // תקן מול מאויש במשרות מלאות (100% = 40 ש') — ראו staffUtils
      const approvedPct = positions.filter(p => p.status === 'active').reduce((s, p) => s + positionTotalPct(p), 0);
      const filledPct = employees.filter(e => e.status === 'active').reduce((s, e) => s + employeePct(e), 0);
      const filled = employees.filter(e => e.status === 'active').length;
      const activeSchedules = schedules.filter(s => s.status !== 'cancelled');
      const morningCount = activeSchedules.filter(s => s.shift_type === 'morning' || s.shift_type === 'full_day').length;
      const afternoonCount = activeSchedules.filter(s => s.shift_type === 'afternoon' || s.shift_type === 'full_day').length;
      const activeBranches = branches.filter(b => b.status === 'active');
      const activeEmployees = employees.filter(e => e.status === 'active');
      // "Coverage" means the branch has staff assigned to it at all (primary or
      // additional branch), not whether someone happened to create an explicit
      // Schedule/shift record for today specifically — a branch with real staff
      // but no shift logged for today isn't actually uncovered.
      const branchesWithoutCoverage = activeBranches.filter(b => !activeEmployees.some(
        e => e.primary_branch_id === b.id || (e.additional_branch_ids || []).includes(b.id)
      ));
      setStats({
        activeBranches: activeBranches.length,
        activeEmployees: filled,
        activeVolunteers: volunteers.filter(v => v.status === 'active').length,
        approvedPct,
        positionGapPct: approvedPct - filledPct,
        morningToday: morningCount,
        afternoonToday: afternoonCount,
        openShifts: weekSchedules.filter(s => s.status === 'planned').length,
        onLeave: employees.filter(e => e.status === 'on_leave').length,
        branchesWithoutCoverage: branchesWithoutCoverage.length,
      });
    };
    load();
  }, []);

  if (!stats) return null;

  const cards = [
    { label: 'סניפים פעילים', value: stats.activeBranches, icon: Building2, color: 'text-blue-500', to: '/staff?tab=branches' },
    { label: 'עובדות פעילות', value: stats.activeEmployees, icon: Users, color: 'text-green-500', to: '/staff?tab=employees' },
    { label: 'מתנדבות פעילות', value: stats.activeVolunteers, icon: HeartHandshake, color: 'text-pink-500', to: '/staff?tab=volunteers' },
    { label: `תקן מאושר · ${pctToHours(stats.approvedPct)} ש'`, value: formatFte(stats.approvedPct), icon: Briefcase, color: 'text-purple-500', to: '/staff?tab=positions' },
    {
      label: 'פערי תקן',
      value: stats.positionGapPct > 0.5 ? `חסר ${formatFte(stats.positionGapPct)}` : stats.positionGapPct < -0.5 ? `עודף ${formatFte(-stats.positionGapPct)}` : 'מאוזן',
      icon: AlertTriangle, color: stats.positionGapPct > 0.5 ? 'text-amber-500' : 'text-green-500', to: '/staff?tab=positions',
    },
    { label: 'בוקר היום', value: stats.morningToday, icon: Sunrise, color: 'text-yellow-500', to: '/staff?tab=today' },
    { label: 'אחה״צ היום', value: stats.afternoonToday, icon: Sunset, color: 'text-orange-500', to: '/staff?tab=today' },
    { label: 'משמרות פתוחות', value: stats.openShifts, icon: CalendarDays, color: 'text-amber-500', to: '/staff?tab=schedule' },
    { label: 'ללא כיסוי', value: stats.branchesWithoutCoverage, icon: AlertTriangle, color: stats.branchesWithoutCoverage > 0 ? 'text-red-500' : 'text-green-500', to: '/staff?tab=today' },
    { label: 'עובדות בחופשה', value: stats.onLeave, icon: UserX, color: 'text-amber-500', to: '/staff?tab=employees' },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 mb-6">
      {cards.map((card, i) => (
        <Link key={i} to={card.to} className="bg-card rounded-xl p-4 border border-border shadow-sm hover:shadow-md hover:border-primary/40 transition-all">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">{card.label}</p>
              <p className="text-xl font-bold mt-1">{card.value}</p>
            </div>
            <card.icon className={cn('w-5 h-5', card.color)} />
          </div>
        </Link>
      ))}
    </div>
  );
}