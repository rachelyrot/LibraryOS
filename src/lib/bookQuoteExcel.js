import * as XLSX from 'xlsx';

// ── Nylon preference helpers ──────────────────────────────────
export const NYLON_VALUES = {
  with_nylon: 'עם ניילון',
  without_nylon: 'בלי ניילון',
  any: 'לא משנה / לפי הזול',
  unknown: 'דורש בדיקה',
};

export function nylonLabel(val) {
  return NYLON_VALUES[normalizeNylon(val)] || NYLON_VALUES.any;
}

export function normalizeNylon(val) {
  if (val == null || val === '' || val === 'any') return 'any';
  if (val === 'with_nylon') return 'with_nylon';
  if (val === 'without_nylon') return 'without_nylon';
  if (val === 'unknown') return 'unknown';
  // Numeric: any non-zero number → with_nylon (some Excel files use 1/true for nylon)
  if (typeof val === 'number') return val !== 0 ? 'with_nylon' : 'any';
  if (val === true) return 'with_nylon';
  if (val === false) return 'without_nylon';
  const s = String(val).trim().toLowerCase();
  if (!s || s === '0') return 'any';
  if (s.includes('בלי') || s.includes('ללא') || s.includes('without') || s === 'לא' || s === 'no') return 'without_nylon';
  if (s.includes('לא משנה') || s.includes('זול') || s.includes('any') || s.includes('לפי')) return 'any';
  // Any other non-empty string (ניילון, ניילן, עם ניילון, כן, yes, 1, etc.) → with_nylon
  return 'with_nylon';
}

// ── ניילון as a checkbox ──────────────────────────────────────
//
// The stored field stays the four-value string it has always been, because the
// supplier price comparison genuinely needs three states: price_with_nylon,
// price_without_nylon, and 'any' meaning "whichever is cheaper" (see
// getEffectivePrice). The *editor* is a checkbox, so these two helpers are the
// bridge between the two shapes.
//
// A legacy 'any'/'unknown' row shows unchecked, and stays 'any' in storage until
// someone actually toggles the box — flipping it on load would silently rewrite
// "לפי הזול" rows into "בלי ניילון" and change which supplier wins.

/** Should the ניילון checkbox be checked for this stored value? */
export function isNylonChecked(val) {
  return normalizeNylon(val) === 'with_nylon';
}

/** Stored value for a ניילון checkbox state. */
export function nylonFromChecked(checked) {
  return checked ? 'with_nylon' : 'without_nylon';
}

// ── כריכה ─────────────────────────────────────────────────────
//
// Plain boolean, unlike ניילון: it's a yes/no requirement passed on to the
// supplier, not something the quote is priced two ways for. Lives inside the
// `books` jsonb array, so it needed no migration.

export function isBindingChecked(val) {
  if (typeof val === 'boolean') return val;
  if (val == null || val === '') return false;
  if (typeof val === 'number') return val !== 0;
  const s = String(val).trim().toLowerCase();
  if (!s || s === '0' || s === 'לא' || s === 'no' || s === 'false') return false;
  if (s.includes('בלי') || s.includes('ללא') || s.includes('without')) return false;
  return true;
}

export function bindingLabel(val) {
  return isBindingChecked(val) ? 'עם כריכה' : 'בלי כריכה';
}

/**
 * Get the effective price for a book from a supplier quote, based on nylon preference.
 * - with_nylon → price_with_nylon
 * - without_nylon → price_without_nylon
 * - any → minimum of available prices
 */
export function getEffectivePrice(book, quote) {
  if (!quote) return undefined;
  const nylon = normalizeNylon(book?.nylon_required);
  if (nylon === 'with_nylon') return quote.price_with_nylon;
  if (nylon === 'without_nylon') return quote.price_without_nylon;
  const prices = [quote.price_with_nylon, quote.price_without_nylon].filter(p => p != null);
  if (prices.length === 0) return undefined;
  return Math.min(...prices);
}

