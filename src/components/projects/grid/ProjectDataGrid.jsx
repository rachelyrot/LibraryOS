import { useState } from 'react';
import DataGrid from 'react-data-grid';
import { Button } from '@/components/ui/button';
import { Trash2, Plus, Pencil, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Shared inline-editable grid wrapper for the Projects module (see plan §11).
 *
 * `readOnly` controls only the "+ add row" toolbar button and the delete-icon
 * column — it does NOT force-override individual columns' own `editable` flags,
 * since some columns need finer-grained permission gating than the rest of the
 * grid (e.g. TasksTab's status column stays editable for any logged-in user via
 * canUpdateTaskStatus, independent of canCreateTasks gating the rest of the row).
 * Callers set each column's `editable` from the appropriate `can*` check.
 *
 * A row is edited only after its pencil button is pressed — clicking or
 * double-clicking a cell does nothing until then, so a stray click can't change
 * data. One row at a time; ✓ ends editing. Gating is done here, once, for every
 * grid in the module:
 *   - columns with a renderEditCell (text, number, date, enum, FK picker) get
 *     `editable` narrowed to the row being edited;
 *   - columns that edit from renderCell itself (checkboxes, popover editors such
 *     as files / budget sources) are rendered inert outside the edited row.
 */
export default function ProjectDataGrid({
  rows,
  columns,
  onRowsChange,
  readOnly = false,
  onAddRow,
  addLabel = 'הוסף שורה',
  onDeleteRow,
  emptyMessage = 'אין נתונים',
  rowKeyGetter = (row) => row.id,
}) {
  const [editingKey, setEditingKey] = useState(null);
  const isEditing = (row) => editingKey != null && rowKeyGetter(row) === editingKey;
  const canEditColumn = (col, row) => (typeof col.editable === 'function' ? col.editable(row) : !!col.editable);
  // popoverEditor — עמודות שעורכות בחלונית מתוך התא (popoverCellEditors), ולכן
  // מסומנות editable: false מבחינת הטבלה; גם הן נפתחות רק בשורה שבעריכה
  const hasEditableColumns = columns.some(c => c.editable || c.popoverEditor);

  const gatedColumns = columns.map(col => {
    if (col.popoverEditor) {
      return {
        ...col,
        renderCell: (props) => (isEditing(props.row)
          ? col.renderCell(props)
          : <div className="w-full h-full pointer-events-none">{col.renderCell(props)}</div>),
      };
    }
    if (!col.editable) return col;
    const gated = { ...col, editable: (row) => isEditing(row) && canEditColumn(col, row) };
    // עמודה שעורכת מתוך התא עצמו (תיבת סימון, חלונית) — לא לחיצה מחוץ לעריכה
    if (col.renderCell && !col.renderEditCell) {
      gated.renderCell = (props) => (isEditing(props.row)
        ? col.renderCell(props)
        : <div className="w-full h-full pointer-events-none">{col.renderCell(props)}</div>);
    }
    return gated;
  });

  const editColumn = hasEditableColumns ? [{
    key: '__edit',
    name: '',
    width: 44,
    resizable: false,
    frozen: true,
    renderCell({ row }) {
      const editing = isEditing(row);
      return (
        <div className="w-full h-full flex items-center justify-center">
          <button
            type="button"
            className={cn('rounded p-1', editing ? 'text-green-600 hover:bg-green-50' : 'text-muted-foreground hover:text-foreground hover:bg-muted')}
            onClick={() => setEditingKey(editing ? null : rowKeyGetter(row))}
            aria-label={editing ? 'סיום עריכה' : 'עריכת שורה'}
            title={editing ? 'סיום עריכה' : 'עריכת שורה'}
          >
            {editing ? <Check className="w-4 h-4" /> : <Pencil className="w-3.5 h-3.5" />}
          </button>
        </div>
      );
    },
  }] : [];

  const deleteColumn = onDeleteRow && !readOnly ? [{
    key: '__delete',
    name: '',
    width: 44,
    resizable: false,
    renderCell({ row }) {
      return (
        <div className="w-full h-full flex items-center justify-center">
          <button
            type="button"
            className="text-red-400 hover:text-red-500"
            onClick={() => onDeleteRow(row)}
            aria-label="מחק שורה"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      );
    },
  }] : [];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        {hasEditableColumns
          ? <p className="text-xs text-muted-foreground">לעריכת שורה לחצי על <Pencil className="inline w-3 h-3" /> בתחילת השורה, ובסיום על <Check className="inline w-3 h-3" /></p>
          : <span />}
        {onAddRow && !readOnly && (
          <Button variant="outline" size="sm" onClick={onAddRow} className="gap-1.5">
            <Plus className="w-3.5 h-3.5" /> {addLabel}
          </Button>
        )}
      </div>
      <div className="border border-border rounded-xl overflow-hidden">
        <DataGrid
          className="rdg-light"
          direction="rtl"
          columns={[...editColumn, ...gatedColumns, ...deleteColumn]}
          rows={rows}
          onRowsChange={onRowsChange}
          rowKeyGetter={rowKeyGetter}
          rowClass={(row) => (isEditing(row) ? 'rdg-row-editing' : undefined)}
          rowHeight={40}
          headerRowHeight={40}
          renderers={{ noRowsFallback: <div className="text-center py-12 text-muted-foreground w-full">{emptyMessage}</div> }}
          style={{ blockSize: rows.length === 0 ? 200 : Math.min(600, 40 + rows.length * 40 + 2) }}
        />
      </div>
    </div>
  );
}
