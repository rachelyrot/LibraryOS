import { textEditor } from 'react-data-grid';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/projectUtils';

// Shared react-data-grid column builders for the Projects module's inline-editable
// grids. Verified against the installed react-data-grid@7.0.0-beta.47 source
// directly (not assumed from docs):
//   - a column is only actually editable if it has a `renderEditCell` — there is
//     NO automatic default text editor for columns that just set `editable: true`
//     (isCellEditable checks `column.renderEditCell != null`), so textColumn must
//     wire the library's own exported `textEditor` explicitly.
//   - renderEditCell's onRowChange(row) updates the in-progress edit on every
//     keystroke with NO commit flag; onClose(true, false) commits on blur/Enter,
//     onClose(false) cancels on Escape.
//   - renderCell's onRowChange(row) (no second arg) commits immediately — used
//     here for one-shot edits like checkboxes and <select> dropdowns.

const inputBase = 'w-full h-full px-2 text-sm bg-background border-0 outline-none';
// Native <select> edit-cells need to be wider than the (often narrow) column
// itself, or the closed select box clips its own selected-option text — this
// is what earlier looked like "corrupted" cell text and turned out to just be
// a too-narrow dropdown. min-width overflows past the cell bounds while
// editing (same pattern spreadsheets use for narrow dropdown columns).
const selectInputBase = `${inputBase} min-w-[140px]`;

export function textColumn(key, name, { editable = true, width } = {}) {
  return { key, name, width, editable, resizable: true, renderEditCell: textEditor };
}

export function numberColumn(key, name, { editable = true, width, min, max } = {}) {
  const clamp = (n) => {
    if (n == null) return n;
    let v = n;
    if (min != null) v = Math.max(min, v);
    if (max != null) v = Math.min(max, v);
    return v;
  };
  return {
    key, name, width, editable, resizable: true,
    renderCell({ row }) {
      return <div className="text-left w-full px-2">{row[key] ?? 0}</div>;
    },
    renderEditCell({ row, onRowChange, onClose }) {
      return (
        <input
          autoFocus
          type="number"
          min={min}
          max={max}
          className={inputBase}
          defaultValue={row[key] ?? 0}
          onChange={(e) => onRowChange({ ...row, [key]: e.target.value === '' ? null : clamp(Number(e.target.value)) })}
          onBlur={() => onClose(true, false)}
          onKeyDown={(e) => { if (e.key === 'Escape') onClose(false); }}
        />
      );
    },
  };
}

export function dateColumn(key, name, { editable = true, width } = {}) {
  return {
    key, name, width, editable, resizable: true,
    renderCell({ row }) {
      return <div className="w-full px-2">{formatDate(row[key])}</div>;
    },
    renderEditCell({ row, onRowChange, onClose }) {
      return (
        <input
          autoFocus
          type="date"
          className={inputBase}
          defaultValue={row[key] || ''}
          onChange={(e) => onRowChange({ ...row, [key]: e.target.value || null })}
          onBlur={() => onClose(true, false)}
          onKeyDown={(e) => { if (e.key === 'Escape') onClose(false); }}
        />
      );
    },
  };
}

// Enum/status/priority/type columns — reads options from the existing *_LABELS
// objects in src/lib/projectUtils.js, renders the same colored pill used
// elsewhere in this module.
export function enumColumn(key, name, labels, colors, { editable = true, width } = {}) {
  return {
    key, name, width, editable, resizable: true,
    renderCell({ row }) {
      const value = row[key];
      return (
        <div className="w-full px-2 flex items-center h-full min-w-0">
          <span className={cn('text-xs px-2 py-0.5 rounded truncate', colors?.[value])}>{labels[value] || '-'}</span>
        </div>
      );
    },
    renderEditCell({ row, onRowChange }) {
      return (
        <select
          autoFocus
          className={selectInputBase}
          value={row[key] || ''}
          onChange={(e) => onRowChange({ ...row, [key]: e.target.value }, true)}
        >
          {Object.entries(labels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      );
    },
  };
}

// A text field chosen from a list instead of typed — e.g. a task's domain from
// the project's domains. getOptions(row) returns the allowed strings (they may
// depend on the row, like sub-domains of the row's domain). A value already
// saved that is not in the list stays selectable, so it isn't silently lost.
// onPick(row, value) may return extra fields to change together (e.g. clearing
// a sub-domain that doesn't belong to the newly picked domain).
export function optionsColumn(key, name, getOptions, { editable = true, width, onPick, emptyLabel = '—' } = {}) {
  return {
    key, name, width, editable, resizable: true,
    renderEditCell({ row, onRowChange }) {
      const options = getOptions(row) || [];
      const current = row[key] || '';
      const list = current && !options.includes(current) ? [current, ...options] : options;
      return (
        <select
          autoFocus
          className={selectInputBase}
          value={current}
          onChange={(e) => {
            const value = e.target.value;
            onRowChange({ ...row, [key]: value, ...(onPick?.(row, value) || {}) }, true);
          }}
        >
          <option value="">{emptyLabel}</option>
          {list.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    },
  };
}

// Boolean columns commit immediately on click — no separate edit mode, matching
// the spreadsheet-native feel of clicking a checkbox directly.
export function booleanColumn(key, name, { editable = true, width, onToggle } = {}) {
  return {
    key, name, width, editable, resizable: true,
    renderCell({ row, onRowChange }) {
      return (
        <div className="w-full h-full flex items-center justify-center">
          <input
            type="checkbox"
            checked={!!row[key]}
            disabled={!editable}
            onChange={(e) => {
              const next = { ...row, [key]: e.target.checked };
              onRowChange(onToggle ? onToggle(next, e.target.checked) : next);
            }}
          />
        </div>
      );
    },
  };
}

/**
 * FK-picker column — writes the id + cached display-name columns together in a
 * single onRowChange call (per this repo's cached-name convention, see CLAUDE.md).
 *
 * @param key - the FK id column (e.g. 'branch_id')
 * @param nameKey - the cached display-name column (e.g. 'branch_name'), or null
 *   if this FK has no cached-name sibling (e.g. project_contacts.task_id) — in
 *   that case pass `noNameColumn: true` and a `lookupLabelFn` that resolves a
 *   display label live from `lookupArray` for renderCell.
 * @param lookupArray - already-loaded array of option records (e.g. branches)
 * @param getOptionLabel - (option) => string, display label for each option
 */
export function fkPickerColumn(key, nameKey, name, lookupArray, getOptionLabel, { editable = true, width, noNameColumn = false } = {}) {
  return {
    key, name, width, editable, resizable: true,
    renderCell({ row }) {
      let label;
      if (noNameColumn) {
        const match = lookupArray.find((o) => o.id === row[key]);
        label = match ? getOptionLabel(match) : '';
      } else {
        label = row[nameKey] || '';
      }
      return <div className="w-full px-2 truncate">{label || '-'}</div>;
    },
    renderEditCell({ row, onRowChange }) {
      return (
        <select
          autoFocus
          className={selectInputBase}
          value={row[key] || ''}
          onChange={(e) => {
            const id = e.target.value || null;
            const match = lookupArray.find((o) => o.id === id);
            const next = noNameColumn
              ? { ...row, [key]: id }
              : { ...row, [key]: id, [nameKey]: match ? getOptionLabel(match) : '' };
            onRowChange(next, true);
          }}
        >
          <option value="">-</option>
          {lookupArray.map((o) => <option key={o.id} value={o.id}>{getOptionLabel(o)}</option>)}
        </select>
      );
    },
  };
}
