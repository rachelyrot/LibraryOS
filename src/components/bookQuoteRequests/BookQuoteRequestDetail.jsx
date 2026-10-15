import { useEffect, useState, Fragment } from 'react';
import { Link } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, Send, ShoppingCart, ExternalLink, Mail, FileSpreadsheet, Loader2, Check, AlertCircle, Lock } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import StatusBadge from '@/components/StatusBadge';
import { generateSupplierExcel, supplierExcelName, downloadBlob, parseSupplierQuote, sheetToQuoteRows, describePriceColumns, matchQuoteToBook, computeCheapestSuppliers, getEffectivePrice, nylonLabel, normalizeNylon, bindingLabel, isBindingChecked } from '@/lib/bookQuoteExcel';
import * as XLSX from 'xlsx';
import { canReceiveQuotePrices, canComparePrices, canSelectSuppliers, canCreateOrdersFromQuoteRequest, isAdmin } from '@/lib/permissions';
import { cn } from '@/lib/utils';

export default function BookQuoteRequestDetail({ request, onClose, onRefresh }) {
  const [user, setUser] = useState(null);
  const [req, setReq] = useState(null);
  const [suppliers, setSuppliers] = useState([]);
  const [tab, setTab] = useState('overview');

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
    base44.entities.Supplier.list('name', 500).then(setSuppliers).catch(() => {});
  }, []);

  useEffect(() => {
    if (request) {
      setReq({ ...request });
      setTab('overview');
    }
  }, [request]);

  if (!request || !req) return null;

  const canReceive = canReceiveQuotePrices(user);
  const canViewComparison = canComparePrices(user);
  const canSelect = canSelectSuppliers(user);
  const canCreateOrders = canCreateOrdersFromQuoteRequest(user);
  const admin = isAdmin(user);

  const updateReq = async (updates) => {
    const updated = { ...req, ...updates };
    setReq(updated);
    try { await base44.entities.BookQuoteRequest.update(req.id, updates); } catch (e) {}
  };

  const updateBooks = async (newBooks, extraUpdates = {}) => {
    setReq(r => ({ ...r, books: newBooks, ...extraUpdates }));
    try { await base44.entities.BookQuoteRequest.update(req.id, { books: newBooks, ...extraUpdates }); } catch (e) {}
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-7xl max-h-[92vh] overflow-hidden flex flex-col font-heebo">
        <DialogHeader className="shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-xl">{req.title}</DialogTitle>
              <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                {req.source_book_list_title && <span>מרשימה: {req.source_book_list_title}</span>}
                <span>·</span>
                <StatusBadge status={req.status} entityType="BookQuoteRequest" />
                {req.sent_date && <span>· נשלחה: {new Date(req.sent_date).toLocaleDateString('he-IL')}</span>}
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={onClose}>סגור</Button>
          </div>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab} className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="shrink-0">
            <TabsTrigger value="overview">סקירה</TabsTrigger>
            <TabsTrigger value="receive">קליטת הצעות</TabsTrigger>
            <TabsTrigger value="comparison">השוואת מחירים</TabsTrigger>
            <TabsTrigger value="orders">הזמנות רכש</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="flex-1 overflow-y-auto">
            <OverviewTab req={req} suppliers={suppliers} />
          </TabsContent>

          <TabsContent value="receive" className="flex-1 overflow-y-auto">
            {canReceive ? (
              <ReceiveQuotesTab req={req} suppliers={suppliers} updateBooks={updateBooks} updateReq={updateReq} onRefresh={onRefresh} />
            ) : (
              <NoPermission msg="אין הרשאה לקליטת הצעות מחיר מספקים" />
            )}
          </TabsContent>

          <TabsContent value="comparison" className="flex-1 overflow-y-auto">
            {canViewComparison ? (
              <ComparisonTab req={req} canSelect={canSelect} updateBooks={updateBooks} updateReq={updateReq} />
            ) : (
              <NoPermission msg="אין הרשאה לצפייה בהשוואת מחירים" />
            )}
          </TabsContent>

          <TabsContent value="orders" className="flex-1 overflow-y-auto">
            <OrdersTab req={req} canCreateOrders={canCreateOrders} admin={admin} updateReq={updateReq} onRefresh={onRefresh} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

export function NoPermission({ msg }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
      <Lock className="w-10 h-10 mb-3 opacity-40" />
      <p>{msg}</p>
    </div>
  );
}

