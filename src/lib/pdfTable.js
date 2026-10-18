/**
 * Reads a table out of a PDF into rows shaped like XLSX.utils.sheet_to_json:
 * [{ <header>: value }], so the same column mapping serves Excel and PDF.
 *
 * A PDF has no table, only text placed on the page, so the table is rebuilt:
 *  - text pieces on the same height form a line; pieces far apart on a line
 *    are separate cells (RTL: right to left);
 *  - the first line in which isHeader() recognises at least two cells is the
 *    header; every later piece goes to the header column nearest to it, and a
 *    line with nothing in the first column continues the previous row (text
 *    wrapped inside a cell);
 *  - no header found: every line is one row under fallbackHeader.
 * Some PDFs store Hebrew in visual (reversed) order; if the header is only
 * recognised reversed, every Hebrew piece is reversed back.
 *
 * pdfjs-dist is loaded only when a PDF is actually read.
 */
const HEBREW = /[֐-׿]/;
const reverseHebrew = (s) => (HEBREW.test(s) ? [...s].reverse().join('') : s);

async function pageLines(pdf) {
  const lines = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const { items } = await page.getTextContent();
    const pieces = items
      .filter(it => it.str && it.str.trim())
      .map(it => ({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width || 0, h: Math.abs(it.transform[3]) || 10 }));
    // top to bottom, then right to left
    pieces.sort((a, b) => b.y - a.y || b.x - a.x);
    const pageLinesList = [];
    for (const it of pieces) {
      const line = pageLinesList.find(l => Math.abs(l.y - it.y) <= Math.max(2, it.h * 0.35));
      if (line) line.items.push(it); else pageLinesList.push({ y: it.y, items: [it] });
    }
    for (const l of pageLinesList) {
      l.items.sort((a, b) => (b.x + b.w) - (a.x + a.w));
      // merge pieces closer than ~a character into one cell
      const cells = [];
      for (const it of l.items) {
        const last = cells[cells.length - 1];
        const gap = last ? last.left - (it.x + it.w) : Infinity;
        if (last && gap < it.h * 1.2) {
          last.parts.push(it.str);
          last.left = Math.min(last.left, it.x);
        } else {
          cells.push({ parts: [it.str], left: it.x, right: it.x + it.w });
        }
      }
      lines.push(cells.map(c => ({ text: c.parts.join(' ').replace(/\s+/g, ' ').trim(), center: (c.left + c.right) / 2 })).filter(c => c.text));
    }
  }
  return lines.filter(l => l.length);
}

export async function pdfToRows(arrayBuffer, { isHeader, fallbackHeader }) {
  const pdfjs = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  let lines = await pageLines(pdf);

  const findHeader = (ls) => ls.findIndex(l => l.filter(c => isHeader(c.text)).length >= 2);
  let h = findHeader(lines);
  if (h < 0) {
    const reversed = lines.map(l => l.map(c => ({ ...c, text: reverseHebrew(c.text) })));
    const hr = findHeader(reversed);
    if (hr >= 0) { lines = reversed; h = hr; }
  }

  if (h < 0) {
    return lines.map(l => ({ [fallbackHeader]: l.map(c => c.text).join(' ') }));
  }

  const header = lines[h];
  const nearest = (center) => header.reduce((best, c, i) => (Math.abs(c.center - center) < Math.abs(header[best].center - center) ? i : best), 0);
  const rows = [];
  for (const line of lines.slice(h + 1)) {
    // a repeated header (next page) is skipped
    if (line.filter(c => isHeader(c.text)).length >= 2) continue;
    const row = {};
    for (const c of line) {
      const key = header[nearest(c.center)].text;
      row[key] = row[key] ? `${row[key]} ${c.text}` : c.text;
    }
    const firstKey = header[0].text;
    const prev = rows[rows.length - 1];
    if (prev && !row[firstKey] && Object.keys(row).length < header.length / 2) {
      for (const [k, v] of Object.entries(row)) prev[k] = prev[k] ? `${prev[k]} ${v}` : v;
    } else {
      rows.push(row);
    }
  }
  return rows;
}
