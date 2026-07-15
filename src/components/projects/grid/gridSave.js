import { toast } from 'sonner';

/**
 * Builds an onRowsChange handler for react-data-grid that persists only the
 * single changed field per commit via `.update(id, {...})` (not the whole row,
 * to avoid clobbering concurrent edits to other fields) — see plan §11.
 *
 * react-data-grid is a *controlled* component: it doesn't keep its own row
 * state, it just calls back with the next array and expects the parent to
 * feed it back in via the `rows` prop. `setRows` is the full (unfiltered)
 * state setter for that data (e.g. `setTasks`) — the changed row is merged
 * into it *by id*, not replaced wholesale, so this stays correct even when
 * the grid is showing a filtered subset of the full array.
 *
 * `pairedFields` lets an fkPicker column's id write also persist its cached
 * display-name sibling in the same request (e.g. { parent_domain_id: 'parent_domain_name' }).
 *
 * `computeExtra` lets one column's edit derive & persist additional dependent
 * fields together in the same request — e.g. toggling ProjectMilestone.is_completed
 * also needs to set status/completed_date/progress_percentage together, mirroring
 * the combined logic the old toggleComplete() dialog-era handler used to do:
 *   { is_completed: (row) => ({ status: row.is_completed ? 'completed' : 'not_started', ... }) }
 *
 * On failure: toast + call onError() (callers pass their `onLoad` refetch to
 * revert the grid's optimistic local state back to server truth).
 */
export function makeGridSaveHandler(entityApi, setRows, { pairedFields = {}, computeExtra = {}, onError } = {}) {
  return (rows, { indexes, column }) => {
    const idx = indexes[0];
    const row = rows[idx];
    const key = column.key;

    setRows((prev) => prev.map((r) => (r.id === row.id ? row : r)));

    const payload = { [key]: row[key] };
    const pairedKey = pairedFields[key];
    if (pairedKey) payload[pairedKey] = row[pairedKey];
    if (computeExtra[key]) Object.assign(payload, computeExtra[key](row));

    entityApi.update(row.id, payload).catch(() => {
      toast.error('שגיאה בשמירה');
      onError?.();
    });
  };
}