// ── Overview Tab ──────────────────────────────────────────────
export function OverviewTab({ req, suppliers }) {
  const selectedSuppliers = (req.supplier_ids || []).map(id => suppliers.find(s => s.id === id)).filter(Boolean);
  const booksWithQuotes = (req.books || []).filter(b => (b.supplier_quotes || []).some(q => q.matched));
  const booksSelected = (req.books || []).filter(b => b.selected_for_order);
  return (
    <div className="space-y-4 p-2" dir="rtl">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="ספרים בבקשה" value={(req.books || []).length} />
        <Stat label="ספקים שקיבלו" value={(req.supplier_ids || []).length} />
        <Stat label="ספרים עם הצעות" value={booksWithQuotes.length} />
        <Stat label="נבחרו להזמנה" value={booksSelected.length} />
      </div>

      <div className="border border-border rounded-xl p-4">
        <h3 className="font-bold text-sm mb-2">ספקים שקיבלו את הבקשה</h3>
        {selectedSuppliers.length === 0 ? (
          <p className="text-sm text-muted-foreground">טרם נשלח לספקים</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {selectedSuppliers.map(s => (
              <span key={s.id} className="text-xs bg-secondary text-secondary-foreground px-2 py-1 rounded-full">{s.name} {s.email ? `· ${s.email}` : ''}</span>
            ))}
          </div>
        )}
      </div>

      {/* הקובץ לספקים נוצר מחדש מהספרים של הבקשה בכל לחיצה — כך אפשר להוריד
          אותו גם אחרי שמירת הבקשה, ולא רק לפניה */}
      {(req.books || []).length > 0 && (
        <div className="border border-border rounded-xl p-4 space-y-2">
          <div>
            <h3 className="font-bold text-sm">קובץ Excel לספקים</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {(req.books || []).length} הספרים של הבקשה, בפורמט של הספקים (שם כותר, מחבר/ת, הו"ל, ניילון/למינציה, כמות, מק"ט, מחיר, סה"כ לשורה). קובץ נפרד לכל ספק — שם הספק מופיע בכותרות.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(selectedSuppliers.length ? selectedSuppliers : [{ id: '__none', name: '' }]).map(s => (
              <Button key={s.id} size="sm" variant="outline" className="gap-1.5" onClick={() => {
                const list = req.source_book_list_title || req.title;
                downloadBlob(generateSupplierExcel(req.books || [], s.name), supplierExcelName(list, s.name));
              }}>
                <FileSpreadsheet className="w-4 h-4" /> {s.name ? `הורדה ל${s.name}` : 'הורדת קובץ Excel'}
              </Button>
            ))}
          </div>
        </div>
      )}

      {(req.email_subject || req.email_body) && (
        <div className="border border-border rounded-xl p-4">
          <h3 className="font-bold text-sm mb-2 flex items-center gap-1.5"><Mail className="w-4 h-4" /> תוכן המייל</h3>
          <p className="text-sm font-medium mb-1">{req.email_subject}</p>
          <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-heebo">{req.email_body}</pre>
        </div>
      )}

      {req.notes && (
        <div className="border border-border rounded-xl p-4">
          <h3 className="font-bold text-sm mb-2">הערות</h3>
          <p className="text-sm text-muted-foreground">{req.notes}</p>
        </div>
      )}
    </div>
  );
}

