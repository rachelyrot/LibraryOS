import { supabase } from '@/api/base44Client';

/**
 * בדיקת ספרים מול אגרון הספרייה (Libnet), דרך ה-Edge Function `agron-search`.
 *
 * הקריאה לא יוצאת ישירות מהדפדפן: מפתח ה-API של Libnet היה נחשף בבאנדל, והשרת
 * שלהם לא מחזיר כותרות CORS. ההתאמה עצמה (שם + מחבר, בלי ISBN — אגרון לא מחזיק
 * ISBN) מתבצעת בפונקציה; כאן רק מחלקים למנות ומתרגמים תוצאה להמלצה.
 */

// חייב להתאים ל-MAX_BOOKS בפונקציה.
const CHUNK_SIZE = 40;

// invoke מחזיר תשובה שאינה 2xx כ-error בלי לפענח את הגוף — ההודעה בעברית
// נמצאת ב-error.context (אותו דפוס כמו callAdminUsers ב-Users.jsx).
async function invokeAgronSearch(books) {
  const { data, error } = await supabase.functions.invoke('agron-search', { body: { books } });
  if (error) {
    let message = error.message;
    try {
      const parsed = await error.context?.json();
      if (parsed?.error) message = parsed.error;
    } catch {
      // תשובה שאינה JSON (רשת / פלטפורמה) — נשארים עם ההודעה הכללית.
    }
    throw new Error(message);
  }
  return data.results;
}

/** מחזיר מערך תוצאות באותו סדר כמו books. onProgress(done, total) אופציונלי. */
export async function checkBooksInAgron(books, onProgress) {
  const results = [];
  for (let i = 0; i < books.length; i += CHUNK_SIZE) {
    const chunk = books.slice(i, i + CHUNK_SIZE).map(b => ({ title: b.title || '', author: b.author || '' }));
    results.push(...await invokeAgronSearch(chunk));
    onProgress?.(Math.min(i + CHUNK_SIZE, books.length), books.length);
  }
  return results;
}

const formatMatch = (m) => `"${m.title}"${m.author ? ` (${m.author})` : ''}`;

/**
 * ממזג תוצאת בדיקה לספר. ספרים שהבדיקה שלהם נכשלה (status: 'error') חוזרים
 * כמו שהם, כדי לא לדרוס תוצאה קודמת תקינה בתוצאה ריקה.
 */
export function applyAgronResult(book, result) {
  if (!result || result.status === 'error') return book;

  const base = { ...book, agron_checked_at: new Date().toISOString(), agron_matches: result.matches || [] };

  if (result.status === 'no_title') {
    return {
      ...base,
      existing_in_agron: false,
      existing_copies: 0,
      system_recommendation: 'דורש בדיקה ידנית',
      recommendation_reason: 'חסר שם ספר — החיפוש באגרון הוא לפי שם ומחבר בלבד',
    };
  }

  if (result.status === 'possible') {
    const first = result.matches[0];
    return {
      ...base,
      existing_in_agron: false,
      existing_copies: 0,
      system_recommendation: 'דורש בדיקה ידנית',
      recommendation_reason: `נמצא באגרון ספר דומה: ${formatMatch(first)} — ${first.copies} עותקים`,
    };
  }

  if (result.status === 'not_found') {
    return {
      ...base,
      existing_in_agron: false,
      existing_copies: 0,
      system_recommendation: 'מומלץ לשלוח להצעת מחיר',
      recommendation_reason: 'הספר לא נמצא באגרון',
    };
  }

  const copies = result.copies || 0;
  let recommendation, reason;
  if (copies === 0) {
    recommendation = 'מומלץ לשלוח להצעת מחיר';
    reason = 'הספר רשום באגרון אך אין לו עותקים';
  } else if (copies === 1) {
    recommendation = 'לבדיקה';
    reason = 'קיים עותק אחד בלבד, ייתכן שכדאי להזמין עותק נוסף';
  } else if (copies <= 3) {
    recommendation = 'לבדיקה מקצועית';
    reason = 'קיימים מספר עותקים, נדרש שיקול מקצועי';
  } else {
    recommendation = 'לא מומלץ להזמין';
    reason = 'קיימים כבר מספיק עותקים בספרייה';
  }
  return {
    ...base,
    existing_in_agron: true,
    existing_copies: copies,
    agron_available: result.available || 0,
    system_recommendation: recommendation,
    recommendation_reason: reason,
  };
}

/** טקסט ל-tooltip של עמודת אגרון בטבלה. */
export function agronTooltip(book) {
  const matches = book?.agron_matches || [];
  if (matches.length === 0) return undefined;
  return matches.map(m => `${formatMatch(m)} · ${m.copies} עותקים, ${m.available} זמינים`).join('\n');
}
