import { useEffect, useRef, useState } from 'react';
import { Trash2, Pencil, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { MINISTRY_PARAMETERS, MONTHS, itemMonths, num, formatMoney, parameterAllocations, rowAllocationLimit } from '@/lib/workPlan';
import { allocationLabel } from '@/lib/budgetUpdater';

/**
 * עריכת שורות התכנית ישירות בטבלה, כמו באקסל: לוחצים על תא, מקלידים, והשינוי
 * נשמר כשיוצאים מהתא (או ב-Enter, שגם יורד לשורה הבאה). Escape מבטל.
 * השורה האחרונה בכל פרמטר ריקה — הקלדת פירוט בה יוצרת שורה חדשה.
 *
 * onSave(item, patch) / onCreate(data) / onDelete(item) — הדף מבצע את השמירה
 * ובודק הרשאות; כאן רק עריכה ותצוגה.
 */

const cellInput = 'w-full bg-transparent rounded px-1.5 py-1 outline-none border border-transparent hover:border-border focus:border-primary focus:bg-card disabled:hover:border-transparent';

// מעבר לשורה הבאה באותה עמודה, כמו Enter באקסל
function focusBelow(el) {
  const col = el.dataset.col;
  const row = el.closest('tr')?.nextElementSibling;
  row?.querySelector(`[data-col="${col}"]`)?.focus();
}

/** תא טקסט/מספר שנשמר ביציאה. format — תצוגה כשהתא לא בעריכה. */
function Cell({ value, onCommit, col, disabled, numeric, format, placeholder, className }) {
  const [draft, setDraft] = useState(null); // null = לא בעריכה
  const ref = useRef(null);
  const shown = draft ?? (format && value !== '' && value != null ? format(value) : (value ?? ''));

  const commit = () => {
    if (draft === null) return;
    const next = numeric ? draft.replace(/[^\d.]/g, '') : draft;
    setDraft(null);
    if (String(next) !== String(value ?? '')) onCommit(next);
  };

  return (
    <input
      ref={ref}
      data-col={col}
      disabled={disabled}
      dir={numeric ? 'ltr' : undefined}
      inputMode={numeric ? 'decimal' : undefined}
      placeholder={placeholder}
      className={cn(cellInput, numeric && 'text-left', className)}
      value={shown}
      onFocus={() => setDraft(String(value ?? ''))}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') { e.preventDefault(); commit(); focusBelow(e.currentTarget); }
        if (e.key === 'Escape') { setDraft(null); e.currentTarget.blur(); }
      }}
    />
  );
}

function MonthSelect({ value, onChange, col, disabled, allowEmpty, min }) {
  return (
    <select data-col={col} disabled={disabled} className={cn(cellInput, 'cursor-pointer')}
      value={value ?? ''} onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}>
      {allowEmpty && <option value="">לא נקבע</option>}
      {MONTHS.map((m, k) => <option key={m} value={k + 1} disabled={min && k + 1 < min}>{m}</option>)}
    </select>
  );
}

/**
 * בחירת הקטגוריות שהסכום של השורה יורד מהן, מתחת לתא הסכום. אפשר לבחור כמה —
 * הסכום מתחלק ביניהן לפי הסדר (planAllocationSplits), וכשאין בהן מספיק מוצג
 * כמה חסר.
 */
