import { cn } from '@/lib/utils';
import { SHIFT_TYPE_COLORS, SHIFT_TYPE_LABELS, SCHEDULE_STATUS_COLORS, SCHEDULE_STATUS_LABELS, WEEKDAY_LABELS, formatDate, calcShiftHours } from '@/lib/staffUtils';

export default function WeeklyScheduleTable({ schedules, weekDates, onEditShift, onDeleteShift, canManage }) {
  const shiftsByDay = weekDates.slice(0, 6).map(date => schedules.filter(s => s.date === date));

  return (
    <div className="border border-border rounded-xl overflow-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 sticky top-0">
          <tr className="border-b border-border">
            {WEEKDAY_LABELS.map((day, i) => (
              <th key={i} className="text-center p-2 font-medium min-w-[140px]">
                <div>{day}</div>
                <div className="text-xs text-muted-foreground font-normal">{formatDate(weekDates[i])}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {shiftsByDay.map((dayShifts, dayIdx) => (
              <td key={dayIdx} className="p-2 align-top border-l border-border/30">
                <div className="space-y-2">
                  {dayShifts.length === 0 && <div className="text-center text-xs text-muted-foreground py-4">אין שיבוצים</div>}
                  {dayShifts.map(shift => (
                    <div key={shift.id} className={cn('p-2 rounded-lg border text-xs space-y-1',
                      shift.status === 'cancelled' ? 'bg-red-50/50 border-red-200 opacity-60' :
                      shift.person_type === 'volunteer' ? 'bg-green-50 border-green-200' : 'bg-blue-50 border-blue-200',
                      canManage && 'cursor-pointer hover:shadow-sm transition-shadow'
                    )} onClick={() => canManage && onEditShift?.(shift)}>
                      <div className="font-semibold flex items-center justify-between">
                        <span>{shift.person_name}</span>
                        {canManage && shift.status !== 'cancelled' && (
                          <button onClick={(e) => { e.stopPropagation(); onDeleteShift?.(shift); }} className="text-red-400 hover:text-red-600 text-base leading-none">×</button>
                        )}
                      </div>
                      <div className="text-muted-foreground">{shift.start_time} - {shift.end_time} ({calcShiftHours(shift.start_time, shift.end_time)}ש')</div>
                      <div className="text-muted-foreground">{shift.branch_name}</div>
                      {shift.role_in_shift && <div className="text-muted-foreground">{shift.role_in_shift}</div>}
                      <div className="flex gap-1 flex-wrap">
                        <span className={cn('px-1.5 py-0.5 rounded text-[10px]', SHIFT_TYPE_COLORS[shift.shift_type])}>{SHIFT_TYPE_LABELS[shift.shift_type]}</span>
                        <span className={cn('px-1.5 py-0.5 rounded text-[10px]', SCHEDULE_STATUS_COLORS[shift.status])}>{SCHEDULE_STATUS_LABELS[shift.status]}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}