import { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Check, Minus, Search, Database, Plus, FileSpreadsheet, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { isNylonChecked, nylonFromChecked, isBindingChecked, bookKey } from '@/lib/bookQuoteExcel';
import { importBookFiles } from '@/lib/bookListImport';
import { checkBooksInAgron, applyAgronResult, agronTooltip } from '@/lib/agron';
import AddBookDialog from '@/components/bookLists/AddBookDialog';
import { canMarkBooksForOrder, canCreateBookQuoteRequest, canEditBookList } from '@/lib/permissions';

/** 'all' | 'some' | 'none' — כמה מהפריטים עומדים בתנאי. */
function selectionState(items, pred) {
  const n = items.filter(pred).length;
  if (n === 0) return 'none';
  return n === items.length ? 'all' : 'some';
}

function SelectAllBox({ state, onClick, disabled, color }) {
  const on = color === 'green' ? 'bg-green-500 border-green-500' : 'bg-indigo-500 border-indigo-500';
  const hover = color === 'green' ? 'hover:border-green-400' : 'hover:border-indigo-400';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={state === 'all' ? 'בטל בחירת הכל' : 'בחר הכל'}
      aria-label={state === 'all' ? 'בטל בחירת הכל' : 'בחר הכל'}
      className={cn('w-5 h-5 rounded border-2 flex items-center justify-center transition-all', state === 'none' ? `border-border ${hover}` : on, disabled && 'opacity-30 cursor-not-allowed')}
    >
      {state === 'all' && <Check className="w-3 h-3 text-white" />}
      {state === 'some' && <Minus className="w-3 h-3 text-white" />}
    </button>
  );
}