function AllocationPicker({ item, funder, info, canEdit, onSave, limit }) {
  const field = `${funder}_allocation_ids`;
  const ids = Array.isArray(item[field]) ? item[field] : [];
  const { splits = [], shortfall = 0 } = info.splits.byItem.get(item.id) || {};
  const byId = new Map(info.options.map(a => [a.id, a]));
  const free = (a) => Math.max(0, num(a.allocated_amount) - (info.splits.used.get(a.id) || 0));
  // מוצגות רק קטגוריות ששויכו לפרמטר של השורה
  const linked = parameterAllocations(item, info.options);
  const remaining = linked.filter(a => !ids.includes(a.id));
  const auto = ids.length === 0 && linked.length > 0;

  if (linked.length === 0 && ids.length === 0) {
    return (
      <p className="px-1.5 pb-1 text-[11px] text-amber-700">
        אין קטגוריה ששויכה לפרמטר הזה. אפשר לשייך במקורות תקציב, בעריכת הקטגוריה ← "פרמטר בתכנית העבודה".
      </p>
    );
  }

  return (
    <div className="px-1.5 pb-1 space-y-0.5">
      {limit != null && <p className="text-[11px] text-muted-foreground">עד {formatMoney(limit, 0)}</p>}
      {auto && splits.length > 0 && <p className="text-[10px] text-muted-foreground/80">מתוך הקטגוריות של הפרמטר:</p>}
      {splits.filter(s => !auto || s.amount > 0).map(s => (
        <div key={s.id} className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <span className="truncate max-w-[110px]" title={allocationLabel(byId.get(s.id))}>{allocationLabel(byId.get(s.id))}</span>
          <span className="shrink-0" dir="ltr">{formatMoney(s.amount, 0)}</span>
          {canEdit && !auto && (
            <button className="shrink-0 hover:text-red-500" title="הסרת הקטגוריה"
              onClick={() => onSave(item, { [field]: ids.filter(x => x !== s.id) })}>×</button>
          )}
        </div>
      ))}
      {shortfall > 0.005 && (
        <p className="text-[11px] font-medium text-red-600 bg-red-50 rounded px-1">חריגה מהתקציב: {formatMoney(shortfall, 0)}</p>
      )}
      {/* בחירה ידנית: במקום כל קטגוריות הפרמטר — רק אלה שנבחרו, לפי הסדר */}
      {canEdit && remaining.length > 0 && (linked.length > 1 || !auto) && (
        <select value="" className={cn(cellInput, 'text-[11px] text-muted-foreground cursor-pointer px-0.5 py-0.5')}
          onChange={e => e.target.value && onSave(item, { [field]: [...ids, e.target.value] })}>
          <option value="">{auto ? 'בחירת קטגוריה מסוימת' : '+ עוד קטגוריה'}</option>
          {remaining.map(a => (
            <option key={a.id} value={a.id}>{allocationLabel(a)} · פנוי {formatMoney(free(a), 0)}</option>
          ))}
        </select>
      )}
    </div>
  );
}

