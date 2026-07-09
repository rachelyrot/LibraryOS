import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import StatusBadge from '@/components/StatusBadge';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import { Check, Search, Scale, Database, ExternalLink, Mail } from 'lucide-react';
import { cn } from '@/lib/utils';
import PriceComparison from './PriceComparison';
import CreateQuoteRequestDialog from '@/components/bookQuoteRequests/CreateQuoteRequestDialog';
import { nylonLabel } from '@/lib/bookQuoteExcel';
import { canEditBookList, canMarkBooksForOrder, canCreateBookQuoteRequest } from '@/lib/permissions';

const STATUSES = {
  received: 'התקבלה',
  in_review: 'בבדיקה',
  books_selected: 'נבחרו ספרים',
  transferred_to_quote: 'הועברה לבקשת הצעת מחיר',
  closed: 'נסגרה'
};

export default function BookListDetail({ list, onClose, onUpdateBooks, onRefresh }) {
  const [books, setBooks] = useState([]);
  const [currentStatus, setCurrentStatus] = useState('');
  const [searchBook, setSearchBook] = useState('');
  const [compareBook, setCompareBook] = useState(null);
  const [checkingAgron, setCheckingAgron] = useState(false);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [quoteReqOpen, setQuoteReqOpen] = useState(false);
  const [allSuppliers, setAllSuppliers] = useState([]);
  const [user, setUser] = useState(null);

  useEffect(() => {
    if (list) {
      setBooks([...(list.books || [])]);
      setCurrentStatus(list.status || 'received');
      if (list.status === 'received') {
        changeStatus('in_review');
      }
      base44.entities.InventoryItem.list('-updated_date', 500).then(setInventoryItems).catch(() => {});
    }
  }, [list]);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
    base44.entities.Supplier.list('name', 500).then(setAllSuppliers).catch(() => {});
  }, []);

  if (!list) return null;

  const canEdit = canEditBookList(user, list);
  const canMark = canMarkBooksForOrder(user, list);
  const canCreateQuoteReq = canCreateBookQuoteRequest(user);
  const isTransferredToQuote = currentStatus === 'transferred_to_quote';

  const changeStatus = async (newStatus) => {
    setCurrentStatus(newStatus);
    try {
      await base44.entities.SupplierBookList.update(list.id, { status: newStatus });
    } catch (e) {
      setCurrentStatus(list.status);
    }
  };

  const saveBooks = async (updated) => {
    setBooks(updated);
    await onUpdateBooks(list.id, updated);
  };

  const toggleInterested = (idx) => {
    if (!canMark) {
      toast.error('אין לך הרשאה לסמן ספרים');
      return;
    }
    const updated = books.map((b, i) => {
      if (i !== idx) return b;
      const newMarked = !b.marked_for_order;
      // If unmarking interested, also unmark selected_for_quote
      return { ...b, marked_for_order: newMarked, selected_for_quote: newMarked ? b.selected_for_quote : false };
    });
    const hasMarked = updated.some(b => b.marked_for_order);
    saveBooks(updated);
    if (hasMarked && (currentStatus === 'received' || currentStatus === 'in_review')) {
      changeStatus('books_selected');
    } else if (!hasMarked && currentStatus === 'books_selected') {
      changeStatus('in_review');
    }
  };

  const toggleSelectedForQuote = (idx) => {
    if (!canCreateQuoteReq) {
      toast.error('אין לך הרשאה לבחור ספרים לשליחה לספקים');
      return;
    }
    const book = books[idx];
    if (!book.marked_for_order) {
      toast.error('יש לסמן את הספר כ"מעניין אותי" תחילה');
      return;
    }
    const updated = books.map((b, i) => i === idx ? { ...b, selected_for_quote: !b.selected_for_quote } : b);
    saveBooks(updated);
  };

  const checkAgainstAgron = async () => {
    setCheckingAgron(true);
    const updated = [...books];
    for (let i = 0; i < updated.length; i++) {
      const b = updated[i];
      // Only check books marked as interested
      if (!b.marked_for_order) continue;

      if (!b.isbn && !b.title) {
        updated[i] = {
          ...b,
          existing_in_agron: false,
          existing_copies: 0,
          system_recommendation: 'דורש בדיקה ידנית',
          recommendation_reason: 'לא נמצאה התאמה חד־משמעית לפי ISBN או שם ספר',
        };
        continue;
      }

      let match = null;
      if (b.isbn) {
        const cleanIsbn = b.isbn.replace(/[^0-9Xx]/g, '').toUpperCase();
        match = inventoryItems.find(item => {
          const itemIsbn = (item.isbn || '').replace(/[^0-9Xx]/g, '').toUpperCase();
          return itemIsbn && itemIsbn === cleanIsbn;
        });
      }
      if (!match && b.title) {
        match = inventoryItems.find(item =>
          item.name?.toLowerCase() === b.title?.toLowerCase() &&
          (!b.author || item.author?.toLowerCase() === b.author?.toLowerCase())
        );
      }

      if (!match) {
        updated[i] = {
          ...b,
          existing_in_agron: false,
          existing_copies: 0,
          system_recommendation: 'מומלץ לשלוח להצעת מחיר',
          recommendation_reason: 'הספר לא נמצא במלאי הספרייה',
        };
      } else {
        const copies = match.copies_in_agron || match.current_quantity || 0;
        let recommendation, reason;
        if (copies === 0) {
          recommendation = 'מומלץ לשלוח להצעת מחיר';
          reason = 'הספר לא נמצא במלאי הספרייה';
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
        updated[i] = {
          ...b,
          existing_in_agron: true,
          existing_copies: copies,
          system_recommendation: recommendation,
          recommendation_reason: reason,
        };
      }
    }
    setBooks(updated);
    await onUpdateBooks(list.id, updated);
    setCheckingAgron(false);
    toast.success('בדיקת אגרון הושלמה!');
  };

  const openComparison = (book) => setCompareBook(book);

  const filteredBooks = books
    .map((b, idx) => ({ ...b, _idx: idx }))
    .filter(b => !searchBook || b.title?.includes(searchBook) || b.author?.includes(searchBook) || b.isbn?.includes(searchBook));

  const interestedCount = books.filter(b => b.marked_for_order).length;
  const selectedForQuoteCount = books.filter(b => b.selected_for_quote).length;

  return (
    <>
      <Dialog open={true} onOpenChange={onClose}>
        <DialogContent className="max-w-6xl max-h-[92vh] overflow-hidden flex flex-col font-heebo">
          <DialogHeader className="shrink-0">
            <div className="flex items-center justify-between" dir="rtl">
              <div>
                <DialogTitle className="text-xl">{list.title}</DialogTitle>
                <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                  <span>{list.received_date ? new Date(list.received_date).toLocaleDateString('he-IL') : 'ללא תאריך'}</span>
                  <span>·</span>
                  <StatusBadge status={currentStatus} entityType="SupplierBookList" />
                  {list.file_url && <a href={list.file_url} target="_blank" rel="noopener noreferrer" className="text-blue-500 underline flex items-center gap-1"><ExternalLink className="w-3 h-3" /> קובץ</a>}
                  {list.linked_quote_request_id && (
                    <Link to="/book-quote-requests" className="text-purple-500 underline flex items-center gap-1">
                      <ExternalLink className="w-3 h-3" /> בקשת הצעת מחיר
                    </Link>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {canEdit && !isTransferredToQuote && (
                  <Select value={currentStatus} onValueChange={changeStatus}>
                    <SelectTrigger className="w-[170px] h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(STATUSES).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Button variant="outline" size="sm" onClick={checkAgainstAgron} disabled={checkingAgron || interestedCount === 0} className="gap-1.5">
                  <Database className="w-3.5 h-3.5" /> {checkingAgron ? 'בודק...' : 'בדוק מול אגרון'}
                </Button>

                {canCreateQuoteReq && selectedForQuoteCount > 0 && !isTransferredToQuote && (
                  <Button onClick={() => setQuoteReqOpen(true)} size="sm"
                    className="gap-1.5 bg-gradient-to-l from-indigo-400 to-purple-500 text-white border-0 hover:opacity-90">
                    <Mail className="w-3.5 h-3.5" /> שלח בקשת מחיר ({selectedForQuoteCount})
                  </Button>
                )}

                {isTransferredToQuote && (
                  <span className="text-xs text-purple-700 bg-purple-50 px-3 py-1.5 rounded-lg font-medium whitespace-nowrap">
                    הועברה לבקשת הצעת מחיר
                  </span>
                )}
              </div>
            </div>
            {list.notes && <p className="text-sm text-muted-foreground mt-2">{list.notes}</p>}
          </DialogHeader>

          {/* Search */}
          <div className="flex items-center gap-2 my-3 shrink-0">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="חיפוש ספרים ברשימה..." className="pr-9" value={searchBook} onChange={e => setSearchBook(e.target.value)} />
            </div>
          </div>

          {/* Books table */}
          <div className="flex-1 overflow-auto border border-border rounded-xl">
            <table className="w-full text-sm" dir="rtl">
              <thead className="sticky top-0 bg-muted/50 z-10">
                <tr className="border-b border-border">
                  <th className="p-2 w-10 text-center"><span className="text-xs">מעניין</span></th>
                  <th className="p-2 w-10 text-center hidden md:table-cell"><span className="text-xs">לשליחה</span></th>
                  <th className="text-right p-2 font-medium text-muted-foreground min-w-[120px]">שם ספר</th>
                  <th className="text-right p-2 font-medium text-muted-foreground hidden md:table-cell">מחבר</th>
                  <th className="text-right p-2 font-medium text-muted-foreground hidden lg:table-cell">הוצאה</th>
                  <th className="text-right p-2 font-medium text-muted-foreground hidden xl:table-cell">ISBN</th>
                  <th className="text-right p-2 font-medium text-muted-foreground hidden lg:table-cell">קטגוריה</th>
                  <th className="text-center p-2 font-medium text-muted-foreground hidden md:table-cell">ניילון</th>
                  <th className="text-center p-2 font-medium text-muted-foreground w-16">כמות</th>
                  <th className="text-center p-2 font-medium text-muted-foreground w-16">אגרון</th>
                  <th className="text-center p-2 font-medium text-muted-foreground hidden md:table-cell min-w-[150px]">המלצה</th>
                  <th className="p-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {filteredBooks.length === 0 ? (
                  <tr><td colSpan={12} className="text-center py-12 text-muted-foreground">אין ספרים ברשימה</td></tr>
                ) : (
                  filteredBooks.map((book) => {
                    const originalIdx = book._idx;
                    return (
                      <tr key={originalIdx} className={cn(
                        'border-b border-border/50 hover:bg-muted/30 transition-colors',
                        book.selected_for_quote && 'bg-indigo-50/50',
                        book.marked_for_order && !book.selected_for_quote && 'bg-green-50/30'
                      )}>
                        <td className="p-2 text-center">
                          {isTransferredToQuote ? (
                            book.marked_for_order ? <Check className="w-5 h-5 text-green-400 mx-auto" /> : <span className="text-xs text-muted-foreground">-</span>
                          ) : canMark ? (
                            <button onClick={() => toggleInterested(originalIdx)} className={cn('w-5 h-5 rounded border-2 flex items-center justify-center transition-all mx-auto', book.marked_for_order ? 'bg-green-500 border-green-500' : 'border-border hover:border-green-400')}>
                              {book.marked_for_order && <Check className="w-3 h-3 text-white" />}
                            </button>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="p-2 text-center hidden md:table-cell">
                          {isTransferredToQuote ? (
                            book.selected_for_quote ? <Check className="w-5 h-5 text-indigo-400 mx-auto" /> : <span className="text-xs text-muted-foreground">-</span>
                          ) : canCreateQuoteReq ? (
                            <button onClick={() => toggleSelectedForQuote(originalIdx)} disabled={!book.marked_for_order} className={cn('w-5 h-5 rounded border-2 flex items-center justify-center transition-all mx-auto', book.selected_for_quote ? 'bg-indigo-500 border-indigo-500' : 'border-border hover:border-indigo-400', !book.marked_for_order && 'opacity-30 cursor-not-allowed')}>
                              {book.selected_for_quote && <Check className="w-3 h-3 text-white" />}
                            </button>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="p-2">
                          <span className={cn('font-medium', book.selected_for_quote && 'text-indigo-700', book.marked_for_order && !book.selected_for_quote && 'text-green-700')}>{book.title || '-'}</span>
                        </td>
                        <td className="p-2 hidden md:table-cell text-muted-foreground">{book.author || '-'}</td>
                        <td className="p-2 hidden lg:table-cell text-muted-foreground">{book.publisher || '-'}</td>
                        <td className="p-2 hidden xl:table-cell text-muted-foreground text-xs font-mono">{book.isbn || '-'}</td>
                        <td className="p-2 hidden lg:table-cell text-muted-foreground">{book.category || list.category || '-'}</td>
                        <td className="p-2 hidden md:table-cell text-center">
                          <span className="text-xs bg-secondary text-secondary-foreground px-1.5 py-0.5 rounded">{nylonLabel(book.nylon_required)}</span>
                        </td>
                        <td className="p-2 text-center">
                          <Input
                            type="number" min="0"
                            className="h-7 w-16 text-xs text-center px-1"
                            value={book.requested_quantity ?? 0}
                            onChange={e => {
                              const updated = books.map((b, i) => i === originalIdx ? { ...b, requested_quantity: parseInt(e.target.value) || 0 } : b);
                              saveBooks(updated);
                            }}
                          />
                        </td>
                        <td className="p-2 text-center">
                          {book.existing_in_agron
                            ? <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">{book.existing_copies || 0}</span>
                            : <span className="text-xs text-muted-foreground">-</span>}
                        </td>
                        <td className="p-2 hidden md:table-cell">
                          {book.system_recommendation ? (
                            <div className="text-xs">
                              <span className={cn('px-1.5 py-0.5 rounded',
                                book.system_recommendation === 'מומלץ לשלוח להצעת מחיר' ? 'bg-green-100 text-green-700' :
                                book.system_recommendation === 'לא מומלץ להזמין' ? 'bg-red-100 text-red-700' :
                                book.system_recommendation === 'דורש בדיקה ידנית' ? 'bg-orange-100 text-orange-700' :
                                'bg-amber-100 text-amber-700'
                              )}>{book.system_recommendation}</span>
                              {book.recommendation_reason && <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{book.recommendation_reason}</p>}
                            </div>
                          ) : <span className="text-xs text-muted-foreground">-</span>}
                        </td>
                        <td className="p-2">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openComparison(book)} title="השוואת מחירים"><Scale className="w-3.5 h-3.5" /></Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="shrink-0 flex justify-between items-center pt-3 text-sm text-muted-foreground">
            <span>
              {books.length} ספרים
              {interestedCount > 0 && ` · ${interestedCount} מעניינים`}
              {selectedForQuoteCount > 0 && ` · ${selectedForQuoteCount} לשליחה לספקים`}
            </span>
            <Button size="sm" onClick={onClose} className="bg-gradient-to-l from-pink-400 to-rose-500 text-white border-0 hover:opacity-90">שמור וסגור</Button>
          </div>
        </DialogContent>
      </Dialog>

      {compareBook && (
        <PriceComparison book={compareBook} onClose={() => setCompareBook(null)} />
      )}

      <CreateQuoteRequestDialog
        open={quoteReqOpen}
        onOpenChange={setQuoteReqOpen}
        bookList={list}
        suppliers={allSuppliers}
        onCreated={() => { changeStatus('transferred_to_quote'); onRefresh(); }}
      />
    </>
  );
}