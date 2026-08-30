import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Check, Search, Database, Plus, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { nylonLabel } from '@/lib/bookQuoteExcel';
import { importBookFiles } from '@/lib/bookListImport';
import AddBookDialog from '@/components/bookLists/AddBookDialog';
import { canMarkBooksForOrder, canCreateBookQuoteRequest, canEditBookList } from '@/lib/permissions';

export default function BookListTab({ bookList, isTransferredToQuote, onBooksChange, onStatusChange, inventoryItems }) {
  const [books, setBooks] = useState([]);
  const [searchBook, setSearchBook] = useState('');
  const [user, setUser] = useState(null);
  const [checkingAgron, setCheckingAgron] = useState(false);
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
    const hasMarked = updated.some(b => b.marked_for_order);
    saveBooks(updated);
    if (hasMarked && (bookList.status === 'received' || bookList.status === 'in_review')) onStatusChange('books_selected');
    else if (!hasMarked && bookList.status === 'books_selected') onStatusChange('in_review');
  };

  const toggleSelectedForQuote = (idx) => {
    if (!canCreateQuoteReq) { toast.error('אין לך הרשאה לבחור ספרים לשליחה לספקים'); return; }
    const book = books[idx];
    if (!book.marked_for_order) { toast.error('יש לסמן את הספר כ"מעניין אותי" תחילה'); return; }
    const updated = books.map((b, i) => i === idx ? { ...b, selected_for_quote: !b.selected_for_quote } : b);
    saveBooks(updated);
  };

  const checkAgainstAgron = async () => {
    setCheckingAgron(true);
    const updated = [...books];
    for (let i = 0; i < updated.length; i++) {
      const b = updated[i];
      if (!b.marked_for_order) continue;
      if (!b.isbn && !b.title) {
        updated[i] = { ...b, existing_in_agron: false, existing_copies: 0, system_recommendation: 'דורש בדיקה ידנית', recommendation_reason: 'לא נמצאה התאמה חד־משמעית לפי ISBN או שם ספר' };
        continue;
      }
      let match = null;
      if (b.isbn) {
        const cleanIsbn = b.isbn.replace(/[^0-9Xx]/g, '').toUpperCase();
        match = inventoryItems.find(item => { const itemIsbn = (item.isbn || '').replace(/[^0-9Xx]/g, '').toUpperCase(); return itemIsbn && itemIsbn === cleanIsbn; });
      }
      if (!match && b.title) {
        match = inventoryItems.find(item => item.name?.toLowerCase() === b.title?.toLowerCase() && (!b.author || item.author?.toLowerCase() === b.author?.toLowerCase()));
      }
      if (!match) {
        updated[i] = { ...b, existing_in_agron: false, existing_copies: 0, system_recommendation: 'מומלץ לשלוח להצעת מחיר', recommendation_reason: 'הספר לא נמצא במלאי הספרייה' };
      } else {
        const copies = match.copies_in_agron || match.current_quantity || 0;
        let recommendation, reason;
        if (copies === 0) { recommendation = 'מומלץ לשלוח להצעת מחיר'; reason = 'הספר לא נמצא במלאי הספרייה'; }
        else if (copies === 1) { recommendation = 'לבדיקה'; reason = 'קיים עותק אחד בלבד, ייתכן שכדאי להזמין עותק נוסף'; }
        else if (copies <= 3) { recommendation = 'לבדיקה מקצועית'; reason = 'קיימים מספר עותקים, נדרש שיקול מקצועי'; }
        else { recommendation = 'לא מומלץ להזמין'; reason = 'קיימים כבר מספיק עותקים בספרייה'; }
        updated[i] = { ...b, existing_in_agron: true, existing_copies: copies, system_recommendation: recommendation, recommendation_reason: reason };
      }
    }
    setBooks(updated);
    await onBooksChange(updated);
    setCheckingAgron(false);
    toast.success('בדיקת אגרון הושלמה!');
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
        {canEdit && !isTransferredToQuote && (
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
          <Database className="w-3.5 h-3.5" /> {checkingAgron ? 'בודק...' : 'בדוק מול אגרון'}
        </Button>
      </div>

      <AddBookDialog open={addBookOpen} onOpenChange={setAddBookOpen} onAdd={handleAddBook} />
      <div className="border border-border rounded-xl overflow-auto max-h-[55vh]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted/50 z-10">
            <tr className="border-b border-border">
              <th className="p-2 w-10 text-center"><span className="text-xs">מעניין</span></th>
              <th className="p-2 w-10 text-center hidden md:table-cell"><span className="text-xs">לשליחה</span></th>
              <th className="text-right p-2 font-medium text-muted-foreground min-w-[120px]">שם ספר</th>
              <th className="text-right p-2 font-medium text-muted-foreground hidden md:table-cell">מחבר</th>
              <th className="text-right p-2 font-medium text-muted-foreground hidden lg:table-cell">הוצאה</th>
              <th className="text-right p-2 font-medium text-muted-foreground hidden xl:table-cell">ISBN</th>
              <th className="text-center p-2 font-medium text-muted-foreground hidden md:table-cell">ניילון</th>
              <th className="text-center p-2 font-medium text-muted-foreground w-16">כמות</th>
              <th className="text-center p-2 font-medium text-muted-foreground w-16">אגרון</th>
              <th className="text-center p-2 font-medium text-muted-foreground hidden md:table-cell min-w-[150px]">המלצה</th>
            </tr>
          </thead>
          <tbody>
            {filteredBooks.length === 0 ? (
              <tr><td colSpan={10} className="text-center py-12 text-muted-foreground">אין ספרים ברשימה</td></tr>
            ) : (
              filteredBooks.map((book) => {
                const idx = books.indexOf(book);
                return (
                  <tr key={idx} className={cn('border-b border-border/50 hover:bg-muted/30 transition-colors', book.selected_for_quote && 'bg-indigo-50/50', book.marked_for_order && !book.selected_for_quote && 'bg-green-50/30')}>
                    <td className="p-2 text-center">
                      {isTransferredToQuote ? (book.marked_for_order ? <Check className="w-5 h-5 text-green-400 mx-auto" /> : <span className="text-xs text-muted-foreground">-</span>) : canMark ? (
                        <button onClick={() => toggleInterested(idx)} className={cn('w-5 h-5 rounded border-2 flex items-center justify-center transition-all mx-auto', book.marked_for_order ? 'bg-green-500 border-green-500' : 'border-border hover:border-green-400')}>{book.marked_for_order && <Check className="w-3 h-3 text-white" />}</button>
                      ) : <span className="text-xs text-muted-foreground">-</span>}
                    </td>
                    <td className="p-2 text-center hidden md:table-cell">
                      {isTransferredToQuote ? (book.selected_for_quote ? <Check className="w-5 h-5 text-indigo-400 mx-auto" /> : <span className="text-xs text-muted-foreground">-</span>) : canCreateQuoteReq ? (
                        <button onClick={() => toggleSelectedForQuote(idx)} disabled={!book.marked_for_order} className={cn('w-5 h-5 rounded border-2 flex items-center justify-center transition-all mx-auto', book.selected_for_quote ? 'bg-indigo-500 border-indigo-500' : 'border-border hover:border-indigo-400', !book.marked_for_order && 'opacity-30 cursor-not-allowed')}>{book.selected_for_quote && <Check className="w-3 h-3 text-white" />}</button>
                      ) : <span className="text-xs text-muted-foreground">-</span>}
                    </td>
                    <td className="p-2"><span className={cn('font-medium', book.selected_for_quote && 'text-indigo-700', book.marked_for_order && !book.selected_for_quote && 'text-green-700')}>{book.title || '-'}</span></td>
                    <td className="p-2 hidden md:table-cell text-muted-foreground">{book.author || '-'}</td>
                    <td className="p-2 hidden lg:table-cell text-muted-foreground">{book.publisher || '-'}</td>
                    <td className="p-2 hidden xl:table-cell text-muted-foreground text-xs font-mono">{book.isbn || '-'}</td>
                    <td className="p-2 hidden md:table-cell text-center"><span className="text-xs bg-secondary text-secondary-foreground px-1.5 py-0.5 rounded">{nylonLabel(book.nylon_required)}</span></td>
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
                    <td className="p-2 text-center">{book.existing_in_agron ? <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">{book.existing_copies || 0}</span> : <span className="text-xs text-muted-foreground">-</span>}</td>
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