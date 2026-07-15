import { useState } from 'react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Paperclip, Plus, Trash2, Upload, Loader2, ListTodo, Wallet } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/projectUtils';

// Cell renderers for jsonb array columns. These are NOT edit-cells in react-data-grid's
// sense (no renderEditCell/onClose dance) — they're plain renderCell buttons that open
// a shadcn Popover (which manages its own open/close state internally via Radix), so
// there's no rules-of-hooks concern from being invoked inside a plain renderCell
// callback: hooks used here live inside these proper named components, not directly
// in the column-builder function bodies.

// ── file_urls (array of URL strings), e.g. project_tasks.file_urls ──────────────
function FileUrlsCellButton({ row, column, onRowChange }) {
  const key = column.key;
  const urls = row[key] || [];
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const res = await base44.integrations.Core.UploadFile({ file });
      onRowChange({ ...row, [key]: [...urls, res.file_url] });
      toast.success('קובץ הועלה');
    } catch (err) {
      toast.error('שגיאה בהעלאת קובץ');
    }
    setUploading(false);
    e.target.value = '';
  };

  const removeAt = (i) => onRowChange({ ...row, [key]: urls.filter((_, idx) => idx !== i) });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="w-full h-full flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <Paperclip className="w-3.5 h-3.5" /> {urls.length > 0 ? urls.length : ''}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 font-heebo" dir="rtl">
        <div className="space-y-2">
          <p className="text-sm font-medium">קבצים מצורפים</p>
          {urls.length === 0 && <p className="text-xs text-muted-foreground">אין קבצים</p>}
          {urls.map((url, i) => (
            <div key={i} className="flex items-center gap-2">
              <a href={url} target="_blank" rel="noreferrer" className="text-xs text-primary truncate flex-1 hover:underline">{url}</a>
              <button type="button" onClick={() => removeAt(i)}><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
            </div>
          ))}
          <label className={cnUpload(uploading)}>
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            {uploading ? 'מעלה...' : 'הוספת קובץ'}
            <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
          </label>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function cnUpload(uploading) {
  return `flex items-center justify-center gap-2 text-xs border border-dashed border-border rounded-lg py-2 cursor-pointer hover:border-primary transition-colors ${uploading ? 'opacity-60 pointer-events-none' : ''}`;
}

export function fileUrlsColumn(key, name, { width = 70 } = {}) {
  return {
    key, name, width, resizable: false, editable: false,
    renderCell(props) { return <FileUrlsCellButton {...props} />; },
  };
}

