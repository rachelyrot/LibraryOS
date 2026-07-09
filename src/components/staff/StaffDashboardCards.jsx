import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Users, HeartHandshake, Building2, Briefcase, AlertTriangle, CalendarDays, UserX, Sunrise, Sunset } from 'lucide-react';
import { getWeekDates, SHIFT_TYPE_LABELS } from '@/lib/staffUtils';
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
      const approved = positions.filter(p => p.status === 'active').reduce((s, p) => s + (p.approved_count || 1), 0);
      const filled = employees.filter(e => e.status === 'active').length;
      const activeSchedules = schedules.filter(s => s.status !== 'cancelled');
      const morningCount = activeSchedules.filter(s => s.shift_type === 'morning' || s.shift_type === 'full_day').length;
      const afternoonCount = activeSchedules.filter(s => s.shift_type === 'afternoon' || s.shift_type === 'full_day').length;
      const activeBranches = branches.filter(b => b.status === 'active');
      const branchesWithoutCoverage = activeBranches.filter(b => !activeSchedules.some(s => s.branch_id === b.id));
      setStats({
        activeBranches: activeBranches.length,
        activeEmployees: filled,
        activeVolunteers: volunteers.filter(v => v.status === 'active').length,
        approvedPositions: approved,
        filledPositions: filled,
        positionGap: approved - filled,
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
    { label: 'סניפים פעילים', value: stats.activeBranches, icon: Building2, color: 'text-blue-500' },
    { label: 'עובדות פעילות', value: stats.activeEmployees, icon: Users, color: 'text-green-500' },
    { label: 'מתנדבות פעילות', value: stats.activeVolunteers, icon: HeartHandshake, color: 'text-pink-500' },
    { label: 'תקנים מאושרים', value: stats.approvedPositions, icon: Briefcase, color: 'text-purple-500' },
    { label: 'פערי תקן', value: stats.positionGap > 0 ? `חסר ${stats.positionGap}` : stats.positionGap < 0 ? `עודף ${Math.abs(stats.positionGap)}` : 'מאוזן', icon: AlertTriangle, color: stats.positionGap > 0 ? 'text-amber-500' : 'text-green-500' },
    { label: 'בוקר היום', value: stats.morningToday, icon: Sunrise, color: 'text-yellow-500' },
    { label: 'אחה״צ היום', value: stats.afternoonToday, icon: Sunset, color: 'text-orange-500' },
    { label: 'משמרות פתוחות', value: stats.openShifts, icon: CalendarDays, color: 'text-amber-500' },
    { label: 'ללא כיסוי', value: stats.branchesWithoutCoverage, icon: AlertTriangle, color: stats.branchesWithoutCoverage > 0 ? 'text-red-500' : 'text-green-500' },
    { label: 'עובדות בחופשה', value: stats.onLeave, icon: UserX, color: 'text-amber-500' },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 mb-6">
      {cards.map((card, i) => (
        <div key={i} className="bg-card rounded-xl p-4 border border-border shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">{card.label}</p>
              <p className="text-xl font-bold mt-1">{card.value}</p>
            </div>
            <card.icon className={cn('w-5 h-5', card.color)} />
          </div>
        </div>
      ))}
    </div>
  );
}