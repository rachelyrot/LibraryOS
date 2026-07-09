import { AlertTriangle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function ScheduleWarnings({ warnings }) {
  if (!warnings || warnings.length === 0) return null;
  return (
    <div className="space-y-2">
      {warnings.map((w, i) => {
        const Icon = w.severity === 'error' ? XCircle : AlertTriangle;
        return (
          <div key={i} className={cn('flex items-start gap-2 p-3 rounded-lg text-sm',
            w.severity === 'error' ? 'bg-red-50 text-red-800 border border-red-200' : 'bg-amber-50 text-amber-800 border border-amber-200'
          )}>
            <Icon className={cn('w-4 h-4 shrink-0 mt-0.5', w.severity === 'error' ? 'text-red-500' : 'text-amber-500')} />
            <span>{w.message}</span>
          </div>
        );
      })}
    </div>
  );
}