function ItemRow({ item, cols, canEdit, editing, onToggleEdit, onSave, onDelete, funding }) {
  // עורכים רק אחרי לחיצה על העיפרון בתחילת השורה — לחיצה על תא לבד לא משנה כלום
  const editable = canEdit && editing;
  const months = itemMonths(item);
  const start = months[0] ?? null;
  const end = months[months.length - 1] ?? null;
  const save = (patch) => onSave(item, patch);

  // התזמון נשמר תמיד כטווח חודשים; רבעונים ישנים מתנקים כדי שלא יתנגשו
  const setStart = (m) => save({
    utilization_start_month: m,
    utilization_end_month: m == null ? null : (end == null || end < m ? m : end),
    quarters: [],
  });
  const setEnd = (m) => save({ utilization_start_month: start, utilization_end_month: m, quarters: [] });

  const legacyCategory = !MINISTRY_PARAMETERS.some(p => p.name === item.category);

  return (
    <tr className={cn('border-b border-border/40 align-top', editing ? 'bg-amber-50/70 shadow-[inset_-3px_0_0_hsl(var(--primary))]' : 'hover:bg-muted/20')}>
      {canEdit && (
        <td className="p-1 w-9">
          <button type="button" onClick={onToggleEdit}
            className={cn('rounded p-1.5', editing ? 'text-green-600 hover:bg-green-50' : 'text-muted-foreground hover:text-foreground hover:bg-muted')}
            title={editing ? 'סיום עריכה' : 'עריכת שורה'} aria-label={editing ? 'סיום עריכה' : 'עריכת שורה'}>
            {editing ? <Check className="w-4 h-4" /> : <Pencil className="w-3.5 h-3.5" />}
          </button>
        </td>
      )}
      <td className="p-1 min-w-[200px]">
        <Cell col="activity_name" value={item.activity_name} disabled={!editable} className="font-medium"
          onCommit={v => { if (v.trim()) save({ activity_name: v.trim() }); }} />
        <Cell col="description" value={item.description} disabled={!editable} placeholder={editable ? 'תיאור' : ''}
          className="text-xs text-muted-foreground" onCommit={v => save({ description: v })} />
      </td>
      <td className="p-1 w-28">
        <Cell col="budget_line" value={item.budget_line} disabled={!editable} placeholder={editable ? 'סעיף' : ''}
          className="text-xs" onCommit={v => save({ budget_line: v.trim() })} />
      </td>
      <td className="p-1 w-28"><MonthSelect col="start" value={start} disabled={!editable} allowEmpty onChange={setStart} /></td>
      <td className="p-1 w-28">
        {start == null
          ? <span className="block px-1.5 py-1 text-xs text-amber-600">לא נקבע</span>
          : <MonthSelect col="end" value={end} min={start} disabled={!editable} onChange={setEnd} />}
      </td>
      <td className="p-1 hidden md:table-cell min-w-[110px]">
        <Cell col="target_audience" value={item.target_audience} disabled={!editable} onCommit={v => save({ target_audience: v })} />
      </td>
      <td className="p-1 hidden lg:table-cell w-24">
        <Cell col="expected_participants" numeric value={item.expected_participants} disabled={!editable}
          format={v => num(v).toLocaleString('he-IL')} onCommit={v => save({ expected_participants: v === '' ? '' : num(v) })} />
      </td>
      {cols.map(c => (
        <td key={c.key} className="p-1 w-40">
          {c.key === 'total'
            ? <span className="block px-1.5 py-1 text-left font-semibold whitespace-nowrap" dir="ltr">{formatMoney(c.value(item))}</span>
            : (() => {
              const info = funding?.[c.key];
              const limit = info ? rowAllocationLimit(item, c.key, info.options, info.splits) : null;
              const commit = (v) => {
                // סכום מעבר למה שפנוי בקטגוריות הוא חריגה מהתקציב — מותר, אחרי
                // אישור, והשורה מסומנת באדום ("חסרים") עד שמוסיפים קטגוריה
                if (limit != null && num(v) > limit + 0.005) {
                  const over = num(v) - limit;
                  if (!window.confirm(`בקטגוריות של השורה פנויים ${formatMoney(limit, 0)}. הסכום ${formatMoney(num(v), 0)} הוא חריגה של ${formatMoney(over, 0)} מהתקציב.\n\nלשמור עם החריגה?`)) return;
                  toast.warning(`נשמר עם חריגה של ${formatMoney(over, 0)} מהתקציב`);
                }
                save({ [`${c.key}_amount`]: num(v) });
              };
              return (
                <>
                  <Cell col={c.key} numeric value={item[`${c.key}_amount`] ?? 0} disabled={!editable}
                    format={v => formatMoney(v)} onCommit={commit} />
                  {info && <AllocationPicker item={item} funder={c.key} info={info} canEdit={editable} onSave={onSave} limit={limit} />}
                </>
              );
            })()}
        </td>
      ))}
      <td className="p-1 hidden xl:table-cell min-w-[120px]">
        <Cell col="notes" value={item.notes} disabled={!editable} onCommit={v => save({ notes: v })} />
      </td>
      {canEdit && (
        <td className="p-1 w-40">
          <div className="flex items-center gap-0.5">
            {/* העברה לפרמטר אחר — השורה עוברת לטבלה של אותו פרמטר */}
            <select title="העברה לפרמטר אחר" className={cn(cellInput, 'text-xs text-muted-foreground cursor-pointer')}
              value={item.category} disabled={!editable} onChange={e => save({ category: e.target.value })}>
              {MINISTRY_PARAMETERS.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
              {legacyCategory && <option value={item.category}>{item.category}</option>}
            </select>
            <button onClick={() => onDelete(item)} className="p-1.5 rounded-lg hover:bg-muted shrink-0" title="מחיקה">
              <Trash2 className="w-3.5 h-3.5 text-red-400" />
            </button>
          </div>
        </td>
      )}
    </tr>
  );
}

/** השורה הריקה בסוף הטבלה: הקלדת פירוט יוצרת שורה חדשה בפרמטר. */
function NewRow({ colSpan, onCreate, onCreated, focusToken }) {
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const ref = useRef(null);

  useEffect(() => { if (focusToken) ref.current?.focus(); }, [focusToken]);

  const commit = async () => {
    const name = value.trim();
    if (!name || saving) return;
    setSaving(true);
    try {
      // שורה חדשה נפתחת מיד בעריכה, כדי להמשיך למלא אותה
      const created = await onCreate({ activity_name: name });
      setValue('');
      if (created?.id) onCreated?.(created.id);
    } finally {
      setSaving(false);
    }
  };

  return (
    <tr className="bg-muted/10">
      <td className="p-1" colSpan={colSpan}>
        <input ref={ref} data-col="activity_name" value={value} disabled={saving}
          placeholder={saving ? 'מוסיף…' : '+ הקלידי פירוט כדי להוסיף שורה'}
          className={cn(cellInput, 'text-muted-foreground placeholder:text-muted-foreground/70')}
          onChange={e => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); commit(); }
            if (e.key === 'Escape') { setValue(''); e.currentTarget.blur(); }
          }} />
      </td>
    </tr>
  );
}

