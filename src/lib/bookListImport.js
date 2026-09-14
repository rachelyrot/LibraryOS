import { cleanColumnName, resolveColumnKeys, readExcelRows } from '@/lib/excelImport';
import { normalizeNylon, isBindingChecked } from '@/lib/bookQuoteExcel';

/**
 * ייבוא רשימות ספרים מקבצי Excel/CSV.
 *
 * הלוגיקה הזו ישבה בתוך BookListForm.jsx ולכן הייתה זמינה רק בזמן *יצירת*
 * רשימה חדשה. היא חולצה לכאן כדי שאפשר יהיה לצרף קבצים גם לרשימה קיימת
 * שכבר נשמרה (bookProcurement/BookListTab.jsx) — "העלאה מאוחרת" — בלי לשכפל
 * את זיהוי העמודות, הפרסור והוולידציה בשני מקומות.
 */

// ── זיהוי עמודות ────────────────────────────────────────────────
export const COLUMN_MAP = {
  title: [
    'שם ספר', 'שם הספר', 'כותר', 'כותרת', 'שם הכותר', 'שם כותר', 'שם המוצר', 'book name', 'title', 'name', 'שם',
  ],
  author: [
    'מחבר', 'שם מחבר', 'author', 'מחבר/ת', 'סופר',
  ],
  publisher: [
    'הוצאה', 'הוצאה לאור', 'הוצאת ספרים', 'publisher', 'הוצאת', 'מו"ל', 'הו"ל',
  ],
  isbn: [
    'isbn', 'מסת"ב', 'מסתב', 'ברקוד', 'מסת״ב', 'מק"ט', 'מקט',
  ],
  category: [
    'קטגוריה', 'category', 'סוג', "ז'אנר", "ז׳אנר",
  ],
  supplier_price: [
    'מחיר ספק', 'מחיר', 'מחיר מחירון', 'מחיר יחידה', 'supplier price', 'price', 'supplier_price', 'מחיר רכישה',
    'מחיר למינציה',
  ],
  discount_percent: [
    'אחוז הנחה', 'הנחה', 'discount', 'discount percent', 'discount_percent', '% הנחה',
  ],
  discounted_price: [
    'מחיר לאחר הנחה', 'מחיר סופי', 'מחיר נטו', 'final price', 'discounted_price', 'final_price',
  ],
  recommended_quantity: [
    'כמות', 'כמות מומלצת', 'quantity', 'recommended_quantity',
  ],
  requested_quantity: [
    'כמות מבוקשת', 'requested quantity', 'requested_quantity',
  ],
  nylon_required: [
    'ניילון', 'עם ניילון', 'ניילון נדרש', 'nylon', 'ניילון/למינציה', 'למינציה',
  ],
  binding_required: [
    'כריכה', 'עם כריכה', 'כריכה נדרשת', 'כריכה קשה', 'binding', 'hardcover',
  ],
  notes: [
    'הערות', 'notes', 'comments', 'הערה',
  ],
};

// ── זיהוי שורת הכותרות ──
export const HEADER_SIGNALS = ['שם ספר', 'שם הספר', 'כותר', 'isbn', 'מחבר', 'מחיר', 'title', 'שם כותר', 'שם המוצר', 'שם הכותר'];

// חלק מקבצי הספקים מסמנים עטיפת ניילון בעמודה ללא כותרת בכלל (תא ריק, לא אחד
// המועמדים ב-COLUMN_MAP) — במקרה כזה נופלים לזיהוי העמודה לפי הערכים שבה ולא
// לפי הכותרת. ראה fix/book-import-missing-header.
export const VALUE_SIGNALS = {
  nylon_required: ['ניילון', 'עם ניילון', 'בלי ניילון', 'ניילון נדרש', 'למינציה'],
};

export const FIELD_LABELS = {
  title: 'שם ספר', author: 'מחבר', publisher: 'הוצאה', isbn: 'ISBN',
  category: 'קטגוריה', supplier_price: 'מחיר ספק', discount_percent: 'אחוז הנחה',
  discounted_price: 'מחיר לאחר הנחה', recommended_quantity: 'כמות',
  requested_quantity: 'כמות מבוקשת', nylon_required: 'ניילון', binding_required: 'כריכה', notes: 'הערות',
};

export const EMPTY_BOOK = {
  title: '', author: '', publisher: '', isbn: '', category: '',
  supplier_price: 0, discounted_price: 0, recommended_quantity: 0, requested_quantity: 0,
  nylon_required: 'any', binding_required: false, notes: '',
  existing_in_agron: false, existing_copies: 0, system_recommendation: 'לבדיקה', recommendation_reason: '',
  marked_for_order: false, status: 'חדש',
};