/**
 * The Excel file sent to a supplier, in the exact format the book suppliers
 * already use for their quotes (taken from real returned files):
 *   שם כותר | מחבר/ת | הו"ל | ניילון/למינציה | מחיר למינציה | כמות |
 *   מק"ט פנימי <ספק> | מחיר <ספק> כולל כריכה וניילון כולל מע"מ | סה"כ לשורה <ספק>
 * The supplier's name is part of the last three headers, so each supplier gets
 * their own file. The supplier fills the catalog number and the price; the
 * line total is a formula (quantity × price). parseSupplierQuote reads this
 * format back as is (title from "שם כותר", price from the column with prices).
 * Without a supplier name the headers just drop it.
 * Returns a Blob.
 */
export function generateSupplierExcel(books, supplierName = '') {
  const s = String(supplierName || '').trim();
  const withName = (base, rest = '') => [base, s, rest].filter(Boolean).join(' ');
  const header = [
    'שם כותר', 'מחבר/ת', 'הו"ל', 'ניילון/למינציה', 'מחיר למינציה', 'כמות',
    withName('מק"ט פנימי'), withName('מחיר', 'כולל כריכה וניילון כולל מע"מ'), withName('סה"כ לשורה'),
  ];
  const rows = books.map(b => [
    b.title || '', b.author || '', b.publisher || '',
    normalizeNylon(b.nylon_required) === 'with_nylon' ? 'ניילון' : '',
    '', Number(b.requested_quantity) || 1, '', '', '',
  ]);
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  // כמו בקובץ הכללי של דני ספרים (xlsx/קובץ-כללי-להצעה-דני-ספרים.xlsx):
  // סה"כ לשורה = כמות × מחיר, 0 כשאין עדיין מחיר. נוסחה צריכה ערך שמור, אחרת
  // היא לא נכתבת לקובץ.
  rows.forEach((_, i) => {
    const r = i + 2;
    ws[`I${r}`] = { t: 'n', v: 0, f: `F${r}*H${r}` };
  });
  // רוחבי העמודות כמו בקובץ של דני ספרים
  ws['!cols'] = [{ wch: 50 }, { wch: 15.67 }, { wch: 3.33 }, { wch: 10 }, { wch: 10.17 }, { wch: 3.67 }, { wch: 17 }, { wch: 33.5 }, { wch: 17.83 }];
  const wb = XLSX.utils.book_new();
  // שם הגיליון הוא שם הספק, כמו אצלם (עד 31 תווים, בלי תווים שאקסל אוסר)
  const sheetName = (s.replace(/[\\/?*[\]:]/g, '').slice(0, 31)) || 'הצעת מחיר';
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  wb.Workbook = { Views: [{ RTL: true }] };
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/** File name for a supplier's quote file: "הצעת_מחיר_<רשימה>_<ספק>.xlsx". */
export function supplierExcelName(listTitle, supplierName) {
  const clean = (x) => String(x || '').replace(/[\\/:*?"<>|]/g, '').trim();
  return `הצעת_מחיר_${[clean(listTitle) || 'רשימה', clean(supplierName)].filter(Boolean).join('_')}.xlsx`;
}

/**
 * Trigger browser download of a blob.
 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Column detection for supplier quote files
const QUOTE_COLUMN_MAP = {
  title: ['שם ספר', 'שם הספר', 'כותר', 'כותרת', 'title', 'שם'],
  author: ['מחבר', 'author', 'סופר'],
  publisher: ['הוצאה', 'הוצאה לאור', 'publisher', 'הוצאת'],
  isbn: ['isbn', 'מסת"ב', 'מסתב', 'ברקוד', 'מסת״ב'],
  price_with_nylon: ['מחיר עם ניילון', 'מחיר עם ניילון', 'price with nylon'],
  price_without_nylon: ['מחיר בלי ניילון', 'מחיר ללא ניילון', 'price without nylon'],
  availability: ['זמינות', 'availability'],
  delivery_time: ['זמן אספקה', 'delivery time', 'זמן אספקה'],
  notes: ['הערות ספק', 'הערות', 'notes', 'comments'],
};

function cleanKey(s) {
  return String(s || '')
    .replace(/[\u200B-\u200D\uFEFF\u200E\u200F\u00A0\u202A-\u202E\u2060-\u206F\u00AD]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function findKey(row, field) {
  const candidates = QUOTE_COLUMN_MAP[field];
  if (!candidates) return null;
  const keys = Object.keys(row);
  // 1. Exact match
  for (const key of keys) {
    const ck = cleanKey(key);
    for (const c of candidates) {
      if (cleanKey(c) === ck) return key;
    }
  }
  // 2. Partial match — one contains the other (handles truncated headers like "מחיר בלי ניי")
  for (const key of keys) {
    const ck = cleanKey(key);
    if (ck.length < 4) continue;
    for (const c of candidates) {
      const cc = cleanKey(c);
      if (cc.length < 4) continue;
      if (cc.includes(ck) || ck.includes(cc)) return key;
    }
  }
  return null;
}

/**
 * A price cell as a number. Handles "₪ 45.90", "45,90" (decimal comma) and
 * "1,234.50" (thousands comma) — stripping every non-digit used to turn
 * "45,90" into 4590.
 */
export function parsePrice(v) {
  if (v == null || v === '') return undefined;
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  let s = String(v).replace(/[^\d.,-]/g, '');
  if (s.includes(',') && s.includes('.')) s = s.replace(/,/g, '');          // 1,234.50
  else if (/,\d{1,2}$/.test(s)) s = s.replace(',', '.');                     // 45,90
  else s = s.replace(/,/g, '');                                              // 1,234
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : undefined;
}

// A supplier's own file usually has one price column, not our two nylon
// columns: "מחיר", "מחיר נטו", "מחיר ליחידה", "מחיר דני ספרים כולל כריכה
// וניילון...". Totals and list prices are skipped — they are not the per-copy
// price we compare.
//
// The *name* alone can't pick the column: a real supplier file has both
// "מחיר למינציה" (a lamination surcharge, mostly empty) and the real price, and
// the surcharge came first. So among the price-like columns the one with the
// most numeric values wins, and a net / per-unit name only breaks ties.
const GENERIC_PRICE = /מחיר|price|עלות/i;
const NOT_UNIT_PRICE = /סה"?כ|סה״כ|total|מחירון|לפני הנחה|כמות/i;
const PREFERRED_PRICE = /נטו|אחרי הנחה|לאחר הנחה|ליחידה|net/i;
function findGenericPriceKey(keys, rows = []) {
  const candidates = keys.filter(k => GENERIC_PRICE.test(cleanKey(k)) && !NOT_UNIT_PRICE.test(cleanKey(k)));
  const filled = (k) => rows.filter(r => parsePrice(r[k]) != null).length;
  const score = (k) => filled(k) * 2 + (PREFERRED_PRICE.test(cleanKey(k)) ? 1 : 0);
  return candidates.sort((a, b) => score(b) - score(a))[0] || null;
}

const TITLE_COL = 'שם ספר';
const PRICE_COL = 'מחיר';
const QTY_COL = 'כמות';
const hasLetters = (v) => /[\p{L}]{2,}/u.test(String(v ?? '')) && parsePrice(v) == null;

/**
 * A sheet with no header row at all (a real supplier file: catalog no., title,
 * nylon, lamination, qty, "₪ 136.95", "₪ 2,738.96"). Columns are recognized
 * from their contents:
 *   - title: the column with the most longish text cells
 *   - price × qty = total: the triple of numeric columns where that holds for
 *     most rows gives price and qty — which tells the per-copy price apart from
 *     the line total and the catalog number without guessing
 *   - failing that, the numeric column with ₪ / decimals and the lowest median
 * Returns rows keyed by the names parseSupplierQuote already knows, or [].
 */
function inferHeaderless(grid) {
  const data = grid.filter(r => r.filter(c => String(c).trim() !== '').length >= 3);
  if (data.length === 0) return [];
  const width = Math.max(...data.map(r => r.length));
  const col = (i) => data.map(r => r[i]);
  const share = (i, pred) => col(i).filter(pred).length / data.length;

  let titleIdx = -1;
  let best = 0;
  for (let i = 0; i < width; i++) {
    const texts = col(i).filter(hasLetters);
    const score = (texts.length / data.length) * (texts.reduce((s, t) => s + String(t).trim().length, 0) / (texts.length || 1));
    if (score > best) { best = score; titleIdx = i; }
  }
  if (titleIdx < 0) return [];

  const numeric = [];
  for (let i = 0; i < width; i++) if (i !== titleIdx && share(i, v => parsePrice(v) != null) >= 0.6) numeric.push(i);
  let priceIdx = -1;
  let qtyIdx = -1;
  let bestFit = 0.6;
  for (const p of numeric) for (const q of numeric) for (const t of numeric) {
    if (p === q || p === t || q === t) continue;
    const fit = data.filter(r => {
      const P = parsePrice(r[p]); const Q = parsePrice(r[q]); const T = parsePrice(r[t]);
      return P != null && Q != null && T != null && Q > 0 && Q < 1000 && Math.abs(P * Q - T) <= Math.max(1, T * 0.01);
    }).length / data.length;
    if (fit > bestFit) { bestFit = fit; priceIdx = p; qtyIdx = q; }
  }
  if (priceIdx < 0) {
    const median = (i) => { const v = col(i).map(parsePrice).filter(n => n != null).sort((a, b) => a - b); return v[Math.floor(v.length / 2)] ?? Infinity; };
    const moneyLike = numeric.filter(i => share(i, v => /₪|\.\d{1,2}\b/.test(String(v))) >= 0.5);
    priceIdx = moneyLike.sort((a, b) => median(a) - median(b))[0] ?? -1;
  }
  if (priceIdx < 0) return [];
  return data.map(r => ({ [TITLE_COL]: r[titleIdx], [PRICE_COL]: r[priceIdx], [QTY_COL]: qtyIdx >= 0 ? r[qtyIdx] : '' }));
}

/**
 * Rows of a supplier's sheet as objects keyed by its header row — which is not
 * always the first row: suppliers put a logo, title or date above it, and some
 * files have no header row at all (then see inferHeaderless). The header is the
 * first of the top rows that has a title-like column and a price-like column.
 */
export function sheetToQuoteRows(ws) {
  const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const isHeader = (row) => {
    const cells = row.map(c => cleanKey(c));
    const hasTitle = cells.some(c => QUOTE_COLUMN_MAP.title.some(t => c === cleanKey(t) || (c.length >= 4 && c.includes(cleanKey(t)))));
    const hasPrice = cells.some(c => GENERIC_PRICE.test(c));
    return hasTitle && hasPrice;
  };
  const headerIdx = grid.slice(0, 20).findIndex(isHeader);
  if (headerIdx < 0) return inferHeaderless(grid);
  const header = (grid[headerIdx] || []).map((h, i) => String(h || '').trim() || `__col${i}`);
  return grid.slice(headerIdx + 1)
    .filter(r => r.some(c => String(c).trim() !== ''))
    .map(r => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

/**
 * Parse supplier quote rows (see sheetToQuoteRows) into quote entries:
 * { title, author, publisher, isbn, price_with_nylon, price_without_nylon,
 *   availability, delivery_time, notes }.
 * With no nylon columns, a single price column fills both prices — the
 * supplier quoted one price for the book. Nylon columns found by name but left
 * empty don't count, so the generic price is used instead.
 */
export function parseSupplierQuote(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const keys = Object.keys(rows[0]);
  const hasValues = (k) => k && rows.some(r => parsePrice(r[k]) != null);
  const withKey = hasValues(findKey(rows[0], 'price_with_nylon')) ? findKey(rows[0], 'price_with_nylon') : null;
  const withoutKey = hasValues(findKey(rows[0], 'price_without_nylon')) ? findKey(rows[0], 'price_without_nylon') : null;
  const genericKey = !withKey && !withoutKey ? findGenericPriceKey(keys, rows) : null;
  return rows.map(row => {
    const g = (f) => { const k = findKey(row, f); return k ? row[k] : undefined; };
    const generic = genericKey ? parsePrice(row[genericKey]) : undefined;
    return {
      title: String(g('title') || '').trim(),
      author: String(g('author') || '').trim(),
      publisher: String(g('publisher') || '').trim(),
      isbn: String(g('isbn') || '').trim(),
      price_with_nylon: withKey ? parsePrice(row[withKey]) : generic,
      price_without_nylon: withoutKey ? parsePrice(row[withoutKey]) : generic,
      availability: String(g('availability') || '').trim(),
      delivery_time: String(g('delivery_time') || '').trim(),
      notes: String(g('notes') || '').trim(),
    };
  }).filter(r => r.title || r.isbn);
}

/** Which price columns a supplier file was read with — for the upload message. */
export function describePriceColumns(rows) {
  if (!rows?.length) return null;
  const hasValues = (k) => k && rows.some(r => parsePrice(r[k]) != null);
  const w = findKey(rows[0], 'price_with_nylon');
  const wo = findKey(rows[0], 'price_without_nylon');
  if (hasValues(w) || hasValues(wo)) return [w, wo].filter(hasValues).join(' / ');
  return findGenericPriceKey(Object.keys(rows[0]), rows);
}

/**
 * Stable identity for a book inside a list's `books` jsonb array.
 *
 * The entries have no id of their own, so a book is identified by ISBN when it
 * has one and by title otherwise. Used to tell whether a book on the list has
 * already gone out in a quote-request cycle — see BookListTab's send lock.
 *
 * Deliberately stricter than matchQuoteToBook's fuzzy matching: that one tries
 * to pair a supplier's spreadsheet row with our book despite typos, while this
 * one compares our own data with itself, where an exact match is expected and a
 * false positive would silently block a legitimate order.
 */
export function bookKey(book) {
  const isbn = String(book?.isbn || '').replace(/[^0-9Xx]/g, '').toUpperCase();
  if (isbn) return `isbn:${isbn}`;
  return `title:${String(book?.title || '').trim().toLowerCase()}`;
}

/**
 * Match a parsed quote row to a book in the request.
 * Returns { matched: boolean, bookIndex: number|null }
 * 1. ISBN match (if both have ISBN)
 * 2. title + author + publisher match
 * 3. no confident match → matched: false
 */
// Volume numbers in a title, so "\u05D4\u05D7\u05D5\u05E7\u05E8\u05D9\u05DD 8" never takes the price of "\u05D4\u05D7\u05D5\u05E7\u05E8\u05D9\u05DD
// 10": digits, a standalone volume letter (\u05D1..\u05D9), and \u05D7"\u05D0 / \u05D7\u05DC\u05E7 \u05D1 / \u05DB\u05E8\u05DA \u05D2.
// 1 / \u05D0 counts as "no volume" \u2014 lists write "\u05D0\u05D9\u05E9 \u05E1\u05D5\u05D3 1" for "\u05D0\u05D9\u05E9 \u05E1\u05D5\u05D3 \u05D0" or
// just "\u05D0\u05D9\u05E9 \u05E1\u05D5\u05D3". Years (\u2265 1000) are not volumes.
const VOLUME_LETTER = { '\u05D0': 1, '\u05D1': 2, '\u05D2': 3, '\u05D3': 4, '\u05D4': 5, '\u05D5': 6, '\u05D6': 7, '\u05D7': 8, '\u05D8': 9, '\u05D9': 10 };
function titleVolumes(s) {
  const text = String(s || '')
    .replace(/(^|\s)\u05D7["\u05F4']([\u05D0-\u05D9])(?=\s|$)/g, (_, pre, l) => `${pre}${VOLUME_LETTER[l]} `)
    .replace(/(\u05D7\u05DC\u05E7|\u05DB\u05E8\u05DA)\s+([\u05D0-\u05D9])['\u05F3]?(?=\s|$)/g, (_, __, l) => ` ${VOLUME_LETTER[l]} `);
  const out = new Set();
  for (const t of text.replace(/["'.,!?()\-:]/g, ' ').split(/\s+/)) {
    let n = null;
    if (/^\d+$/.test(t)) n = Number(t);
    else if (t.length === 1 && VOLUME_LETTER[t]) n = VOLUME_LETTER[t];
    if (n != null && n !== 1 && n < 1000) out.add(n);
  }
  return out;
}
const sameVolumes = (a, b) => {
  const x = titleVolumes(a); const y = titleVolumes(b);
  return x.size === y.size && [...x].every(n => y.has(n));
};

export function matchQuoteToBook(quote, books) {
  const norm = (s) => (s || '').trim().toLowerCase().replace(/[\u0591-\u05C7]/g, '').replace(/["'.,!?()\-:]/g, '').replace(/\s+/g, ' ').trim();
  // \u05DE\u05E1\u05E4\u05E8\u05D9\u05DD \u05E0\u05E9\u05DE\u05E8\u05D9\u05DD \u05D2\u05DD \u05DB\u05E9\u05D4\u05DD \u05E1\u05E4\u05E8\u05D4 \u05D0\u05D7\u05EA \u2014 \u05D0\u05D7\u05E8\u05EA "\u05D4\u05D7\u05D5\u05E7\u05E8\u05D9\u05DD 8" \u05D5"\u05D4\u05D7\u05D5\u05E7\u05E8\u05D9\u05DD 10" \u05E0\u05E8\u05D0\u05D9\u05DD \u05D6\u05D4\u05D9\u05DD
  const tokens = (s) => norm(s).split(' ').filter(t => t.length >= 2 || /^\d$/.test(t));
  // \u05DB\u05DC \u05D4\u05D4\u05EA\u05D0\u05DE\u05D5\u05EA \u05DC\u05E4\u05D9 \u05E9\u05DD (\u05DC\u05D0 ISBN) \u05D3\u05D5\u05E8\u05E9\u05D5\u05EA \u05E9\u05DE\u05E1\u05E4\u05E8\u05D9 \u05D4\u05DB\u05E8\u05DB\u05D9\u05DD \u05D9\u05D4\u05D9\u05D5 \u05D6\u05D4\u05D9\u05DD
  books = books.map(b => (sameVolumes(quote.title, b.title) ? b : { ...b, title: '' }));

  // ISBN match
  if (quote.isbn) {
    const cleanIsbn = quote.isbn.replace(/[^0-9Xx]/g, '').toUpperCase();
    if (cleanIsbn) {
      for (let i = 0; i < books.length; i++) {
        const bIsbn = (books[i].isbn || '').replace(/[^0-9Xx]/g, '').toUpperCase();
        if (bIsbn && bIsbn === cleanIsbn) return { matched: true, bookIndex: i };
      }
    }
  }

  const qt = norm(quote.title);
  const qTokens = tokens(quote.title);

  // 1. Exact title match (author/publisher optional)
  for (let i = 0; i < books.length; i++) {
    const b = books[i];
    if (qt && qt === norm(b.title)) {
      const authorOk = !quote.author || !b.author || norm(quote.author) === norm(b.author);
      const pubOk = !quote.publisher || !b.publisher || norm(quote.publisher) === norm(b.publisher);
      if (authorOk && pubOk) return { matched: true, bookIndex: i };
    }
  }

  // 2. Partial title match (one contains the other)
  for (let i = 0; i < books.length; i++) {
    const b = books[i];
    if (!qt || !b.title) continue;
    const bt = norm(b.title);
    if (qt.length < 2 || bt.length < 2) continue;
    if (bt.includes(qt) || qt.includes(bt)) {
      const authorOk = !quote.author || !b.author || norm(quote.author) === norm(b.author);
      if (authorOk) return { matched: true, bookIndex: i };
    }
  }

  // 3. Token-based match — all tokens of the shorter title appear in the longer one
  for (let i = 0; i < books.length; i++) {
    const b = books[i];
    if (!qt || !b.title) continue;
    const bt = norm(b.title);
    const bTokens = tokens(b.title);
    if (qTokens.length === 0 || bTokens.length === 0) continue;
    const [shorter, longer] = qTokens.length <= bTokens.length ? [qTokens, bTokens] : [bTokens, qTokens];
    if (shorter.every(t => longer.includes(t))) {
      const authorOk = !quote.author || !b.author || norm(quote.author) === norm(b.author);
      if (authorOk) return { matched: true, bookIndex: i };
    }
  }

  // 4. Leading-words match — the first two words agree. One shared first word
  //    used to be enough, which put a supplier's price on the wrong book
  //    whenever two titles opened alike ("סיפורי...", "ילדי...").
  for (let i = 0; i < books.length; i++) {
    const b = books[i];
    if (!qt || !b.title) continue;
    const bTokens = tokens(b.title);
    if (qTokens.length < 2 || bTokens.length < 2) continue;
    if (qTokens[0] === bTokens[0] && qTokens[1] === bTokens[1]) {
      const authorOk = !quote.author || !b.author || norm(quote.author) === norm(b.author);
      if (authorOk) return { matched: true, bookIndex: i };
    }
  }

  return { matched: false, bookIndex: null };
}

/**
 * Compute cheapest supplier for each book based on nylon preference.
 * Returns updated books array with cheapest_supplier_id and cheapest_price set.
 */
export function computeCheapestSuppliers(books) {
  return books.map(b => {
    const quotes = (b.supplier_quotes || []).filter(q => q.matched);
    if (quotes.length === 0) return { ...b, cheapest_supplier_id: '', cheapest_price: undefined };
    let best = null;
    for (const q of quotes) {
      const price = getEffectivePrice(b, q);
      if (price == null) continue;
      if (best == null || price < best.price) {
        best = { supplier_id: q.supplier_id, price };
      }
    }
    if (best == null) return { ...b, cheapest_supplier_id: '', cheapest_price: undefined };
    return { ...b, cheapest_supplier_id: best.supplier_id, cheapest_price: best.price };
  });
}

export const DEFAULT_EMAIL_SUBJECT = 'בקשה להצעת מחיר עבור רשימת ספרים';

export const DEFAULT_EMAIL_BODY = `שלום,

מצורפת רשימת ספרים עבור קבלת הצעת מחיר.

נא לציין עבור כל ספר:
- מחיר עם ניילון
- מחיר בלי ניילון
- זמינות
- זמן אספקה
- הערות אם יש

תודה.`;

/**
 * Build a fixed email template with the actual book details.
 */
export function buildQuoteEmailBody(books, excelUrl) {
  const bookLines = books.map((b, i) => {
    let line = `${i + 1}. ${b.title || 'ספר ללא שם'}`;
    if (b.author) line += ` - ${b.author}`;
    if (b.publisher) line += `, ${b.publisher}`;
    if (b.isbn) line += ` (ISBN: ${b.isbn})`;
    const nylon = normalizeNylon(b.nylon_required);
    const flags = [];
    if (nylon !== 'any') flags.push(nylonLabel(nylon));
    if (isBindingChecked(b.binding_required)) flags.push('עם כריכה');
    if (flags.length) line += ` [${flags.join(', ')}]`;
    return line;
  }).join('\n');

  return `שלום,

מצורפת רשימת ספרים עבור קבלת הצעת מחיר:

${bookLines}

נא לציין עבור כל ספר:
- מחיר עם ניילון
- מחיר בלי ניילון
- זמינות
- זמן אספקה
- הערות אם יש

${excelUrl ? `לינק להורדת רשימת הספרים (Excel):\n${excelUrl}\n\n` : ''}תודה.`;
}