export function Stat({ label, value }) {
  return (
    <div className="bg-card border border-border rounded-xl p-3 text-center">
      <p className="text-2xl font-bold text-primary">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

// ── Receive Quotes Tab ────────────────────────────────────────
export function ReceiveQuotesTab({ req, suppliers, updateBooks, updateReq, onRefresh }) {
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [parsing, setParsing] = useState(false);
  const bookSuppliers = suppliers.filter(s => (req.supplier_ids || []).includes(s.id));

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !selectedSupplierId) { toast.error('יש לבחור ספק תחילה'); return; }
    setParsing(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      // שורת הכותרות לא תמיד ראשונה (לוגו / כותרת מעליה) — sheetToQuoteRows מוצאת אותה
      const rows = sheetToQuoteRows(ws);
      const quotes = parseSupplierQuote(rows);
      if (quotes.length === 0) { toast.error('לא זוהו ספרים בקובץ', { description: 'צריך עמודה של שם ספר או ISBN' }); setParsing(false); return; }
      const priceColumn = describePriceColumns(rows);
      if (!priceColumn) {
        toast.error('לא נמצאה בקובץ עמודת מחיר', { description: `עמודות בקובץ: ${Object.keys(rows[0]).join(', ')}` });
        setParsing(false);
        e.target.value = '';
        return;
      }

      const supplier = suppliers.find(s => s.id === selectedSupplierId);
      const books = [...(req.books || [])];
      let matchedCount = 0;
      let unmatchedCount = 0;
      let pricedCount = 0;
      for (const q of quotes) {
        const { matched, bookIndex } = matchQuoteToBook(q, books);
        if (matched && bookIndex != null) {
          if (q.price_with_nylon != null || q.price_without_nylon != null) pricedCount++;
          const existingQuotes = books[bookIndex].supplier_quotes || [];
          const filtered = existingQuotes.filter(sq => sq.supplier_id !== selectedSupplierId);
          books[bookIndex] = {
            ...books[bookIndex],
            supplier_quotes: [...filtered, {
              supplier_id: selectedSupplierId,
              supplier_name: supplier?.name || '',
              price_with_nylon: q.price_with_nylon,
              price_without_nylon: q.price_without_nylon,
              availability: q.availability || '',
              delivery_time: q.delivery_time || '',
              notes: q.notes || '',
              matched: true,
            }],
          };
          matchedCount++;
        } else {
          unmatchedCount++;
        }
      }
      const withCheapest = computeCheapestSuppliers(books);
      // Determine new status
      const supplierCount = (req.supplier_ids || []).length;
      const suppliersWithQuotes = new Set();
      withCheapest.forEach(b => (b.supplier_quotes || []).forEach(q => { if (q.matched) suppliersWithQuotes.add(q.supplier_id); }));
      let newStatus = req.status;
      if (suppliersWithQuotes.size >= supplierCount) newStatus = 'all_quotes_received';
      else if (suppliersWithQuotes.size > 0) newStatus = 'partial_quotes';
      await updateBooks(withCheapest, { status: newStatus });
      if (matchedCount === 0) {
        toast.error('לא נמצאו התאמות לספרים בקובץ. ודאי ששמות הספרים או ה-ISBN תואמים לרשימת הבקשה.', { description: `${unmatchedCount} שורות התקבלו ללא התאמה` });
      } else {
        toast.success(`נקלטה הצעה מ${supplier?.name || 'הספק'}: ${matchedCount} ספרים, ${pricedCount} עם מחיר`, {
          description: `עמודת מחיר: ${priceColumn}${unmatchedCount ? ` · ${unmatchedCount} שורות בקובץ לא הותאמו לספר` : ''}`,
        });
      }
      onRefresh?.();
    } catch (e) {
      toast.error('שגיאה בקריאת הקובץ');
    }
    setParsing(false);
    e.target.value = '';
  };

  return (
    <div className="space-y-4 p-2" dir="rtl">
      <div className="border border-border rounded-xl p-4 space-y-3" dir="rtl">
        <h3 className="font-bold text-sm">קליטת הצעת מחיר מספק</h3>
        <div className="space-y-1.5">
          <Label>ספק שממנו התקבלה ההצעה</Label>
          <Select value={selectedSupplierId} onValueChange={setSelectedSupplierId}>
            <SelectTrigger><SelectValue placeholder="בחר ספק" /></SelectTrigger>
            <SelectContent>
              {bookSuppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>קובץ Excel מהספק</Label>
          <label className={cn('flex items-center gap-2 cursor-pointer border-2 border-dashed border-border rounded-lg px-3 py-3 hover:border-green-400 transition-colors', (!selectedSupplierId || parsing) && 'opacity-60 pointer-events-none')}>
            {parsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4 text-muted-foreground" />}
            <span className="text-sm text-muted-foreground">
              {parsing ? 'קורא ומשייך...' : 'לחצי להעלאת קובץ Excel מהספק'}
            </span>
            <input type="file" className="hidden" onChange={handleUpload} disabled={!selectedSupplierId || parsing} accept=".csv,.xlsx,.xls" />
          </label>
          <p className="text-xs text-muted-foreground">המערכת תקרא: שם ספר, מחבר, הוצאה, ISBN, מחיר עם/בלי ניילון, זמינות, זמן אספקה, הערות. התאמה לפי ISBN או שם+מחבר+הוצאה.</p>
        </div>
      </div>

      {/* Quotes received summary */}
      <div className="border border-border rounded-xl p-4">
        <h3 className="font-bold text-sm mb-2">הצעות שהתקבלו</h3>
        {(req.supplier_ids || []).map(sid => {
          const sup = suppliers.find(s => s.id === sid);
          const count = (req.books || []).filter(b => (b.supplier_quotes || []).some(q => q.supplier_id === sid && q.matched)).length;
          return (
            <div key={sid} className="flex items-center justify-between text-sm py-1">
              <span>{sup?.name || sid}</span>
              <span className={cn('text-xs px-2 py-0.5 rounded-full', count > 0 ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground')}>
                {count > 0 ? `${count} ספרים` : 'טרם התקבלה'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Comparison Tab ────────────────────────────────────────────
export function ComparisonTab({ req, canSelect, updateBooks, updateReq }) {
  // הזול ביותר מחושב כאן מהמחירים בכל רינדור, ולא נקרא מ-cheapest_supplier_id
  // שנשמר בקליטת ההצעה — זה התיישן כשמשנים דרישת ניילון או קולטים קובץ שוב,
  // ואז "בחר זול ביותר" בחר לפי ערך ישן או לא בחר כלום.
  const books = computeCheapestSuppliers(req.books || []);
  const supplierIds = req.supplier_ids || [];
  const [reasonModal, setReasonModal] = useState(null); // { bookIndex, supplierId }
  const quotedCount = books.filter(b => (b.supplier_quotes || []).some(q => q.matched)).length;
  const pricedCount = books.filter(b => b.cheapest_supplier_id).length;

  const handleSelectSupplier = (bookIndex, supplierId) => {
    const book = books[bookIndex];
    if (supplierId === book.cheapest_supplier_id) {
      // Selecting cheapest — no reason needed
      const updated = [...books];
      updated[bookIndex] = { ...book, selected_supplier_id: supplierId, selected_supplier_name: getSupplierName(req, supplierId), selection_reason: '', selected_for_order: true };
      updateBooks(updated);
    } else {
      // Selecting non-cheapest — require reason
      setReasonModal({ bookIndex, supplierId });
    }
  };

  const confirmReason = (reason) => {
    if (!reason.trim()) { toast.error('יש להזין סיבה'); return; }
    const { bookIndex, supplierId } = reasonModal;
    const updated = [...books];
    updated[bookIndex] = { ...updated[bookIndex], selected_supplier_id: supplierId, selected_supplier_name: getSupplierName(req, supplierId), selection_reason: reason.trim(), selected_for_order: true };
    updateBooks(updated);
    setReasonModal(null);
  };

  // בוחר את הזול ביותר לכל ספר שיש לו מחיר. ספר בלי מחיר שומר את הבחירה שהייתה
  // לו (במקום שהיא תימחק), והסטטוס מתקדם רק כשבאמת נבחר משהו.
  const autoSelectAll = () => {
    if (pricedCount === 0) {
      toast.error('אין עדיין מחירים להשוואה', { description: 'קלטי קודם את קבצי הספקים בשלב "קליטת הצעות"' });
      return;
    }
    const updated = books.map(b => (b.cheapest_supplier_id ? {
      ...b,
      selected_supplier_id: b.cheapest_supplier_id,
      selected_supplier_name: getSupplierName(req, b.cheapest_supplier_id),
      selection_reason: '',
      selected_for_order: true,
    } : b));
    updateBooks(updated, { status: 'suppliers_selected' });
    const missing = books.length - pricedCount;
    toast.success(`נבחר הספק הזול ביותר ל-${pricedCount} ספרים`, missing ? { description: `ל-${missing} ספרים אין עדיין מחיר מאף ספק` } : undefined);
  };

  if (books.length === 0) return <p className="text-center py-12 text-muted-foreground">אין ספרים בבקשה</p>;

  return (
    <div className="space-y-3 p-2" dir="rtl">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">ברירת מחדל: הספק הזול ביותר לפי העדפת ניילון. ניתן לבחור ספק אחר ידנית (חובה לציין סיבה).</p>
        {canSelect && (
          <Button onClick={autoSelectAll} size="sm" variant="outline" className="gap-1.5 shrink-0" disabled={pricedCount === 0}>
            <Check className="w-3.5 h-3.5" /> בחר זול ביותר להכל ({pricedCount})
          </Button>
        )}
      </div>
      {pricedCount < books.length && (
        <div className="flex items-start gap-2 text-sm rounded-lg border border-amber-200 bg-amber-50 text-amber-800 px-3 py-2">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            {quotedCount === 0
              ? 'עדיין לא נקלטה הצעת מחיר אף ספק לבקשה הזו. בשלב "קליטת הצעות" בוחרים ספק ומעלים את קובץ ה-Excel שלו.'
              : `ל-${books.length - pricedCount} מתוך ${books.length} ספרים אין עדיין מחיר מאף ספק — הם לא ייבחרו אוטומטית.`}
          </span>
        </div>
      )}

      <div className="overflow-x-auto border border-border rounded-xl">
        <table className="w-full text-xs" dir="rtl">
          <thead className="sticky top-0 bg-muted/50 z-10">
            <tr className="border-b border-border">
              <th className="text-right p-2 font-medium text-muted-foreground sticky right-0 bg-muted/50">שם ספר</th>
              <th className="text-right p-2 font-medium text-muted-foreground hidden md:table-cell">מחבר</th>
              <th className="text-center p-2 font-medium text-muted-foreground">כמות</th>
              <th className="text-center p-2 font-medium text-muted-foreground hidden md:table-cell">ניילון</th>
              <th className="text-center p-2 font-medium text-muted-foreground hidden md:table-cell">כריכה</th>
              <th className="text-center p-2 font-medium text-muted-foreground hidden lg:table-cell">אגרון</th>
              {supplierIds.map(sid => {
                const sup = getSupplierName(req, sid);
                return (
                  <th key={sid} className="text-center p-2 font-medium text-muted-foreground" colSpan={2}>{sup}</th>
                );
              })}
              <th className="text-center p-2 font-medium text-muted-foreground">זול ביותר</th>
              <th className="text-center p-2 font-medium text-muted-foreground">ספק שנבחר</th>
            </tr>
            <tr className="border-b border-border bg-muted/30">
              <th className="p-1 sticky right-0 bg-muted/30"></th>
              <th className="p-1 hidden md:table-cell"></th>
              <th className="p-1"></th>
              <th className="p-1 hidden md:table-cell"></th>
              <th className="p-1 hidden md:table-cell"></th>
              <th className="p-1 hidden lg:table-cell"></th>
              {supplierIds.map(sid => (
                <Fragment key={sid}>
                  <th className="text-center p-1 font-normal text-muted-foreground">עם ניילון</th>
                  <th className="text-center p-1 font-normal text-muted-foreground">בלי ניילון</th>
                </Fragment>
              ))}
              <th className="p-1"></th>
              <th className="p-1"></th>
            </tr>
          </thead>
          <tbody>
            {books.map((b, i) => {
              const cheapest = b.cheapest_supplier_id;
              const selected = b.selected_supplier_id;
              const nylon = normalizeNylon(b.nylon_required);
              return (
                <tr key={i} className={cn('border-b border-border/50', selected && 'bg-green-50/30')}>
                  <td className="p-2 sticky right-0 bg-card font-medium">{b.title || '-'}</td>
                  <td className="p-2 hidden md:table-cell text-muted-foreground">{b.author || '-'}</td>
                  <td className="p-2 text-center">{b.requested_quantity || 1}</td>
                  <td className="p-2 text-center hidden md:table-cell">
                    <span className="text-xs bg-secondary text-secondary-foreground px-1.5 py-0.5 rounded">{nylonLabel(b.nylon_required)}</span>
                  </td>
                  <td className="p-2 text-center hidden md:table-cell">
                    {isBindingChecked(b.binding_required)
                      ? <span className="text-xs bg-secondary text-secondary-foreground px-1.5 py-0.5 rounded">כריכה</span>
                      : <span className="text-xs text-muted-foreground">-</span>}
                  </td>
                  <td className="p-2 text-center hidden lg:table-cell">
                    {b.existing_in_agron ? <span className="text-xs bg-blue-100 text-blue-700 px-1 rounded">{b.existing_copies || 0}</span> : <span className="text-xs text-muted-foreground">-</span>}
                  </td>
                  {supplierIds.map(sid => {
                    const q = (b.supplier_quotes || []).find(sq => sq.supplier_id === sid && sq.matched);
                    const isCheapest = cheapest === sid;
                    return (
                      <Fragment key={sid}>
                        <td className={cn('p-2 text-center font-mono', isCheapest && nylon === 'with_nylon' && 'bg-green-100 text-green-700 font-bold', isCheapest && nylon === 'any' && 'bg-green-50 text-green-600')}>
                          {q?.price_with_nylon != null ? `₪${q.price_with_nylon}` : q ? <span className="text-[10px] text-muted-foreground font-sans">אין מחיר</span> : '-'}
                        </td>
                        <td className={cn('p-2 text-center font-mono', isCheapest && nylon === 'without_nylon' && 'bg-green-100 text-green-700 font-bold', isCheapest && nylon === 'any' && 'bg-green-50 text-green-600')}>
                          {q?.price_without_nylon != null ? `₪${q.price_without_nylon}` : q ? <span className="text-[10px] text-muted-foreground font-sans">אין מחיר</span> : '-'}
                        </td>
                      </Fragment>
                    );
                  })}
                  <td className="p-2 text-center">
                    {cheapest ? (
                      <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">₪{b.cheapest_price?.toFixed(2)} · {getSupplierName(req, cheapest)}</span>
                    ) : <span className="text-xs text-muted-foreground">-</span>}
                  </td>
                  <td className="p-2 text-center">
                    {canSelect ? (
                      <Select value={selected || ''} onValueChange={v => handleSelectSupplier(i, v)}>
                        <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="בחר" /></SelectTrigger>
                        <SelectContent>
                          {supplierIds.map(sid => {
                            const hasQuote = (b.supplier_quotes || []).some(sq => sq.supplier_id === sid && sq.matched);
                            if (!hasQuote) return null;
                            return <SelectItem key={sid} value={sid}>{getSupplierName(req, sid)}{sid === cheapest ? ' (זול)' : ''}</SelectItem>;
                          })}
                        </SelectContent>
                      </Select>
                    ) : selected ? (
                      <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">{getSupplierName(req, selected)}</span>
                    ) : <span className="text-xs text-muted-foreground">-</span>}
                    {b.selection_reason && <p className="text-[10px] text-amber-600 mt-0.5">{b.selection_reason}</p>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {reasonModal && (
        <ReasonDialog reasonModal={reasonModal} onClose={() => setReasonModal(null)} onConfirm={confirmReason} />
      )}
    </div>
  );
}

export function getSupplierName(req, sid) {
  const idx = (req.supplier_ids || []).indexOf(sid);
  return idx >= 0 ? (req.supplier_names || [])[idx] || sid : sid;
}

export function ReasonDialog({ reasonModal, onClose, onConfirm }) {
  const [reason, setReason] = useState('');
  const reasons = ['זמן אספקה מהיר יותר', 'איכות שירות', 'זמינות', 'שיקול מקצועי', 'אחר'];
  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-sm font-heebo" dir="rtl">
        <DialogHeader><DialogTitle>סיבת בחירת ספק אחר</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">נבחר ספק שאינו הזול ביותר. נא לציין סיבה.</p>
        <div className="space-y-2">
          {reasons.map(r => (
            <button key={r} onClick={() => setReason(r)} className={cn('w-full text-right text-sm border rounded-lg px-3 py-2 transition-colors', reason === r ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/30')}>{r}</button>
          ))}
          {reason === 'אחר' && <Textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="פרטי הסיבה" rows={2} />}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>ביטול</Button>
          <Button onClick={() => onConfirm(reason)} disabled={!reason.trim()} className="bg-primary text-white">אשר בחירה</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Orders Tab ────────────────────────────────────────────────
export function OrdersTab({ req, canCreateOrders, admin, updateReq, onRefresh }) {
  const [creating, setCreating] = useState(false);
  const linkedOrders = req.linked_order_ids || [];
  const alreadyCreated = linkedOrders.length > 0;

  const selectedBooks = (req.books || []).filter(b => b.selected_for_order && b.selected_supplier_id);
  const bySupplier = {};
  selectedBooks.forEach(b => {
    if (!bySupplier[b.selected_supplier_id]) bySupplier[b.selected_supplier_id] = [];
    bySupplier[b.selected_supplier_id].push(b);
  });

  const handleCreateOrders = async () => {
    if (selectedBooks.length === 0) { toast.error('אין ספרים עם ספק נבחר'); return; }
    setCreating(true);
    try {
      const createdIds = [];
      for (const [supplierId, books] of Object.entries(bySupplier)) {
        const supplierName = books[0]?.selected_supplier_name || getSupplierName(req, supplierId);
        const items = books.map(b => {
          const q = (b.supplier_quotes || []).find(sq => sq.supplier_id === supplierId && sq.matched);
          const unitPrice = getEffectivePrice(b, q) || 0;
          const qty = b.requested_quantity || 1;
          return {
            name: b.title || 'ספר ללא שם',
            description: [b.author, b.publisher].filter(Boolean).join(' · '),
            quantity: qty,
            unit_price: unitPrice,
            total: unitPrice * qty,
            isbn: b.isbn || '',
            notes: `${nylonLabel(b.nylon_required)} · ${bindingLabel(b.binding_required)}`,
          };
        });
        const total = items.reduce((s, i) => s + i.total, 0);
        const po = await base44.entities.PurchaseOrder.create({
          title: `הזמנה מבקשת הצעת מחיר: ${req.title} - ${supplierName}`,
          supplier_id: supplierId,
          supplier_name: supplierName,
          category: 'ספרים',
          order_type: 'books',
          status: 'draft',
          total_amount: total,
          items,
          notes: `נוצר מבקשת הצעת מחיר "${req.title}"`,
          source_book_quote_request_id: req.id,
        });
        createdIds.push(po.id);
      }
      await updateReq({ linked_order_ids: [...linkedOrders, ...createdIds], status: 'transferred_to_orders' });
      toast.success(`נוצרו ${createdIds.length} הזמנות רכש`);
      onRefresh?.();
    } catch (e) {
      toast.error('שגיאה ביצירת הזמנות');
    }
    setCreating(false);
  };

  return (
    <div className="space-y-4 p-2" dir="rtl">
      {alreadyCreated && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <h3 className="font-bold text-sm text-green-700 mb-2 flex items-center gap-1.5"><Check className="w-4 h-4" /> כבר נוצרו הזמנות רכש מבקשה זו</h3>
          <div className="space-y-1">
            {linkedOrders.map(id => (
              <Link key={id} to={`/orders/${id}`} className="text-sm text-blue-600 flex items-center gap-1.5 hover:underline">
                <ExternalLink className="w-3.5 h-3.5" /> {id.slice(0, 8)}...
              </Link>
            ))}
          </div>
          {!admin && <p className="text-xs text-muted-foreground mt-2">יצירת הזמנות נוספות מבקשה זו מוגבלת למנהלת מערכת</p>}
        </div>
      )}

      {!canCreateOrders ? (
        <NoPermission msg="אין הרשאה ליצירת הזמנות רכש מבקשה זו" />
      ) : !alreadyCreated || admin ? (
        <>
          <div className="border border-border rounded-xl p-4">
            <h3 className="font-bold text-sm mb-3">סיכום הזמנות ליצירה ({Object.keys(bySupplier).length} ספקים)</h3>
            {Object.keys(bySupplier).length === 0 ? (
              <p className="text-sm text-muted-foreground">אין ספרים עם ספק נבחר. יש לבחור ספקים בטאב "השוואת מחירים" תחילה.</p>
            ) : (
              <div className="space-y-2">
                {Object.entries(bySupplier).map(([sid, books]) => {
                  const total = books.reduce((s, b) => {
                    const q = (b.supplier_quotes || []).find(sq => sq.supplier_id === sid && sq.matched);
                    const price = getEffectivePrice(b, q) || 0;
                    return s + price * (b.requested_quantity || 1);
                  }, 0);
                  return (
                    <div key={sid} className="flex justify-between items-center bg-muted/30 rounded-lg px-3 py-2">
                      <div>
                        <p className="text-sm font-medium">{books[0]?.selected_supplier_name || getSupplierName(req, sid)}</p>
                        <p className="text-xs text-muted-foreground">{books.length} ספרים</p>
                      </div>
                      <span className="text-sm font-bold text-green-600">₪{total.toLocaleString('he-IL')}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {alreadyCreated && admin && (
            <div className="flex items-start gap-2 text-sm text-amber-600 bg-amber-50 rounded-lg p-3">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>כבר נוצרו הזמנות מבקשה זו. יצירה נוספת עלולה לגרום לכפילויות.</span>
            </div>
          )}

          <Button onClick={handleCreateOrders} disabled={creating || Object.keys(bySupplier).length === 0}
            className="gap-2 bg-gradient-to-l from-green-500 to-emerald-500 text-white border-0 hover:opacity-90">
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShoppingCart className="w-4 h-4" />}
            {creating ? 'יוצר...' : `צור הזמנות רכש (${Object.keys(bySupplier).length})`}
          </Button>
        </>
      ) : null}
    </div>
  );
}