import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { FileSpreadsheet, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { generateSupplierExcel, downloadBlob, nylonLabel } from '@/lib/bookQuoteExcel';

export default function CreateQuoteRequestDialog({ open, onOpenChange, bookList, suppliers, onCreated }) {
  const [user, setUser] = useState(null);
  const [selectedSupplierIds, setSelectedSupplierIds] = useState([]);
  const [excelUrl, setExcelUrl] = useState('');
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [quantities, setQuantities] = useState({});

  useEffect(() => {
    if (open) {
      base44.auth.me().then(setUser).catch(() => {});
      setSelectedSupplierIds([]);
      setExcelUrl('');
    }
  }, [open]);

  // Re-init quantities to 0 whenever dialog opens
  useEffect(() => {
    if (!open) return;
    const q = {};
    (bookList?.books || []).filter(b => b.selected_for_quote).forEach((_, i) => {
      q[i] = 0;
    });
    setQuantities(q);
  }, [open, bookList]);

  if (!bookList) return null;

  const selectedBooks = (bookList.books || []).filter(b => b.selected_for_quote);
  const bookSuppliers = suppliers.filter(s => s.type === 'ספרים' || s.type === 'books');

  const toggleSupplier = (id) => {
    setSelectedSupplierIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleGenerateExcel = async () => {
    if (selectedBooks.length === 0) { toast.error('אין ספרים מסומנים'); return; }
    setGenerating(true);
    try {
      const blob = generateSupplierExcel(selectedBooks);
      const filename = `בקשת_הצעת_מחיר_${bookList.title || 'רשימה'}.xlsx`;
      downloadBlob(blob, filename);
      const file = new File([blob], filename, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setExcelUrl(file_url);
      toast.success('קובץ Excel נוצר והורד');
    } catch (e) {
      toast.error('שגיאה ביצירת קובץ Excel');
    }
    setGenerating(false);
  };

  const handleSave = async () => {
    if (selectedSupplierIds.length === 0) { toast.error('יש לבחור לפחות ספק אחד'); return; }
    setSaving(true);
    try {
      const selectedSuppliers = suppliers.filter(s => selectedSupplierIds.includes(s.id));
      const books = selectedBooks.map((b, i) => ({
        title: b.title || '',
        author: b.author || '',
        publisher: b.publisher || '',
        isbn: b.isbn || '',
        category: b.category || bookList.category || '',
        requested_quantity: quantities[i] ?? b.requested_quantity ?? 1,
        nylon_required: b.nylon_required || 'any',
        existing_in_agron: b.existing_in_agron || false,
        existing_copies: b.existing_copies || 0,
        system_recommendation: b.system_recommendation || '',
        selected_for_quote: true,
        book_status: 'נבחר לבקשה',
        supplier_quotes: [],
        selected_for_order: false,
      }));
      const data = {
        title: `בקשת הצעת מחיר - ${bookList.title}`,
        source_book_list_id: bookList.id,
        source_book_list_title: bookList.title,
        status: 'draft',
        supplier_ids: selectedSupplierIds,
        supplier_names: selectedSuppliers.map(s => s.name),
        excel_file_url: excelUrl || '',
        created_by: user?.full_name || user?.email || '',
        books,
        linked_order_ids: [],
      };
      const created = await base44.entities.BookQuoteRequest.create(data);
      await base44.entities.SupplierBookList.update(bookList.id, { linked_quote_request_id: created.id });
      toast.success('בקשת הצעת מחיר נוצרה!');
      onCreated?.(created);
      onOpenChange(false);
    } catch (e) {
      toast.error('שגיאה בשמירת הבקשה');
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto font-heebo" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileSpreadsheet className="w-5 h-5" /> צור בקשת הצעת מחיר לספקים</DialogTitle>
          <p className="text-sm text-muted-foreground">{bookList.title} · {selectedBooks.length} ספרים מסומנים</p>
        </DialogHeader>

        <div className="space-y-4">
          {/* Selected books summary */}
          <div className="border border-border rounded-xl p-3 bg-muted/20">
            <h3 className="font-bold text-sm mb-2">ספרים שנבחרו ({selectedBooks.length})</h3>
            <div className="max-h-48 overflow-y-auto space-y-1.5">
              {selectedBooks.map((b, i) => (
                <div key={i} className="text-xs flex items-center justify-between gap-2">
                  <span className="font-medium flex-1 truncate">{b.title || 'ספר ללא שם'}</span>
                  <span className="text-muted-foreground shrink-0">{nylonLabel(b.nylon_required)}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-muted-foreground">כמות:</span>
                    <Input
                      type="number" min="0"
                      className="h-6 w-16 text-xs px-1"
                      value={quantities[i] ?? 0}
                      onChange={e => setQuantities(q => ({ ...q, [i]: parseInt(e.target.value) || 0 }))}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Supplier selection */}
          <div className="space-y-2">
            <Label>בחירת ספקים להצעת מחיר (ספקי ספרים בלבד)</Label>
            <div className="border border-border rounded-xl p-3 max-h-48 overflow-y-auto space-y-2">
              {bookSuppliers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">אין ספקים מסוג "ספרים" במערכת</p>
              ) : bookSuppliers.map(s => (
                <label key={s.id} className="flex items-center gap-3 cursor-pointer hover:bg-muted/30 rounded-lg p-1.5">
                  <Checkbox checked={selectedSupplierIds.includes(s.id)} onCheckedChange={() => toggleSupplier(s.id)} />
                  <div className="flex-1">
                    <span className="text-sm font-medium">{s.name}</span>
                    {s.email && <span className="text-xs text-muted-foreground mr-2">{s.email}</span>}
                  </div>
                </label>
              ))}
            </div>
            {selectedSupplierIds.length > 0 && (
              <p className="text-xs text-muted-foreground">{selectedSupplierIds.length} ספקים נבחרו</p>
            )}
          </div>

          {/* Excel generation */}
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" onClick={handleGenerateExcel} disabled={generating || selectedBooks.length === 0} className="gap-1.5">
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
              {generating ? 'יוצר...' : 'צור והורד קובץ Excel'}
            </Button>
            {excelUrl && <span className="text-xs text-green-600 flex items-center gap-1"><FileSpreadsheet className="w-3 h-3" /> קובץ מוכן</span>}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>ביטול</Button>
          <Button onClick={handleSave} disabled={saving || selectedSupplierIds.length === 0} className="gap-1.5">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
            {saving ? 'שומר...' : 'שמור בקשה'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}