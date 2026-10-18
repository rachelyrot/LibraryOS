import { useState } from 'react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Paperclip, Plus, Trash2, Upload, Loader2, ListTodo, Wallet } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/projectUtils';
import ProjectBudgetSourceRow from '../ProjectBudgetSourceRow';

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

  // כמה קבצים בבת אחת; כל מה שהועלה נשמר יחד, גם אם קובץ אחד נכשל
  const handleUpload = async (e) => {
    const files = [...(e.target.files || [])];
    if (files.length === 0) return;
    setUploading(true);
    const added = [];
    for (const file of files) {
      try {
        const res = await base44.integrations.Core.UploadFile({ file });
        added.push(res.file_url);
      } catch (err) {
        toast.error(`שגיאה בהעלאת ${file.name}`);
      }
    }
    if (added.length) {
      onRowChange({ ...row, [key]: [...urls, ...added] });
      toast.success(added.length === 1 ? 'קובץ הועלה' : `${added.length} קבצים הועלו`);
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
              <a href={url} target="_blank" rel="noreferrer" className="text-xs text-primary truncate flex-1 hover:underline" title={fileNameFromUrl(url)}>{fileNameFromUrl(url)}</a>
              <button type="button" onClick={() => removeAt(i)}><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
            </div>
          ))}
          <label className={cnUpload(uploading)}>
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            {uploading ? 'מעלה...' : 'הוספת קבצים'}
            <input type="file" multiple className="hidden" onChange={handleUpload} disabled={uploading} />
          </label>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * The original file name from an uploaded file's URL. UploadFile stores files as
 * "<uuid>-<original name>", so the name is what follows the 36-char uuid.
 */
export function fileNameFromUrl(url) {
  try {
    const last = decodeURIComponent(String(url).split('?')[0].split('/').pop() || '');
    const name = /^[0-9a-f-]{36}-/i.test(last) ? last.slice(37) : last;
    // a non-ASCII name is stored as "b64-<base64url>.<ext>" (UploadFile)
    const m = name.match(/^b64-([\w-]+)(\.\w+)?$/);
    if (!m) return name;
    const b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)), c => c.charCodeAt(0));
    return new TextDecoder().decode(bytes) + (m[2] || '');
  } catch {
    return String(url);
  }
}

function cnUpload(uploading) {
  return `flex items-center justify-center gap-2 text-xs border border-dashed border-border rounded-lg py-2 cursor-pointer hover:border-primary transition-colors ${uploading ? 'opacity-60 pointer-events-none' : ''}`;
}

export function fileUrlsColumn(key, name, { width = 70 } = {}) {
  return {
    key, name, width, resizable: false, editable: false, popoverEditor: true,
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
    key, name, width, resizable: false, editable: false, popoverEditor: true,
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
    key, name, width, resizable: true, editable: false, popoverEditor: true,
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

  const add = () => commit([...sources, { source_id: null, name: '', allocation_ids: [], planned: 0, approved: 0, used: 0 }]);
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
      <PopoverContent className="w-[26rem] max-h-[70vh] overflow-y-auto font-heebo" dir="rtl" collisionPadding={16}>
        <div className="space-y-3">
          <p className="text-sm font-medium">מקורות תקציב</p>
          {sources.length === 0 && <p className="text-xs text-muted-foreground">אין מקורות תקציב</p>}
          {sources.map((s, i) => (
            <ProjectBudgetSourceRow
              key={i}
              compact
              value={s}
              takenIds={sources.map(x => x.source_id).filter(Boolean)}
              onChange={(next) => commit(sources.map((x, idx) => (idx === i ? next : x)))}
              onRemove={() => removeAt(i)}
            />
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
    key, name, width, resizable: true, editable: false, popoverEditor: true,
    renderCell(props) { return <BudgetSourcesCellButton {...props} />; },
  };
}
