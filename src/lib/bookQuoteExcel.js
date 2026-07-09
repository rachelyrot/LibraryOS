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
 * Generate an Excel file for sending to suppliers (empty price columns for them to fill).
 * Returns a Blob.
 */
export function generateSupplierExcel(books) {
  const rows = books.map(b => ({
    'שם ספר': b.title || '',
    'מחבר': b.author || '',
    'הוצאה לאור': b.publisher || '',
    'ISBN': b.isbn || '',
    'ניילון נדרש': nylonLabel(b.nylon_required),
    'הערות': b.notes || '',
    'מחיר עם ניילון': '',
    'מחיר בלי ניילון': '',
    'זמינות': '',
    'זמן אספקה': '',
    'הערות ספק': '',
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  // Set RTL
  if (!ws['!cols']) ws['!cols'] = [];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'בקשת הצעת מחיר');
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
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
 * Parse an uploaded supplier quote file (array of row objects from ExtractDataFromUploadedFile)
 * into quote entries. Returns array of { title, author, publisher, isbn, price_with_nylon,
 * price_without_nylon, availability, delivery_time, notes }.
 */
export function parseSupplierQuote(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const firstRow = rows[0];
  console.log('[parseSupplierQuote] First row keys:', Object.keys(firstRow));
  console.log('[parseSupplierQuote] First row values:', firstRow);
  return rows.map(row => {
    const g = (f) => { const k = findKey(row, f); return k ? row[k] : undefined; };
    const pNum = (v) => {
      if (v == null) return undefined;
      const n = parseFloat(String(v).replace(/[^0-9.-]/g, ''));
      return isNaN(n) ? undefined : n;
    };
    const result = {
      title: String(g('title') || '').trim(),
      author: String(g('author') || '').trim(),
      publisher: String(g('publisher') || '').trim(),
      isbn: String(g('isbn') || '').trim(),
      price_with_nylon: pNum(g('price_with_nylon')),
      price_without_nylon: pNum(g('price_without_nylon')),
      availability: String(g('availability') || '').trim(),
      delivery_time: String(g('delivery_time') || '').trim(),
      notes: String(g('notes') || '').trim(),
    };
    console.log('[parseSupplierQuote] Parsed row:', { title: result.title, price_with_nylon: result.price_with_nylon, price_without_nylon: result.price_without_nylon });
    return result;
  }).filter(r => r.title || r.isbn);
}

/**
 * Match a parsed quote row to a book in the request.
 * Returns { matched: boolean, bookIndex: number|null }
 * 1. ISBN match (if both have ISBN)
 * 2. title + author + publisher match
 * 3. no confident match → matched: false
 */
export function matchQuoteToBook(quote, books) {
  const norm = (s) => (s || '').trim().toLowerCase().replace(/[\u0591-\u05C7]/g, '').replace(/["'.,!?()\-:]/g, '').replace(/\s+/g, ' ').trim();
  const tokens = (s) => norm(s).split(' ').filter(t => t.length >= 2);

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

  // 4. First-token match — first word of quote title matches first word of book title
  for (let i = 0; i < books.length; i++) {
    const b = books[i];
    if (!qt || !b.title) continue;
    const qFirst = qTokens[0];
    const bFirst = tokens(b.title)[0];
    if (qFirst && bFirst && qFirst === bFirst && qFirst.length >= 3) {
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
    if (nylon !== 'any') line += ` [${nylonLabel(nylon)}]`;
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