export default function BookListTab({ bookList, sentBookKeys, onBooksChange, onStatusChange }) {
  const [books, setBooks] = useState([]);
  const booksRef = useRef(books);
  booksRef.current = books;
  const [searchBook, setSearchBook] = useState('');
  const [user, setUser] = useState(null);
  const [checkingAgron, setCheckingAgron] = useState(false);
  const [agronProgress, setAgronProgress] = useState(null);
  const [addBookOpen, setAddBookOpen] = useState(false);
  const [importing, setImporting] = useState(false);

  useEffect(() => { base44.auth.me().then(setUser).catch(() => {}); }, []);
  useEffect(() => { setBooks([...(bookList.books || [])]); }, [bookList]);

  const canMark = canMarkBooksForOrder(user, bookList);
  const canCreateQuoteReq = canCreateBookQuoteRequest(user);
  const canEdit = canEditBookList(user, bookList);

  const saveBooks = async (updated) => {
    setBooks(updated);
    await onBooksChange(updated);
  };

  const toggleInterested = (idx) => {
    if (!canMark) { toast.error('אין לך הרשאה לסמן ספרים'); return; }
    const updated = books.map((b, i) => {
      if (i !== idx) return b;
      const newMarked = !b.marked_for_order;
      return { ...b, marked_for_order: newMarked, selected_for_quote: newMarked ? b.selected_for_quote : false };
    });
    saveMarked(updated);
  };

  const saveMarked = (updated) => {
    const hasMarked = updated.some(b => b.marked_for_order);
    saveBooks(updated);
    if (hasMarked && (bookList.status === 'received' || bookList.status === 'in_review')) onStatusChange('books_selected');
    else if (!hasMarked && bookList.status === 'books_selected') onStatusChange('in_review');
  };

  // "בחר הכל" פועל על הספרים המוצגים כרגע (אחרי חיפוש), כך שאפשר לסנן ואז לסמן קבוצה.
  const toggleAllInterested = () => {
    if (!canMark) { toast.error('אין לך הרשאה לסמן ספרים'); return; }
    const visible = new Set(filteredBooks);
    const allMarked = filteredBooks.every(b => b.marked_for_order);
    const updated = books.map(b => {
      if (!visible.has(b)) return b;
      return allMarked
        ? { ...b, marked_for_order: false, selected_for_quote: false }
        : { ...b, marked_for_order: true };
    });
    saveMarked(updated);
  };

  /**
   * ספר שכבר יצא במחזור קודם — נעול לשליחה חוזרת, כדי שלא יוזמן פעמיים.
   * הזיהוי נגזר מהבקשות שנוצרו בפועל (sentBookKeys) ולא רק מהמונה השמור, כך
   * שגם ספרים שנשלחו לפני שהמונה נוסף מזוהים.
   */
  const isSent = (book) => (book?.sent_count > 0) || !!sentBookKeys?.has(bookKey(book));

  const toggleSelectedForQuote = (idx) => {
    if (!canCreateQuoteReq) { toast.error('אין לך הרשאה לבחור ספרים לשליחה לספקים'); return; }
    const book = books[idx];
    if (isSent(book)) { toast.error('הספר כבר נשלח בבקשת הצעת מחיר ולא ניתן לשלוח אותו שוב'); return; }
    if (!book.marked_for_order) { toast.error('יש לסמן את הספר כ"מעניין אותי" תחילה'); return; }
    const updated = books.map((b, i) => i === idx ? { ...b, selected_for_quote: !b.selected_for_quote } : b);
    saveBooks(updated);
  };

  // רק ספרים שסומנו "מעניין" ועדיין לא נשלחו ניתנים לבחירה לשליחה.
  const isQuoteEligible = (b) => b.marked_for_order && !isSent(b);

  const toggleAllSelectedForQuote = () => {
    if (!canCreateQuoteReq) { toast.error('אין לך הרשאה לבחור ספרים לשליחה לספקים'); return; }
    const eligible = new Set(filteredBooks.filter(isQuoteEligible));
    if (eligible.size === 0) { toast.error('אין ספרים זמינים לשליחה — יש לסמן ספרים כ"מעניין אותי" תחילה'); return; }
    const allSelected = [...eligible].every(b => b.selected_for_quote);
    const updated = books.map(b => eligible.has(b) ? { ...b, selected_for_quote: !allSelected } : b);
    saveBooks(updated);
  };

  // בדיקה מול הקטלוג האמיתי (Libnet) — ראו src/lib/agron.js. הבדיקה לוקחת
  // כמה שניות, ובזמן הזה אפשר להמשיך לסמן ספרים; לכן התוצאות ממוזגות לתוך
  // המצב העדכני (booksRef) ולא לתוך העותק שהיה ברגע הלחיצה, כדי לא לדרוס סימונים.
  const checkAgainstAgron = async () => {
    const targets = books.map((b, i) => ({ b, i })).filter(({ b }) => b.marked_for_order);
    if (targets.length === 0) return;

    setCheckingAgron(true);
    setAgronProgress(null);
    try {
      const results = await checkBooksInAgron(targets.map(t => t.b), (done, total) => setAgronProgress({ done, total }));
      const byIndex = new Map(targets.map((t, k) => [t.i, { book: t.b, result: results[k] }]));
      const updated = booksRef.current.map((b, i) => {
        const hit = byIndex.get(i);
        // הרשימה רק מתארכת (ספרים נוספים לסופה), אבל אם הספר במקום הזה הוחלף — מדלגים.
        if (!hit || bookKey(hit.book) !== bookKey(b)) return b;
        return applyAgronResult(b, hit.result);
      });
      await saveBooks(updated);

      const errors = results.filter(r => r?.status === 'error');
      const failed = errors.length;
      const found = results.filter(r => r?.status === 'found').length;
      const possible = results.filter(r => r?.status === 'possible').length;
      if (failed > 0) toast.error(`בדיקת ${failed} ספרים מול אגרון נכשלה — אפשר לנסות שוב`, { description: errors[0].error, duration: 10000 });
      if (failed < results.length) toast.success(`בדיקת אגרון הושלמה: ${found} קיימים${possible ? `, ${possible} לבדיקה ידנית` : ''}, ${results.length - found - possible - failed} לא נמצאו`);
    } catch (err) {
      toast.error(`הבדיקה מול אגרון נכשלה: ${err?.message || 'שגיאה לא ידועה'}`);
    }
    setCheckingAgron(false);
    setAgronProgress(null);
  };

  // ── הוספה מאוחרת: צירוף ספרים לרשימה שכבר נשמרה ──────────────────
  // מוסיפים לסוף הרשימה הקיימת ולא מחליפים אותה, ושומרים מיד דרך onBooksChange —
  // אותו נתיב שמירה של כל שאר השינויים בטאב הזה.
  const appendBooks = async (newBooks) => {
    if (newBooks.length === 0) return;
    await saveBooks([...books, ...newBooks]);
  };

  const handleAddBook = async (book) => {
    if (!canEdit) { toast.error('אין לך הרשאה לערוך רשימה זו'); return; }
    await appendBooks([book]);
    toast.success('הספר נוסף לרשימה');
  };

  const handleImportFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;
    if (!canEdit) { toast.error('אין לך הרשאה לערוך רשימה זו'); return; }

    setImporting(true);
    try {
      const { books: imported, names, failures } = await importBookFiles(files);
      if (imported.length > 0) {
        await appendBooks(imported);
        toast.success(
          names.length > 1
            ? `נוספו ${imported.length} ספרים מ-${names.length} קבצים`
            : `נוספו ${imported.length} ספרים מהקובץ`
        );
      } else if (failures.length === 0) {
        toast.error('לא נמצאו ספרים בקבצים שנבחרו');
      }
      failures.forEach(msg => toast.error(msg, { duration: 10000 }));
    } catch (err) {
      toast.error(`שגיאה בייבוא: ${err?.message || 'שגיאה לא ידועה'}`);
    }
    setImporting(false);
  };

  const filteredBooks = books.filter(b => !searchBook || b.title?.includes(searchBook) || b.author?.includes(searchBook) || b.isbn?.includes(searchBook));
  const interestedCount = books.filter(b => b.marked_for_order).length;
  const selectedForQuoteCount = books.filter(b => b.selected_for_quote).length;

  return (
    <div className="space-y-3 p-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="חיפוש ספרים..." className="pr-9" value={searchBook} onChange={e => setSearchBook(e.target.value)} />
        </div>
        {canEdit && (
          <>
            <label className={cn(
              'inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-input bg-background text-sm font-medium cursor-pointer hover:bg-accent transition-colors whitespace-nowrap shrink-0',
              importing && 'opacity-60 pointer-events-none',
            )} title="צירוף קובץ Excel/CSV לרשימה הקיימת">
              {importing
                ? <div className="w-3.5 h-3.5 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
                : <FileSpreadsheet className="w-3.5 h-3.5 text-green-600" />}
              {importing ? 'מייבא...' : 'צרף קובץ'}
              <input type="file" multiple className="hidden" onChange={handleImportFiles} disabled={importing} accept=".csv,.xlsx,.xls" />
            </label>
            <Button variant="outline" size="sm" className="h-9 gap-1.5 whitespace-nowrap shrink-0" onClick={() => setAddBookOpen(true)}>
              <Plus className="w-3.5 h-3.5" /> הוסף ספר
            </Button>
          </>
        )}
        <Button variant="outline" size="sm" onClick={checkAgainstAgron} disabled={checkingAgron || interestedCount === 0} className="gap-1.5 shrink-0">
          <Database className="w-3.5 h-3.5" />
          {checkingAgron ? (agronProgress && agronProgress.total > agronProgress.done ? `בודק ${agronProgress.done}/${agronProgress.total}...` : 'בודק...') : 'בדוק מול אגרון'}
        </Button>
      </div>

      <AddBookDialog open={addBookOpen} onOpenChange={setAddBookOpen} onAdd={handleAddBook} />
      <div className="border border-border rounded-xl overflow-auto max-h-[55vh]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted/50 z-10">
            <tr className="border-b border-border">
              <th className="p-2 w-10 text-center">
                <div className="flex flex-col items-center gap-1">
                  <span className="text-xs">מעניין</span>
                  {canMark && filteredBooks.length > 0 && (
                    <SelectAllBox state={selectionState(filteredBooks, b => b.marked_for_order)} onClick={toggleAllInterested} color="green" />
                  )}
                </div>
              </th>
              <th className="p-2 w-10 text-center hidden md:table-cell">
                <div className="flex flex-col items-center gap-1">
                  <span className="text-xs">לשליחה</span>
                  {canCreateQuoteReq && filteredBooks.length > 0 && (
                    <SelectAllBox
                      state={selectionState(filteredBooks.filter(isQuoteEligible), b => b.selected_for_quote)}
                      onClick={toggleAllSelectedForQuote}
                      disabled={!filteredBooks.some(isQuoteEligible)}
                      color="indigo"
                    />
                  )}
                </div>
              </th>
              <th className="text-right p-2 font-medium text-muted-foreground min-w-[120px]">שם ספר</th>
              <th className="text-right p-2 font-medium text-muted-foreground hidden md:table-cell">מחבר</th>
              <th className="text-right p-2 font-medium text-muted-foreground hidden lg:table-cell">הוצאה</th>
              <th className="text-right p-2 font-medium text-muted-foreground hidden xl:table-cell">ISBN</th>
              <th className="text-center p-2 font-medium text-muted-foreground hidden md:table-cell w-14">ניילון</th>
              <th className="text-center p-2 font-medium text-muted-foreground hidden md:table-cell w-14">כריכה</th>
              <th className="text-center p-2 font-medium text-muted-foreground w-16">כמות</th>
              <th className="text-center p-2 font-medium text-muted-foreground w-16">אגרון</th>
              <th className="text-center p-2 font-medium text-muted-foreground hidden md:table-cell min-w-[150px]">המלצה</th>
            </tr>
          </thead>
          <tbody>
            {filteredBooks.length === 0 ? (
              <tr><td colSpan={11} className="text-center py-12 text-muted-foreground">אין ספרים ברשימה</td></tr>
            ) : (
              filteredBooks.map((book) => {
                const idx = books.indexOf(book);
                const sent = isSent(book);
                return (
                  <tr key={idx} className={cn('border-b border-border/50 hover:bg-muted/30 transition-colors', sent && 'bg-muted/20', !sent && book.selected_for_quote && 'bg-indigo-50/50', !sent && book.marked_for_order && !book.selected_for_quote && 'bg-green-50/30')}>
                    {/* אין יותר מצב "קפוא" אחרי העברה לבקשה — הרשימה היא מאגר
                        שאפשר לחזור אליו ולשלוח ממנו מחזור נוסף. */}
                    <td className="p-2 text-center">
                      {canMark ? (
                        <button onClick={() => toggleInterested(idx)} className={cn('w-5 h-5 rounded border-2 flex items-center justify-center transition-all mx-auto', book.marked_for_order ? 'bg-green-500 border-green-500' : 'border-border hover:border-green-400')}>{book.marked_for_order && <Check className="w-3 h-3 text-white" />}</button>
                      ) : <span className="text-xs text-muted-foreground">-</span>}
                    </td>
                    <td className="p-2 text-center hidden md:table-cell">
                      {!canCreateQuoteReq ? (
                        <span className="text-xs text-muted-foreground">-</span>
                      ) : sent ? (
                        // נעול: הספר כבר יצא במחזור קודם ואי אפשר לשלוח אותו שוב.
                        <span title="כבר נשלח — לא ניתן לשלוח שוב" className="inline-flex mx-auto text-muted-foreground/60">
                          <Lock className="w-3.5 h-3.5" />
                        </span>
                      ) : (
                        <button onClick={() => toggleSelectedForQuote(idx)} disabled={!book.marked_for_order} className={cn('w-5 h-5 rounded border-2 flex items-center justify-center transition-all mx-auto', book.selected_for_quote ? 'bg-indigo-500 border-indigo-500' : 'border-border hover:border-indigo-400', !book.marked_for_order && 'opacity-30 cursor-not-allowed')}>{book.selected_for_quote && <Check className="w-3 h-3 text-white" />}</button>
                      )}
                    </td>
                    <td className="p-2">
                      <span className={cn('font-medium', sent && 'text-muted-foreground', book.selected_for_quote && 'text-indigo-700', !sent && book.marked_for_order && !book.selected_for_quote && 'text-green-700')}>{book.title || '-'}</span>
                      {sent && (
                        <span className="mr-1.5 text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full align-middle" title="הספר כבר נשלח בבקשת הצעת מחיר">
                          נשלח{book.sent_count > 1 ? ` ×${book.sent_count}` : ''}
                        </span>
                      )}
                    </td>
                    <td className="p-2 hidden md:table-cell text-muted-foreground">{book.author || '-'}</td>
                    <td className="p-2 hidden lg:table-cell text-muted-foreground">{book.publisher || '-'}</td>
                    <td className="p-2 hidden xl:table-cell text-muted-foreground text-xs font-mono">{book.isbn || '-'}</td>
                    {/* ניילון וכריכה נשארים ניתנים לעריכה לאורך כל התהליך, גם
                        אחרי שהרשימה הועברה לבקשת הצעת מחיר — אלה דרישות שמתקנים
                        תוך כדי, ולא החלטות שננעלות עם השליחה. */}
                    <td className="p-2 hidden md:table-cell text-center">
                      <Checkbox
                        checked={isNylonChecked(book.nylon_required)}
                        disabled={!canEdit}
                        aria-label={`ניילון — ${book.title || ''}`}
                        onCheckedChange={c => saveBooks(books.map((b, i) => (
                          i === idx ? { ...b, nylon_required: nylonFromChecked(c === true) } : b
                        )))}
                      />
                    </td>
                    <td className="p-2 hidden md:table-cell text-center">
                      <Checkbox
                        checked={isBindingChecked(book.binding_required)}
                        disabled={!canEdit}
                        aria-label={`כריכה — ${book.title || ''}`}
                        onCheckedChange={c => saveBooks(books.map((b, i) => (
                          i === idx ? { ...b, binding_required: c === true } : b
                        )))}
                      />
                    </td>
                    <td className="p-2 text-center">
                      <Input
                        type="number" min="0"
                        className="h-7 w-16 text-xs text-center px-1"
                        value={book.requested_quantity ?? 0}
                        onChange={e => {
                          const updated = books.map((b, i) => i === idx ? { ...b, requested_quantity: parseInt(e.target.value) || 0 } : b);
                          saveBooks(updated);
                        }}
                      />
                    </td>
                    <td className="p-2 text-center" title={agronTooltip(book)}>
                      {book.existing_in_agron
                        ? <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">{book.existing_copies || 0}</span>
                        : book.agron_matches?.length > 0
                          ? <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded cursor-help">?</span>
                          : <span className="text-xs text-muted-foreground">-</span>}
                    </td>
                    <td className="p-2 hidden md:table-cell">
                      {book.system_recommendation ? (
                        <div className="text-xs">
                          <span className={cn('px-1.5 py-0.5 rounded', book.system_recommendation === 'מומלץ לשלוח להצעת מחיר' ? 'bg-green-100 text-green-700' : book.system_recommendation === 'לא מומלץ להזמין' ? 'bg-red-100 text-red-700' : book.system_recommendation === 'דורש בדיקה ידנית' ? 'bg-orange-100 text-orange-700' : 'bg-amber-100 text-amber-700')}>{book.system_recommendation}</span>
                          {book.recommendation_reason && <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{book.recommendation_reason}</p>}
                        </div>
                      ) : <span className="text-xs text-muted-foreground">-</span>}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-muted-foreground">
        {books.length} ספרים{interestedCount > 0 && ` · ${interestedCount} מעניינים`}{selectedForQuoteCount > 0 && ` · ${selectedForQuoteCount} לשליחה לספקים`}
      </p>
    </div>
  );
}