/**
 * funding — לכל גורם מממן שהמקור המקושר שלו מחולק לקטגוריות:
 *   { options: קטגוריות המקור, splits: planAllocationSplits(...) }
 */
export default function WorkPlanGrid({ items, cols, canEdit, onSave, onCreate, onDelete, focusToken, funding }) {
  const [editingId, setEditingId] = useState(null);
  const colSpan = 6 + cols.length + 1 + (canEdit ? 2 : 0);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-muted-foreground border-b border-border/60">
            {canEdit && <th className="w-9" />}
            <th className="text-right font-medium p-2.5">פירוט</th>
            <th className="text-right font-medium p-2.5 whitespace-nowrap">סעיף תקציבי</th>
            <th className="text-right font-medium p-2.5 whitespace-nowrap">מחודש</th>
            <th className="text-right font-medium p-2.5 whitespace-nowrap">עד חודש</th>
            <th className="text-right font-medium p-2.5 hidden md:table-cell">קהל יעד</th>
            <th className="text-right font-medium p-2.5 hidden lg:table-cell">משתתפים</th>
            {cols.map(c => <th key={c.key} className="text-left font-medium p-2.5 whitespace-nowrap">{c.label}</th>)}
            <th className="text-right font-medium p-2.5 hidden xl:table-cell">הערות</th>
            {canEdit && <th className="text-right font-medium p-2.5">פרמטר</th>}
          </tr>
        </thead>
        <tbody>
          {items.map(i => (
            <ItemRow key={i.id} item={i} cols={cols} canEdit={canEdit} onSave={onSave} onDelete={onDelete} funding={funding}
              editing={editingId === i.id} onToggleEdit={() => setEditingId(id => (id === i.id ? null : i.id))} />
          ))}
          {canEdit && <NewRow colSpan={colSpan} onCreate={onCreate} onCreated={setEditingId} focusToken={focusToken} />}
          {!canEdit && items.length === 0 && (
            <tr><td colSpan={colSpan} className="px-4 py-3 text-sm text-muted-foreground">אין עדיין שורות בפרמטר זה</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