// ── related_task_ids (array of task ids), e.g. project_milestones.related_task_ids ──
function TaskPickerCellButton({ row, column, onRowChange, tasks }) {
  const key = column.key;
  const ids = row[key] || [];

  const toggle = (taskId) => {
    const next = ids.includes(taskId) ? ids.filter((id) => id !== taskId) : [...ids, taskId];
    onRowChange({ ...row, [key]: next });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="w-full h-full flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ListTodo className="w-3.5 h-3.5" /> {ids.length > 0 ? ids.length : ''}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 font-heebo max-h-72 overflow-y-auto" dir="rtl">
        <div className="space-y-1.5">
          <p className="text-sm font-medium mb-1">משימות קשורות</p>
          {(tasks || []).length === 0 && <p className="text-xs text-muted-foreground">אין משימות בפרויקט</p>}
          {(tasks || []).map((t) => (
            <label key={t.id} className="flex items-center gap-2 text-xs cursor-pointer py-0.5">
              <Checkbox checked={ids.includes(t.id)} onCheckedChange={() => toggle(t.id)} />
              <span className="truncate">{t.task_description}</span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function taskPickerColumn(key, name, tasks, { width = 90 } = {}) {
  return {
    key, name, width, resizable: false, editable: false,
    renderCell(props) { return <TaskPickerCellButton {...props} tasks={tasks} />; },
  };
}

// ── text-list columns (array of free-text strings) — generic, currently unused
// by any column builder call site (projects.budget_source_names moved to the
// richer budgetSourcesColumn below once it needed per-source amounts) ──
function TextListCellButton({ row, column, onRowChange, placeholder }) {
  const key = column.key;
  const items = row[key] || [];

  const update = (i, value) => {
    const next = [...items];
    next[i] = value;
    onRowChange({ ...row, [key]: next });
  };
  const add = () => onRowChange({ ...row, [key]: [...items, ''] });
  const removeAt = (i) => onRowChange({ ...row, [key]: items.filter((_, idx) => idx !== i) });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="w-full h-full px-2 flex items-center text-xs truncate">
          {items.length > 0 ? items.filter(Boolean).join(', ') : <span className="text-muted-foreground">-</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 font-heebo" dir="rtl">
        <div className="space-y-2">
          {items.map((val, i) => (
            <div key={i} className="flex gap-2">
              <Input value={val} onChange={(e) => update(i, e.target.value)} placeholder={placeholder} className="h-8 text-sm" />
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removeAt(i)}>
                <Trash2 className="w-3.5 h-3.5 text-red-400" />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={add} className="gap-1 w-full">
            <Plus className="w-3.5 h-3.5" /> הוסף
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function textListColumn(key, name, { width = 160, placeholder } = {}) {
  return {
    key, name, width, resizable: true, editable: false,
    renderCell(props) { return <TextListCellButton {...props} placeholder={placeholder} />; },
  };
}

// ── budget sources (array of {name, planned, approved, used}), e.g. projects.budget_source_names ──
// Every edit here also recomputes and writes the project-level budget_planned/
// budget_approved/budget_used totals in the SAME onRowChange call, so the
// caller's gridSave.js `computeExtra` (see src/pages/Projects.jsx) can persist
// them together with the sources array in one request — those three columns
// must be marked read-only by the caller, since they're derived here, not
// independently editable.
function sumSources(sources, field) {
  return (sources || []).reduce((sum, s) => sum + (Number(s[field]) || 0), 0);
}

function BudgetSourcesCellButton({ row, column, onRowChange }) {
  const key = column.key;
  const sources = row[key] || [];

  const commit = (nextSources) => {
    onRowChange({
      ...row,
      [key]: nextSources,
      budget_planned: sumSources(nextSources, 'planned'),
      budget_approved: sumSources(nextSources, 'approved'),
      budget_used: sumSources(nextSources, 'used'),
    });
  };

  const update = (i, field, value) => {
    commit(sources.map((s, idx) => (idx === i ? { ...s, [field]: value } : s)));
  };
  const add = () => commit([...sources, { name: '', planned: 0, approved: 0, used: 0 }]);
  const removeAt = (i) => commit(sources.filter((_, idx) => idx !== i));

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="w-full h-full px-2 flex items-center gap-1 text-xs truncate">
          {sources.length > 0
            ? <><Wallet className="w-3.5 h-3.5 shrink-0" /> {sources.length} · {formatCurrency(sumSources(sources, 'planned'))}</>
            : <span className="text-muted-foreground">-</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[26rem] font-heebo" dir="rtl">
        <div className="space-y-3">
          <p className="text-sm font-medium">מקורות תקציב</p>
          {sources.length === 0 && <p className="text-xs text-muted-foreground">אין מקורות תקציב</p>}
          {sources.map((s, i) => (
            <div key={i} className="space-y-1.5 border-b border-border pb-2 last:border-0 last:pb-0">
              <div className="flex gap-2 items-center">
                <Input value={s.name || ''} onChange={(e) => update(i, 'name', e.target.value)} placeholder="שם מקור" className="h-8 text-sm flex-1" />
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removeAt(i)}>
                  <Trash2 className="w-3.5 h-3.5 text-red-400" />
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                <div>
                  <label className="text-[10px] text-muted-foreground">מתוכנן</label>
                  <Input type="number" value={s.planned ?? 0} onChange={(e) => update(i, 'planned', Number(e.target.value) || 0)} className="h-7 text-xs" />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">מאושר</label>
                  <Input type="number" value={s.approved ?? 0} onChange={(e) => update(i, 'approved', Number(e.target.value) || 0)} className="h-7 text-xs" />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">נוצל</label>
                  <Input type="number" value={s.used ?? 0} onChange={(e) => update(i, 'used', Number(e.target.value) || 0)} className="h-7 text-xs" />
                </div>
              </div>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={add} className="gap-1 w-full">
            <Plus className="w-3.5 h-3.5" /> הוסף מקור
          </Button>
          {sources.length > 0 && (
            <div className="text-xs text-muted-foreground border-t border-border pt-2 flex flex-wrap justify-between gap-x-3">
              <span>סה"כ מתוכנן: {formatCurrency(sumSources(sources, 'planned'))}</span>
              <span>מאושר: {formatCurrency(sumSources(sources, 'approved'))}</span>
              <span>נוצל: {formatCurrency(sumSources(sources, 'used'))}</span>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function budgetSourcesColumn(key, name, { width = 130 } = {}) {
  return {
    key, name, width, resizable: true, editable: false,
    renderCell(props) { return <BudgetSourcesCellButton {...props} />; },
  };
}
