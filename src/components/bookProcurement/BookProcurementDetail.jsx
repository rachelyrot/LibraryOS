import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ExternalLink } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import StatusBadge from '@/components/StatusBadge';
import { canEditBookList, canReceiveQuotePrices, canComparePrices, canSelectSuppliers, canCreateOrdersFromQuoteRequest, isAdmin } from '@/lib/permissions';
import { bookKey } from '@/lib/bookQuoteExcel';
import BookListTab from './BookListTab';
import QuoteRequestTab from './QuoteRequestTab';
import { ReceiveQuotesTab, ComparisonTab, OrdersTab, NoPermission } from '@/components/bookQuoteRequests/BookQuoteRequestDetail';

const STATUSES = {
  received: 'התקבלה', in_review: 'בבדיקה', books_selected: 'נבחרו ספרים',
  transferred_to_quote: 'הועברה לבקשת הצעת מחיר', closed: 'נסגרה'
};

// תוויות קצרות למחזורי בקשות הצעת מחיר, לבורר המחזור. מקבילות ל-StatusBadge
// אבל בלי העיצוב — כאן הן חלק מטקסט של פריט ברשימה נפתחת.
const BQR_STATUSES = {
  draft: 'טיוטה', sent_to_suppliers: 'נשלחה לספקים', awaiting_quotes: 'ממתינה להצעות',
  partial_quotes: 'התקבלו חלק מההצעות', all_quotes_received: 'התקבלו כל ההצעות',
  in_comparison: 'בהשוואת מחירים', suppliers_selected: 'נבחרו ספקים',
  transferred_to_orders: 'הועברה להזמנות רכש', closed: 'נסגרה',
};

