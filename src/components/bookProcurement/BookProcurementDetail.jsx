import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ExternalLink } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import StatusBadge from '@/components/StatusBadge';
import { canEditBookList, canReceiveQuotePrices, canComparePrices, canSelectSuppliers, canCreateOrdersFromQuoteRequest, isAdmin } from '@/lib/permissions';
import BookListTab from './BookListTab';
import QuoteRequestTab from './QuoteRequestTab';
import { ReceiveQuotesTab, ComparisonTab, OrdersTab, NoPermission } from '@/components/bookQuoteRequests/BookQuoteRequestDetail';

const STATUSES = {
  received: 'התקבלה', in_review: 'בבדיקה', books_selected: 'נבחרו ספרים',
  transferred_to_quote: 'הועברה לבקשת הצעת מחיר', closed: 'נסגרה'
};

export default function BookProcurementDetail({ bookList, onClose, onRefresh }) {
  const [user, setUser] = useState(null);
  const [suppliers, setSuppliers] = useState([]);
  const [quoteRequest, setQuoteRequest] = useState(null);
  const [currentStatus, setCurrentStatus] = useState('');
  const [tab, setTab] = useState('books');
  const [inventoryItems, setInventoryItems] = useState([]);

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
    if (bookList) {
      setCurrentStatus(bookList.status || 'received');
      if (bookList.status === 'received') changeStatus('in_review');
      if (bookList.linked_quote_request_id) {
        base44.entities.BookQuoteRequest.get(bookList.linked_quote_request_id).then(setQuoteRequest).catch(() => setQuoteRequest(null));
      } else {
        setQuoteRequest(null);
      }
      setTab('books');
    }
  }, [bookList]);

  if (!bookList) return null;

  const canEdit = canEditBookList(user, bookList);
  const canReceive = canReceiveQuotePrices(user);
  const canViewComparison = canComparePrices(user);
  const canSelect = canSelectSuppliers(user);
  const canCreateOrders = canCreateOrdersFromQuoteRequest(user);
  const admin = isAdmin(user);
  const isTransferredToQuote = currentStatus === 'transferred_to_quote';
  const hasQuoteRequest = !!quoteRequest;

  const handleBooksChange = async (books) => {
    try { await base44.entities.SupplierBookList.update(bookList.id, { books }); } catch (e) {}
  };

  const updateReq = async (updates) => {
    const updated = { ...quoteRequest, ...updates };
    setQuoteRequest(updated);
    try { await base44.entities.BookQuoteRequest.update(quoteRequest.id, updates); } catch (e) {}
  };

  const updateBooks = async (newBooks, extraUpdates = {}) => {
    setQuoteRequest(r => ({ ...r, books: newBooks, ...extraUpdates }));
    try { await base44.entities.BookQuoteRequest.update(quoteRequest.id, { books: newBooks, ...extraUpdates }); } catch (e) {}
  };

  const handleQuoteRequestCreated = (created) => {
    setQuoteRequest(created);
    setCurrentStatus('transferred_to_quote');
    setTab('receive');
    onRefresh();
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
                {hasQuoteRequest && <><span>·</span><StatusBadge status={quoteRequest.status} entityType="BookQuoteRequest" /></>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {canEdit && !isTransferredToQuote && (
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
            <BookListTab bookList={bookList} isTransferredToQuote={isTransferredToQuote} onBooksChange={handleBooksChange} onStatusChange={changeStatus} inventoryItems={inventoryItems} />
          </TabsContent>

          <TabsContent value="quote" className="flex-1 overflow-y-auto">
            <QuoteRequestTab bookList={bookList} quoteRequest={quoteRequest} suppliers={suppliers} onQuoteRequestCreated={handleQuoteRequestCreated} />
          </TabsContent>

          <TabsContent value="receive" className="flex-1 overflow-y-auto">
            {canReceive && quoteRequest ? <ReceiveQuotesTab req={quoteRequest} suppliers={suppliers} updateBooks={updateBooks} updateReq={updateReq} onRefresh={onRefresh} /> : !quoteRequest ? <p className="text-center py-12 text-muted-foreground">אין בקשת הצעת מחיר עדיין</p> : <NoPermission msg="אין הרשאה לקליטת הצעות מחיר מספקים" />}
          </TabsContent>

          <TabsContent value="comparison" className="flex-1 overflow-y-auto">
            {canViewComparison && quoteRequest ? <ComparisonTab req={quoteRequest} canSelect={canSelect} updateBooks={updateBooks} updateReq={updateReq} /> : !quoteRequest ? <p className="text-center py-12 text-muted-foreground">אין בקשת הצעת מחיר עדיין</p> : <NoPermission msg="אין הרשאה לצפייה בהשוואת מחירים" />}
          </TabsContent>

          <TabsContent value="orders" className="flex-1 overflow-y-auto">
            {quoteRequest ? <OrdersTab req={quoteRequest} canCreateOrders={canCreateOrders} admin={admin} updateReq={updateReq} onRefresh={onRefresh} /> : <p className="text-center py-12 text-muted-foreground">אין בקשת הצעת מחיר עדיין</p>}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}