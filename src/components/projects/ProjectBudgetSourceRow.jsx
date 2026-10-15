import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { allocationLabel, allocationRemaining } from '@/lib/budgetUpdater';

// מקורות התקציב והקטגוריות שלהם נטענים פעם אחת לכל טעינת דף, ומשותפים לכל
// השורות — אותו דפוס כמו useCategories. מה שנוסף במסך מקורות תקציב יופיע
// אחרי רענון.
let cached = null;
let pending = null;
const loadBudgetData = () => {
  if (cached) return Promise.resolve(cached);
  if (!pending) {
    pending = Promise.all([
      base44.entities.BudgetSource.list('-year', 200).catch(() => []),
      base44.entities.BudgetAllocation.list('name', 2000).catch(() => []),
    ]).then(([sources, allocations]) => (cached = { sources, allocations }));
  }
  return pending;
};

function useBudgetData() {
  const [data, setData] = useState(cached || { sources: [], allocations: [] });
  useEffect(() => { let live = true; loadBudgetData().then(d => live && setData(d)); return () => { live = false; }; }, []);
  return data;
}

export const sourceLabel = (s) => `${s.name}${s.year ? ` · ${s.year}` : ''}`;
const money = (n) => `₪${(Number(n) || 0).toLocaleString('he-IL')}`;

/**
 * שורת מקור תקציב בפרויקט — כמו בתכנית העבודה: בוחרים מקור מהרשימה ואת
 * הקטגוריות שהסכום יורד מהן (אפשר לשלב כמה), והסכום מוגבל למה שפנוי בהן.
 * במקורות תקציב הסכום יורד לפי מצב הפרויקט (projectCommitments ב-workPlan.js).
 *
 * value — אלמנט של projects.budget_source_names:
 *   { source_id, name, allocation_ids, planned, approved, used }
 * מקור ישן שהוקלד ידנית (name בלי source_id) מוצג כ"הוזן ידנית" עד שבוחרים
 * במקומו מקור מהרשימה. onChange(next) נקרא רק על שינוי שצריך לשמור.
 */
export default function ProjectBudgetSourceRow({ value, onChange, onRemove, takenIds = [], compact }) {
  const { sources, allocations } = useBudgetData();
  const [draft, setDraft] = useState({});
  const source = sources.find(s => s.id === value.source_id);
  const sourceAllocs = allocations.filter(a => a.budget_source_id === value.source_id);
  const single = source?.uses_categories === false;
  const ids = single ? sourceAllocs.slice(0, 1).map(a => a.id) : (value.allocation_ids || []);
  const chosen = ids.map(id => sourceAllocs.find(a => a.id === id)).filter(Boolean);
  const remaining = sourceAllocs.filter(a => !ids.includes(a.id));
  // כמה פנוי בקטגוריות שנבחרו — מה שלא שוריין ולא נוצל בהזמנות
  const limit = chosen.length ? chosen.reduce((s, a) => s + allocationRemaining(a), 0) : null;
  const legacy = !value.source_id && value.name;

  const pickSource = (id) => {
    const src = sources.find(s => s.id === id);
    if (src) onChange({ ...value, source_id: src.id, name: sourceLabel(src), allocation_ids: [] });
  };

  const commitNumber = (field) => {
    if (draft[field] === undefined) return;
    const n = Number(draft[field]) || 0;
    setDraft(d => ({ ...d, [field]: undefined }));
    if (n === (Number(value[field]) || 0)) return;
    if (field !== 'used' && limit != null && n > limit + 0.005) {
      toast.error(`אפשר עד ${money(limit)} — זה מה שפנוי בקטגוריות שנבחרו`);
      return;
    }
    onChange({ ...value, [field]: n });
  };

  const num = (field, label) => (
    <div>
      <label className="text-[10px] text-muted-foreground">{label}</label>
      <Input
        type="number"
        value={draft[field] ?? value[field] ?? 0}
        onChange={e => setDraft(d => ({ ...d, [field]: e.target.value }))}
        onBlur={() => commitNumber(field)}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
        className={compact ? 'h-7 text-xs' : 'h-8 text-sm'}
      />
    </div>
  );

  return (
    <div className="space-y-1.5 border-b border-border pb-3 last:border-0 last:pb-0">
      <div className="flex gap-2 items-center">
        <select
          value={value.source_id || (legacy ? '__legacy__' : '')}
          onChange={e => pickSource(e.target.value)}
          className={cn('h-8 rounded-md border border-input bg-background px-2 text-sm flex-1 min-w-0 cursor-pointer', !value.source_id && 'text-muted-foreground')}
        >
          <option value="" disabled>בחרי מקור תקציב</option>
          {legacy && <option value="__legacy__" disabled>{value.name} (הוזן ידנית)</option>}
          {sources.map(s => (
            <option key={s.id} value={s.id} disabled={s.id !== value.source_id && takenIds.includes(s.id)}>
              {sourceLabel(s)}{s.status && s.status !== 'active' ? ' (לא פעיל)' : ''}
            </option>
          ))}
        </select>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onRemove}>
          <Trash2 className="w-3.5 h-3.5 text-red-400" />
        </Button>
      </div>

      {/* קטגוריות — רק במקור שמחולק לקטגוריות */}
      {value.source_id && !single && (
        <div className="flex flex-wrap items-center gap-1.5">
          {chosen.map(a => (
            <span key={a.id} className="inline-flex items-center gap-1 text-xs bg-muted rounded-full px-2 py-0.5">
              {allocationLabel(a)} <span className="text-muted-foreground">· פנוי {money(allocationRemaining(a))}</span>
              <button type="button" className="hover:text-red-500" title="הסרה"
                onClick={() => onChange({ ...value, allocation_ids: ids.filter(x => x !== a.id) })}>×</button>
            </span>
          ))}
          {remaining.length > 0 && (
            <select value="" onChange={e => e.target.value && onChange({ ...value, allocation_ids: [...ids, e.target.value] })}
              className="h-7 rounded-md border border-dashed border-input bg-background px-1.5 text-xs text-muted-foreground cursor-pointer">
              <option value="">{chosen.length ? '+ עוד קטגוריה' : '+ מאיזו קטגוריה'}</option>
              {remaining.map(a => <option key={a.id} value={a.id}>{allocationLabel(a)} · פנוי {money(allocationRemaining(a))}</option>)}
            </select>
          )}
          {chosen.length === 0 && <span className="text-[11px] text-amber-700">בחרי קטגוריה — בלי קטגוריה הסכום לא יורד במקורות תקציב</span>}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        {num('planned', 'מתוכנן')}
        {num('approved', 'מאושר')}
        {num('used', 'נוצל')}
      </div>
      {limit != null && <p className="text-[11px] text-muted-foreground">עד {money(limit)} — הפנוי בקטגוריות שנבחרו</p>}
    </div>
  );
}