export default function BookProcurementDetail({ bookList, onClose, onRefresh }) {
  const [user, setUser] = useState(null);
  const [suppliers, setSuppliers] = useState([]);
  // כל מחזורי בקשות הצעת המחיר שנוצרו מהרשימה הזו, מהישן לחדש. רשימה יכולה
  // לשמש שוב ושוב: מוסיפים ספרים, מסמנים, ופותחים מחזור נוסף.
  const [quoteRequests, setQuoteRequests] = useState([]);
  const [currentStatus, setCurrentStatus] = useState('');
  const [tab, setTab] = useState('books');
  const [inventoryItems, setInventoryItems] = useState([]);
  // עותק מקומי של הספרים, כדי שניקוי סימוני "לשליחה" אחרי שליחת מחזור ישתקף
  // מיד בטאבים בלי לחכות לרענון מהשרת.
  const [books, setBooks] = useState([]);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
    base44.entities.Supplier.list('name', 500).then(setSuppliers).catch(() => {});
    base44.entities.InventoryItem.list('-updated_date', 500).then(setInventoryItems).catch(() => {});
  }, []);

  const changeStatus = async (newStatus) => {
    setCurrentStatus(newStatus);
    try { await base44.entities.SupplierBookList.update(bookList.id, { status: newStatus }); } catch (e) { setCurrentStatus(bookList.status); }
  };

  useEffect(() => {
    if (!bookList) return;
    setCurrentStatus(bookList.status || 'received');
    setBooks([...(bookList.books || [])]);
    if (bookList.status === 'received') changeStatus('in_review');

    // נטען לפי source_book_list_id ולא לפי linked_quote_request_id (שמחזיק רק
    // את המחזור האחרון) — כך גם רשימות ותיקות שנוצרו לפני השינוי מציגות את כל
    // המחזורים שלהן, בלי מיגרציה ובלי backfill.
    base44.entities.BookQuoteRequest
      .filter({ source_book_list_id: bookList.id }, 'created_date', 50)
      .then(setQuoteRequests)
      .catch(() => setQuoteRequests([]));

    setTab('books');
  }, [bookList]);

  // ספרים שכבר יצאו במחזור כלשהו — נגזר מהבקשות עצמן ולא רק מהמונה השמור על
  // הספר, כך שגם רשימות שנשלחו לפני שהמונה הוצג מזוהות נכון, בלי backfill.
  // מעל ה-early return: hook חייב לרוץ באותו סדר בכל רינדור.
  const sentBookKeys = useMemo(() => {
    const keys = new Set();
    for (const req of quoteRequests) {
      for (const b of req.books || []) keys.add(bookKey(b));
    }
    return keys;
  }, [quoteRequests]);

  if (!bookList) return null;

  const canEdit = canEditBookList(user, bookList);
  const canReceive = canReceiveQuotePrices(user);
  const canViewComparison = canComparePrices(user);
  const canSelect = canSelectSuppliers(user);
  const canCreateOrders = canCreateOrdersFromQuoteRequest(user);
  const admin = isAdmin(user);

  const latestRequest = quoteRequests.length ? quoteRequests[quoteRequests.length - 1] : null;
  const hasQuoteRequest = !!latestRequest;
  // הרשימה עצמה נשארת פתוחה לעריכה תמיד; רק סגירה מפורשת נועלת אותה.
  const listBookList = { ...bookList, books };

  const handleBooksChange = async (newBooks) => {
    setBooks(newBooks);
    try { await base44.entities.SupplierBookList.update(bookList.id, { books: newBooks }); } catch (e) {}
  };

  // כל מחזור נכתב בנפרד, לפי ה-id שלו. לכן אין צורך למפות שורות חזרה למחזור
  // המקורי: כל סקציה מקבלת קולבקים שכבר קשורים לבקשה שלה.
  const updateReqFor = (reqId) => async (updates) => {
    setQuoteRequests(list => list.map(r => (r.id === reqId ? { ...r, ...updates } : r)));
    try { await base44.entities.BookQuoteRequest.update(reqId, updates); } catch (e) {}
  };

  const updateBooksFor = (reqId) => async (newBooks, extraUpdates = {}) => {
    setQuoteRequests(list => list.map(r => (r.id === reqId ? { ...r, books: newBooks, ...extraUpdates } : r)));
    try { await base44.entities.BookQuoteRequest.update(reqId, { books: newBooks, ...extraUpdates }); } catch (e) {}
  };

  const handleQuoteRequestCreated = (created, updatedBooks) => {
    setQuoteRequests(list => [...list, created]);
    if (updatedBooks) setBooks(updatedBooks);
    setCurrentStatus('transferred_to_quote');
    setTab('receive');
    onRefresh();
  };

  /**
   * מציג את כל המחזורים בזה אחר זה בתוך טאב, במקום לבחור אחד מהם.
   * כשיש מחזור אחד בלבד — נטול כותרת, בדיוק כמו קודם.
   */
  const renderCycles = (renderOne) => {
    if (quoteRequests.length === 0) {
      return <p className="text-center py-12 text-muted-foreground">אין בקשת הצעת מחיר עדיין</p>;
    }
    if (quoteRequests.length === 1) return renderOne(quoteRequests[0]);
    return (
      <div className="space-y-4">
        {quoteRequests.map((req, i) => (
          <section key={req.id} className="border border-border rounded-xl overflow-hidden">
            <header className="flex items-center gap-2 px-3 py-2 bg-muted/40 border-b border-border sticky top-0 z-10">
              <span className="text-sm font-bold">מחזור {i + 1}</span>
              <span className="text-xs text-muted-foreground">
                {(req.books || []).length} ספרים · {BQR_STATUSES[req.status] || req.status}
              </span>
            </header>
            {renderOne(req)}
          </section>
        ))}
      </div>
    );
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-7xl max-h-[92vh] overflow-hidden flex flex-col font-heebo" dir="rtl">
        <DialogHeader className="shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-xl">{bookList.title}</DialogTitle>
              <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                <span>{bookList.supplier_name || 'רשימה פנימית'}</span>
                <span>·</span>
                <StatusBadge status={currentStatus} entityType="SupplierBookList" />
                {bookList.file_url && <a href={bookList.file_url} target="_blank" rel="noopener noreferrer" className="text-blue-500 underline flex items-center gap-1"><ExternalLink className="w-3 h-3" /> קובץ</a>}
                {hasQuoteRequest && (
                  <>
                    <span>·</span>
                    <StatusBadge status={latestRequest.status} entityType="BookQuoteRequest" />
                    {quoteRequests.length > 1 && <span className="text-xs">{quoteRequests.length} מחזורים</span>}
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {canEdit && (
                <Select value={currentStatus} onValueChange={changeStatus}>
                  <SelectTrigger className="w-[170px] h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUSES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              <Button variant="outline" size="sm" onClick={onClose}>סגור</Button>
            </div>
          </div>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab} className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="shrink-0">
            <TabsTrigger value="books">1. רשימת ספרים</TabsTrigger>
            <TabsTrigger value="quote">2. בקשת מחיר</TabsTrigger>
            <TabsTrigger value="receive" disabled={!hasQuoteRequest}>3. קליטת הצעות</TabsTrigger>
            <TabsTrigger value="comparison" disabled={!hasQuoteRequest}>4. השוואת מחירים</TabsTrigger>
            <TabsTrigger value="orders" disabled={!hasQuoteRequest}>5. הזמנות רכש</TabsTrigger>
          </TabsList>

          <TabsContent value="books" className="flex-1 overflow-y-auto">
            <BookListTab bookList={listBookList} sentBookKeys={sentBookKeys} onBooksChange={handleBooksChange} onStatusChange={changeStatus} inventoryItems={inventoryItems} />
          </TabsContent>

          <TabsContent value="quote" className="flex-1 overflow-y-auto">
            <QuoteRequestTab bookList={listBookList} sentBookKeys={sentBookKeys} quoteRequests={quoteRequests} suppliers={suppliers} onQuoteRequestCreated={handleQuoteRequestCreated} />
          </TabsContent>

          <TabsContent value="receive" className="flex-1 overflow-y-auto">
            {!canReceive && hasQuoteRequest
              ? <NoPermission msg="אין הרשאה לקליטת הצעות מחיר מספקים" />
              : renderCycles(req => (
                <ReceiveQuotesTab req={req} suppliers={suppliers} updateBooks={updateBooksFor(req.id)} updateReq={updateReqFor(req.id)} onRefresh={onRefresh} />
              ))}
          </TabsContent>

          <TabsContent value="comparison" className="flex-1 overflow-y-auto">
            {!canViewComparison && hasQuoteRequest
              ? <NoPermission msg="אין הרשאה לצפייה בהשוואת מחירים" />
              : renderCycles(req => (
                <ComparisonTab req={req} canSelect={canSelect} updateBooks={updateBooksFor(req.id)} updateReq={updateReqFor(req.id)} />
              ))}
          </TabsContent>

          <TabsContent value="orders" className="flex-1 overflow-y-auto">
            {renderCycles(req => (
              <OrdersTab req={req} canCreateOrders={canCreateOrders} admin={admin} updateReq={updateReqFor(req.id)} onRefresh={onRefresh} />
            ))}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}