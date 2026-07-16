import * as XLSX from 'xlsx';

// Shared fuzzy Excel/CSV column-detection helpers, factored out of BookListForm.jsx
// (the book-list importer) so Inventory.jsx's importer can reuse the same logic
// instead of relying on Base44's AI-based extraction. See plan section 6 of
// .claude/plans/replicated-moseying-reef.md.

// Remove hidden/zero-width/RTL/non-printable characters, collapse whitespace, trim,
// and strip surrounding quote characters (incl. Hebrew geresh/gershayim).
export function cleanColumnName(raw) {
  if (!raw) return '';
  let s = raw.replace(/[​-‍﻿‎‏ ]/g, ' ');
  s = s.replace(/\s+/g, ' ');
  s = s.trim();
  s = s.replace(/^[‘’“”׳״'"](.*)[‘’“”׳״'"]$/, '$1');
  return s;
}

// Find the original row key whose cleaned header name matches one of columnMap[field]'s candidates.
export function detectKey(row, columnMap, field) {
  const candidates = columnMap[field];
  if (!candidates) return null;
  const originalKeys = Object.keys(row);
  for (const ok of originalKeys) {
    const cleaned = cleanColumnName(ok).toLowerCase();
    if (!cleaned) continue;
    for (const c of candidates) {
      if (cleanColumnName(c).toLowerCase() === cleaned) return ok;
    }
  }
  return null;
}

export function detectColumns(row, columnMap) {
  const mapping = {};
  for (const field of Object.keys(columnMap)) {
    const src = detectKey(row, columnMap, field);
    if (src) mapping[field] = cleanColumnName(src);
  }
  return mapping;
}

// Find a column by scanning its VALUES rather than its header -- for files where the header
// cell is blank or unrecognized but the column's cells contain known marker words (e.g. a
// "ניילון" column with no header at all, sitting next to properly-labeled columns). Requires
// every non-empty cell in the candidate column to match one of the signals, so a column that
// merely happens to contain one matching cell (title text, free-form notes, etc.) isn't
// mistaken for the marker column.
export function detectKeyByValue(rows, valueSignals, excludeKeys = []) {
  if (!rows || rows.length === 0) return null;
  const variants = valueSignals.map((s) => cleanColumnName(s).toLowerCase());
  const keys = Object.keys(rows[0]).filter((k) => !excludeKeys.includes(k));
  let best = null;
  for (const key of keys) {
    let nonEmpty = 0;
    let matches = 0;
    for (const row of rows) {
      const raw = row[key];
      if (raw === '' || raw == null) continue;
      nonEmpty++;
      const cleaned = cleanColumnName(String(raw)).toLowerCase();
      if (variants.some((v) => cleaned === v || cleaned.includes(v))) matches++;
    }
    if (nonEmpty > 0 && matches === nonEmpty && (!best || nonEmpty > best.nonEmpty)) {
      best = { key, nonEmpty };
    }
  }
  return best ? best.key : null;
}

// Resolve field -> raw column key for every field in columnMap: header-name matching first,
// falling back to detectKeyByValue (scanning cell values) for fields listed in valueSignalMap
// when no header matched. Compute this once for the whole file rather than per row, so the
// same column is used consistently for every data row.
export function resolveColumnKeys(dataRows, columnMap, valueSignalMap = {}) {
  if (!dataRows || dataRows.length === 0) return {};
  const resolved = {};
  const usedKeys = new Set();
  for (const field of Object.keys(columnMap)) {
    const key = detectKey(dataRows[0], columnMap, field);
    if (key) { resolved[field] = key; usedKeys.add(key); }
  }
  for (const field of Object.keys(valueSignalMap)) {
    if (resolved[field]) continue;
    const key = detectKeyByValue(dataRows, valueSignalMap[field], Array.from(usedKeys));
    if (key) { resolved[field] = key; usedKeys.add(key); }
  }
  return resolved;
}

export function looksLikeHeaderRow(row, headerSignals) {
  const vals = Object.values(row).map((v) => cleanColumnName(String(v || '')).toLowerCase());
  return headerSignals.some((s) => vals.includes(cleanColumnName(s).toLowerCase()));
}

// Scan the first ~10 rows of the sheet for a cell matching one of the anchor field's
// candidates -- handles files where row 0 is a title/note rather than the real header.
export function findHeaderRowIndex(ws, anchorCandidates) {
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  const variants = anchorCandidates.map((s) => cleanColumnName(s).toLowerCase());
  for (let r = range.s.r; r <= Math.min(range.s.r + 9, range.e.r); r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (!cell) continue;
      const val = cleanColumnName(String(cell.v || '')).toLowerCase();
      if (variants.includes(val)) return r;
    }
  }
  return -1;
}

/**
 * Reads an uploaded Excel/CSV File and returns the raw data rows (original column
 * keys -- not yet mapped to canonical field names) plus which canonical fields were
 * detected in the header. Re-scans for the real header row if `anchorField` isn't
 * found in the first pass (handles a leading title/note row before the header).
 *
 * @param {File} file
 * @param {Object} columnMap - field -> array of header-name candidates (Hebrew/English)
 * @param {string} anchorField - required field used to confirm/detect the header row
 * @param {string[]} headerSignals - values that indicate a row is a header row, not data
 */
export async function readExcelRows(file, { columnMap, anchorField, headerSignals }) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];

  let rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
  if (rows.length === 0) {
    return { dataRows: [], detectedColumns: {}, allColumns: [] };
  }

  let dataRows = rows.filter((r) => !looksLikeHeaderRow(r, headerSignals));
  let cols = dataRows.length > 0 ? detectColumns(dataRows[0], columnMap) : {};

  if (!cols[anchorField]) {
    const headerRowIdx = findHeaderRowIndex(ws, columnMap[anchorField] || []);
    if (headerRowIdx > 0) {
      rows = XLSX.utils.sheet_to_json(ws, { defval: '', range: headerRowIdx });
      dataRows = rows.filter((r) => !looksLikeHeaderRow(r, headerSignals));
      cols = dataRows.length > 0 ? detectColumns(dataRows[0], columnMap) : {};
    }
  }

  const nonEmptyDataRows = dataRows.filter((r) => Object.values(r).some((v) => v !== '' && v != null));

  return {
    dataRows: nonEmptyDataRows,
    detectedColumns: cols,
    allColumns: Object.keys(rows[0] || {}),
  };
}
