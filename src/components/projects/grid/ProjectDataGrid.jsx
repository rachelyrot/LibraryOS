import { DataGrid } from 'react-data-grid';
import { Button } from '@/components/ui/button';
import { Trash2, Plus } from 'lucide-react';

/**
 * Shared inline-editable grid wrapper for the Projects module (see plan §11).
 *
 * `readOnly` controls only the "+ add row" toolbar button and the delete-icon
 * column — it does NOT force-override individual columns' own `editable` flags,
 * since some columns need finer-grained permission gating than the rest of the
 * grid (e.g. TasksTab's status column stays editable for any logged-in user via
 * canUpdateTaskStatus, independent of canCreateTasks gating the rest of the row).
 * Callers set each column's `editable` from the appropriate `can*` check.
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
  const gridColumns = onDeleteRow && !readOnly
    ? [
        ...columns,
        {
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
        },
      ]
    : columns;

  return (
    <div className="space-y-2">
      {onAddRow && !readOnly && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={onAddRow} className="gap-1.5">
            <Plus className="w-3.5 h-3.5" /> {addLabel}
          </Button>
        </div>
      )}
      <div className="border border-border rounded-xl overflow-hidden">
        <DataGrid
          className="rdg-light"
          direction="rtl"
          columns={gridColumns}
          rows={rows}
          onRowsChange={onRowsChange}
          rowKeyGetter={rowKeyGetter}
          rowHeight={40}
          headerRowHeight={38}
          renderers={{ noRowsFallback: <div className="text-center py-12 text-muted-foreground w-full">{emptyMessage}</div> }}
          style={{ blockSize: rows.length === 0 ? 200 : Math.min(600, 38 + rows.length * 40 + 2) }}
        />
      </div>
    </div>
  );
}
