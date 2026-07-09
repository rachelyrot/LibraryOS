import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sunrise, Sunset, Moon, CalendarDays, AlertTriangle, Building2, UserCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SHIFT_TYPE_LABELS, SHIFT_TYPE_COLORS, SCHEDULE_STATUS_LABELS, SCHEDULE_STATUS_COLORS, fullName, formatDate, getDayName } from '@/lib/staffUtils';

export default function TodayView({ branches }) {
  const [schedules, setSchedules] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [viewMode, setViewMode] = useState('branch');

  useEffect(() => {
    base44.entities.Schedule.filter({ date: selectedDate }, 'start_time', 500).then(setSchedules).catch(() => []);
  }, [selectedDate]);

  const activeSchedules = schedules.filter(s => s.status !== 'cancelled');
  const morning = activeSchedules.filter(s => s.shift_type === 'morning' || s.shift_type === 'full_day');
  const afternoon = activeSchedules.filter(s => s.shift_type === 'afternoon' || s.shift_type === 'full_day');
  const evening = activeSchedules.filter(s => s.shift_type === 'evening');
  const openShifts = activeSchedules.filter(s => s.status === 'planned');
  const activeBranches = branches.filter(b => b.status === 'active');
  const branchesWithoutCoverage = activeBranches.filter(b => !activeSchedules.some(s => s.branch_id === b.id));

  const stats = [
    { label: 'סך שיבוצים היום', value: activeSchedules.length, icon: CalendarDays, color: 'text-blue-500' },
    { label: 'משמרת בוקר', value: morning.length, icon: Sunrise, color: 'text-yellow-500' },
    { label: 'משמרת אחה״צ', value: afternoon.length, icon: Sunset, color: 'text-orange-500' },
    { label: 'משמרת ערב', value: evening.length, icon: Moon, color: 'text-indigo-500' },
    { label: 'משמרות פתוחות', value: openShifts.length, icon: AlertTriangle, color: 'text-amber-500' },
    { label: 'סניפים ללא כיסוי', value: branchesWithoutCoverage.length, icon: Building2, color: 'text-red-500' },
  ];

  const byBranch = activeBranches.map(branch => ({
    branch,
    shifts: activeSchedules.filter(s => s.branch_id === branch.id),
  }));

  const byShiftType = ['morning', 'afternoon', 'evening', 'full_day', 'replacement', 'reinforcement', 'volunteer'].map(type => ({
    type, label: SHIFT_TYPE_LABELS[type], shifts: activeSchedules.filter(s => s.shift_type === type),
  })).filter(g => g.shifts.length > 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-between items-center gap-2">
        <h3 className="text-lg font-semibold">מי עובדת היום - {getDayName(selectedDate)} {formatDate(selectedDate)}</h3>
        <div className="flex gap-2">
          <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="h-9 rounded-md border border-input px-3 text-sm" />
          <Select value={viewMode} onValueChange={setViewMode}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="branch">לפי סניף</SelectItem>
              <SelectItem value="shift">לפי משמרת</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <Card key={label}>
            <CardContent className="flex items-center gap-2 p-3">
              <Icon className={cn('w-5 h-5', color)} />
              <div>
                <p className="text-xl font-bold">{value}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {branchesWithoutCoverage.length > 0 && (
        <Card className="border-red-200">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-red-600 text-sm font-medium mb-1">
              <AlertTriangle className="w-4 h-4" /> סניפים ללא כיסוי ({branchesWithoutCoverage.length})
            </div>
            <div className="flex flex-wrap gap-2">
              {branchesWithoutCoverage.map(b => <span key={b.id} className="text-xs bg-red-50 text-red-700 px-2 py-1 rounded">{b.name}</span>)}
            </div>
          </CardContent>
        </Card>
      )}

      {viewMode === 'branch' ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {byBranch.map(({ branch, shifts }) => (
            <Card key={branch.id}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-medium text-sm flex items-center gap-1.5"><Building2 className="w-4 h-4 text-blue-500" /> {branch.name}</p>
                  <span className={cn('text-xs px-2 py-0.5 rounded', shifts.length > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700')}>
                    {shifts.length > 0 ? `${shifts.length} משובצות` : 'ללא כיסוי'}
                  </span>
                </div>
                {shifts.length === 0 ? (
                  <p className="text-xs text-muted-foreground">אין שיבוצים</p>
                ) : (
                  <div className="space-y-1">
                    {shifts.map(s => (
                      <div key={s.id} className="flex items-center justify-between text-xs border-b border-border/30 pb-1">
                        <span className="font-medium">{s.person_name}</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-muted-foreground">{s.start_time} - {s.end_time}</span>
                          <span className={cn('px-1.5 py-0.5 rounded', SHIFT_TYPE_COLORS[s.shift_type])}>{SHIFT_TYPE_LABELS[s.shift_type]}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {byShiftType.map(({ type, label, shifts }) => (
            <Card key={type}>
              <CardContent className="p-3">
                <p className="font-medium text-sm mb-2 flex items-center gap-2">
                  <span className={cn('text-xs px-2 py-0.5 rounded', SHIFT_TYPE_COLORS[type])}>{label}</span>
                  <span className="text-muted-foreground">({shifts.length})</span>
                </p>
                <div className="space-y-1">
                  {shifts.map(s => (
                    <div key={s.id} className="flex items-center justify-between text-sm border-b border-border/30 pb-1">
                      <span className="font-medium">{s.person_name}</span>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{s.branch_name}</span>
                        <span>{s.start_time} - {s.end_time}</span>
                        <span className={cn('px-1.5 py-0.5 rounded', SCHEDULE_STATUS_COLORS[s.status])}>{SCHEDULE_STATUS_LABELS[s.status]}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
          {byShiftType.length === 0 && <div className="text-center py-12 text-muted-foreground">אין שיבוצים לתאריך זה</div>}
        </div>
      )}
    </div>
  );
}