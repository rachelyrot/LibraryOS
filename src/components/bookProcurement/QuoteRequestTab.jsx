import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { FileSpreadsheet, Loader2, AlertCircle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { generateSupplierExcel, downloadBlob, nylonLabel, bindingLabel, isBindingChecked, bookKey } from '@/lib/bookQuoteExcel';
import { canCreateBookQuoteRequest } from '@/lib/permissions';
import { OverviewTab } from '@/components/bookQuoteRequests/BookQuoteRequestDetail';

/**
 * טאב "בקשת מחיר".
 *
 * רשימת ספרים אינה מוגבלת לבקשה אחת: אחרי שנשלח מחזור ראשון אפשר להוסיף ספרים
 * לרשימה, לסמן אותם "לשליחה" ולפתוח מהם מחזור נוסף. לכן הטאב מציג *גם* את סקירת
 * הבקשה הפעילה (אם יש) *וגם* את טופס היצירה — במקום להחליף את הטופס בסקירה ברגע
 * שנוצרה הבקשה הראשונה, מה שנעל את הרשימה לצמיתות.
 */
export default function QuoteRequestTab({ bookList, sentBookKeys, quoteRequests = [], suppliers, onQuoteRequestCreated }) {
  const cycleCount = quoteRequests.length;
  const [user, setUser] = useState(null);
  const [selectedSupplierIds, setSelectedSupplierIds] = useState([]);
  const [excelUrl, setExcelUrl] = useState('');
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { base44.auth.me().then(setUser).catch(() => {}); }, []);

  // איפוס הטופס אחרי שמחזור נשלח, כדי שהמחזור הבא יתחיל נקי.
  useEffect(() => {
    setSelectedSupplierIds([]);
    setExcelUrl('');
  }, [cycleCount]);

  const canCreate = canCreateBookQuoteRequest(user);

  // רק ספרים חדשים: ספר שכבר יצא במחזור קודם לא נכנס לבקשה שוב, גם אם נשאר
  // עליו סימון "לשליחה" מנתונים ישנים. BookListTab כבר נועל אותו בממשק — זו
  // רשת הביטחון בנקודה שבה הבקשה באמת נוצרת.
  const selectedBooks = (bookList.books || []).filter(b => (
    b.selected_for_quote && !(b.sent_count > 0) && !sentBookKeys?.has(bookKey(b))
  ));
  const bookSuppliers = suppliers.filter(s => s.type === 'ספרים' || s.type === 'books');

  const toggleSupplier = (id) => setSelectedSupplierIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  // יוצר את קובץ ה-Excel לספקים, מוריד אותו ושומר עותק (הקישור נשמר בבקשה).
  // מחזיר את הקישור, או '' אם ההעלאה נכשלה — ההורדה עצמה כבר קרתה.
  const createExcel = async () => {
    const blob = generateSupplierExcel(selectedBooks);
    const filename = `בקשת_הצעת_מחיר_${bookList.title || 'רשימה'}.xlsx`;
    downloadBlob(blob, filename);
    try {
      const file = new File([blob], filename, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setExcelUrl(file_url);
      return file_url;
    } catch {
      return '';
    }
  };

  const handleGenerateExcel = async () => {
    if (selectedBooks.length === 0) { toast.error('אין ספרים מסומנים'); return; }
    setGenerating(true);
    try {
      await createExcel();
      toast.success('קובץ Excel נוצר והורד');
    } catch (e) { toast.error('שגיאה ביצירת קובץ Excel'); }
    setGenerating(false);
  };

  const handleSave = async () => {
    if (selectedSupplierIds.length === 0) { toast.error('יש לבחור לפחות ספק אחד'); return; }
    setSaving(true);
    try {
      // שמירה בלי קובץ — הקובץ נוצר ויורד עכשיו, כדי שלא יישארו בלי קובץ לשלוח
      const fileUrl = excelUrl || await createExcel();
      const selectedSuppliers = suppliers.filter(s => selectedSupplierIds.includes(s.id));
      const books = selectedBooks.map(b => ({
        title: b.title || '', author: b.author || '', publisher: b.publisher || '', isbn: b.isbn || '',
        category: b.category || bookList.category || '', requested_quantity: b.requested_quantity || b.recommended_quantity || 1,
        nylon_required: b.nylon_required || 'any', binding_required: isBindingChecked(b.binding_required),
        existing_in_agron: b.existing_in_agron || false, existing_copies: b.existing_copies || 0,
        system_recommendation: b.system_recommendation || '', selected_for_quote: true, book_status: 'נבחר לבקשה',
        supplier_quotes: [], selected_for_order: false,
      }));
      const data = {
        title: `בקשת הצעת מחיר - ${bookList.title}`, source_book_list_id: bookList.id, source_book_list_title: bookList.title,
        status: 'draft', supplier_ids: selectedSupplierIds,
        supplier_names: selectedSuppliers.map(s => s.name),
        excel_file_url: fileUrl || '', created_by: user?.full_name || user?.email || '',
        books, linked_order_ids: [],
      };
      const created = await base44.entities.BookQuoteRequest.create(data);

      // מנקים את סימון "לשליחה" מהספרים שנשלחו ומסמנים אותם כנשלחו — מכאן הם
      // נעולים לשליחה חוזרת, כך שהמחזור הבא יכיל רק ספרים חדשים.
      const justSent = new Set(selectedBooks.map(bookKey));
      const updatedBooks = (bookList.books || []).map(b => (
        justSent.has(bookKey(b))
          ? { ...b, selected_for_quote: false, sent_count: (b.sent_count || 0) + 1 }
          : b
      ));

      await base44.entities.SupplierBookList.update(bookList.id, {
        linked_quote_request_id: created.id,
        status: 'transferred_to_quote',
        books: updatedBooks,
      });
      toast.success('בקשת הצעת מחיר נוצרה', { description: 'קובץ ה-Excel לספקים הורד. אפשר להוריד אותו שוב בכל זמן מכרטיס המחזור.' });
      onQuoteRequestCreated(created, updatedBooks);
    } catch (e) { toast.error('שגיאה בשמירת הבקשה'); }
    setSaving(false);
  };

  if (!canCreate) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <AlertCircle className="w-10 h-10 mb-3 opacity-40" />
        <p>אין הרשאה ליצירת בקשת הצעת מחיר</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-2">
      {/* כל המחזורים שכבר נשלחו, זה אחרי זה — בלי לבחור ביניהם. */}
      {quoteRequests.map((req, i) => (
        <div key={req.id} className="border border-border rounded-xl overflow-hidden">
          <div className="px-3 py-2 bg-muted/40 border-b border-border text-sm font-bold">
            מחזור {i + 1} · {(req.books || []).length} ספרים
          </div>
          <div className="p-1">
            <OverviewTab req={req} suppliers={suppliers} />
          </div>
        </div>
      ))}

      {cycleCount > 0 && (
        <div className="text-sm font-bold pt-1">מחזור חדש מאותה רשימה</div>
      )}

      {selectedBooks.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <FileSpreadsheet className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>לא נבחרו ספרים לשליחה</p>
          <p className="text-sm mt-1">
            {cycleCount > 0
              ? 'אפשר להוסיף ספרים בטאב "רשימת ספרים", לסמן אותם ב"לשליחה" ולפתוח מכאן מחזור נוסף.'
              : 'סמני ספרים בטאב "רשימת ספרים" (עמודת "לשליחה") וחזרי לכאן'}
          </p>
        </div>
      ) : (
        <>
          <div className="border border-border rounded-xl p-3 bg-muted/20">
            <h3 className="font-bold text-sm mb-2">ספרים שנבחרו ({selectedBooks.length})</h3>
            <div className="max-h-32 overflow-y-auto space-y-1">
              {selectedBooks.map((b, i) => (
                <div key={i} className="text-xs flex justify-between">
                  <span className="font-medium">{b.title || 'ספר ללא שם'}</span>
                  <span className="text-muted-foreground">כמות: {b.requested_quantity || b.recommended_quantity || 1} · {nylonLabel(b.nylon_required)} · {bindingLabel(b.binding_required)}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label>בחירת ספקים להצעת מחיר (ספקי ספרים בלבד)</Label>
            <div className="border border-border rounded-xl p-3 max-h-48 overflow-y-auto space-y-2">
              {bookSuppliers.length === 0 ? <p className="text-sm text-muted-foreground text-center py-4">אין ספקים מסוג "ספרים" במערכת</p> : bookSuppliers.map(s => (
                <label key={s.id} className="flex items-center gap-3 cursor-pointer hover:bg-muted/30 rounded-lg p-1.5">
                  <Checkbox checked={selectedSupplierIds.includes(s.id)} onCheckedChange={() => toggleSupplier(s.id)} />
                  <div className="flex-1"><span className="text-sm font-medium">{s.name}</span>{s.email && <span className="text-xs text-muted-foreground mr-2">{s.email}</span>}</div>
                </label>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" onClick={handleGenerateExcel} disabled={generating || selectedBooks.length === 0} className="gap-1.5">
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
              {generating ? 'יוצר...' : 'צור והורד קובץ Excel'}
            </Button>
            {excelUrl && <span className="text-xs text-green-600 flex items-center gap-1"><FileSpreadsheet className="w-3 h-3" /> קובץ מוכן</span>}
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button onClick={handleSave} disabled={saving || selectedSupplierIds.length === 0} className="gap-1.5">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
              {saving ? 'שומר...' : excelUrl ? 'שמור בקשה' : 'שמור בקשה והורד Excel'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}