// ── פרסור שורה בודדת ────────────────────────────────────────────
export function parseRow(row, columnKeys) {
  const g = (f) => { const k = columnKeys[f]; return k ? row[k] : undefined; };
  const title = g('title'); const author = g('author'); const publisher = g('publisher');
  const isbn = g('isbn'); const category = g('category');
  const supplier_price = parseFloat(g('supplier_price'));
  const discount_percent = parseFloat(g('discount_percent'));
  let discounted_price = parseFloat(g('discounted_price'));
  const recommended_quantity = parseInt(g('recommended_quantity'), 10);
  const requested_quantity_raw = g('requested_quantity');
  const requested_quantity = requested_quantity_raw != null ? parseInt(requested_quantity_raw, 10) : NaN;
  const nylon_required = normalizeNylon(g('nylon_required'));
  const binding_required = isBindingChecked(g('binding_required'));
  const notes = g('notes');

  if (isNaN(discounted_price) && !isNaN(supplier_price) && !isNaN(discount_percent))
    discounted_price = Math.round(supplier_price * (1 - discount_percent / 100) * 100) / 100;

  return {
    title: (title || '').toString().trim(),
    author: (author || '').toString().trim(),
    publisher: (publisher || '').toString().trim(),
    isbn: (isbn || '').toString().trim(),
    category: (category || '').toString().trim(),
    supplier_price: isNaN(supplier_price) ? 0 : supplier_price,
    discounted_price: isNaN(discounted_price) ? 0 : discounted_price,
    recommended_quantity: isNaN(recommended_quantity) ? 0 : recommended_quantity,
    requested_quantity: isNaN(requested_quantity) ? (isNaN(recommended_quantity) ? 0 : recommended_quantity) : requested_quantity,
    nylon_required,
    binding_required,
    notes: (notes || '').toString().trim(),
    existing_in_agron: false,
    existing_copies: 0,
    system_recommendation: 'לבדיקה',
    recommendation_reason: '',
    marked_for_order: false,
    status: 'חדש',
  };
}

// ── ולידציה ─────────────────────────────────────────────────────
export function validateBooks(books) {
  const errors = [];
  const seen = {};
  books.forEach((b, i) => {
    if (!b.title) errors.push({ row: i + 1, field: 'title', msg: 'חסר שם ספר' });
    if (b.supplier_price < 0) errors.push({ row: i + 1, field: 'supplier_price', msg: 'מחיר לא תקין' });
    if (b.isbn) {
      const clean = b.isbn.replace(/[^0-9Xx]/g, '').toUpperCase();
      if (seen[clean]) errors.push({ row: i + 1, field: 'isbn', msg: `ISBN כפול – מופיע גם בשורה ${seen[clean]}` });
      else seen[clean] = i + 1;
    }
  });
  return errors;
}

/**
 * קורא קובץ בודד ומחזיר את הספרים שזוהו בו, או שגיאה מתארת.
 * @returns {Promise<{books?: object[], cols?: object, error?: string}>}
 */
export async function readBookFile(file) {
  const { dataRows, detectedColumns: cols, allColumns } = await readExcelRows(file, {
    columnMap: COLUMN_MAP,
    anchorField: 'title',
    headerSignals: HEADER_SIGNALS,
  });

  if (allColumns.length === 0) {
    return { error: `${file.name}: לא זוהו נתונים בקובץ` };
  }
  if (!cols.title) {
    const foundCols = allColumns.map(k => cleanColumnName(k)).filter(Boolean).join(', ');
    return { error: `${file.name}: לא נמצאה עמודת "שם ספר" (נמצאו: ${foundCols || 'לא זוהו'})`, cols };
  }

  const columnKeys = resolveColumnKeys(dataRows, COLUMN_MAP, VALUE_SIGNALS);
  const detected = {
    ...cols,
    ...Object.fromEntries(
      Object.keys(VALUE_SIGNALS)
        .filter((field) => !cols[field] && columnKeys[field])
        .map((field) => [field, 'זוהה לפי תוכן העמודה (ללא כותרת)'])
    ),
  };
  // שורות ללא שם ספר מושמטות בשקט
  const books = dataRows.map((row) => parseRow(row, columnKeys)).filter(b => b.title);
  return { books, cols: detected };
}

/**
 * קורא כמה קבצים ומאחד את הספרים שלהם לרשימה אחת. כל קובץ נקרא בנפרד — לכל
 * ספק מבנה עמודות משלו, ולכן הזיהוי האוטומטי חייב לרוץ פר קובץ; רק התוצאות
 * מתאחדות. כישלון בקובץ אחד לא מפיל את השאר.
 *
 * @param {File[]|FileList} fileList
 * @returns {Promise<{books: object[], names: {name: string, count: number}[], failures: string[], cols: object}>}
 */
export async function importBookFiles(fileList) {
  const files = Array.from(fileList || []);
  const books = [];
  const names = [];
  const failures = [];
  let cols = {};

  for (const file of files) {
    try {
      const res = await readBookFile(file);
      if (res.cols) cols = { ...cols, ...res.cols };
      if (res.error) { failures.push(res.error); continue; }
      books.push(...res.books);
      names.push({ name: file.name, count: res.books.length });
    } catch {
      failures.push(`${file.name}: שגיאה בקריאת הקובץ`);
    }
  }

  return { books, names, failures, cols };
}
