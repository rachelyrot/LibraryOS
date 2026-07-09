import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Trash2, AlertTriangle, Check, FileSpreadsheet, Edit3, Info, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import useCategories from '@/hooks/useCategories';
import { cn } from '@/lib/utils';
import { nylonLabel, normalizeNylon } from '@/lib/bookQuoteExcel';
import { cleanColumnName, detectKey, readExcelRows } from '@/lib/excelImport';

// ── Column detection ────────────────────────────────────────────
const COLUMN_MAP = {
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
  notes: [
    'הערות', 'notes', 'comments', 'הערה',
  ],
};

// ── Header-row detection ──
const HEADER_SIGNALS = ['שם ספר', 'שם הספר', 'כותר', 'isbn', 'מחבר', 'מחיר', 'title', 'שם כותר', 'שם המוצר', 'שם הכותר'];

// ── Parse a single row ──────────────────────────────────────────
function parseRow(row) {
  const g = (f) => { const k = detectKey(row, COLUMN_MAP, f); return k ? row[k] : undefined; };
  const title = g('title'); const author = g('author'); const publisher = g('publisher');
  const isbn = g('isbn'); const category = g('category');
  const supplier_price = parseFloat(g('supplier_price'));
  const discount_percent = parseFloat(g('discount_percent'));
  let discounted_price = parseFloat(g('discounted_price'));
  const recommended_quantity = parseInt(g('recommended_quantity'), 10);
  const requested_quantity_raw = g('requested_quantity');
  const requested_quantity = requested_quantity_raw != null ? parseInt(requested_quantity_raw, 10) : NaN;
  const nylon_required = normalizeNylon(g('nylon_required'));
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
    notes: (notes || '').toString().trim(),
    existing_in_agron: false,
    existing_copies: 0,
    system_recommendation: 'לבדיקה',
    recommendation_reason: '',
    marked_for_order: false,
    status: 'חדש',
  };
}

// ── Validation ──────────────────────────────────────────────────
function validateBooks(books) {
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

// ── Constants ───────────────────────────────────────────────────
const EMPTY_BOOK = {
  title: '', author: '', publisher: '', isbn: '', category: '',
  supplier_price: 0, discounted_price: 0, recommended_quantity: 0, requested_quantity: 0, nylon_required: 'any', notes: '',
  existing_in_agron: false, existing_copies: 0, system_recommendation: 'לבדיקה', recommendation_reason: '',
  marked_for_order: false, status: 'חדש',
};

const EMPTY = { title: '', supplier_id: '', supplier_name: '', received_date: '', category: 'ספרים', notes: '' };

const FIELD_LABELS = {
  title: 'שם ספר', author: 'מחבר', publisher: 'הוצאה', isbn: 'ISBN',
  category: 'קטגוריה', supplier_price: 'מחיר ספק', discount_percent: 'אחוז הנחה',
  discounted_price: 'מחיר לאחר הנחה', recommended_quantity: 'כמות',
  requested_quantity: 'כמות מבוקשת', nylon_required: 'ניילון', notes: 'הערות',
};

// ── Component ───────────────────────────────────────────────────
export default function BookListForm({ open, onOpenChange, editing, suppliers, onSave }) {
  const { mains: bookCats, getSubcategories, getLabel } = useCategories();
  const bookSubcategories = getSubcategories('ספרים');
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(EMPTY);
  const [books, setBooks] = useState([]);
  const [errors, setErrors] = useState([]);
  const [saving, setSaving] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [fileName, setFileName] = useState('');
  const [importMethod, setImportMethod] = useState(null);
  const [detectedColumns, setDetectedColumns] = useState({});
  const [showDebug, setShowDebug] = useState(false);

  useEffect(() => {
    if (open) {
      if (editing) { setForm(editing); setBooks(editing.books || []); }
      else { setForm(EMPTY); setBooks([]); }
      setStep(1); setErrors([]); setFileName(''); setImportMethod(null);
      setDetectedColumns({}); setShowDebug(false);
    }
  }, [open, editing]);

  const canNextStep1 = form.title;

  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFileName(file.name);
    setParsing(true);
    try {
      const { dataRows, detectedColumns: cols, allColumns } = await readExcelRows(file, {
        columnMap: COLUMN_MAP,
        anchorField: 'title',
        headerSignals: HEADER_SIGNALS,
      });

      if (allColumns.length === 0) {
        toast.error('לא זוהו נתונים. ודאו שהקובץ מכיל רשימת ספרים ואינו ריק.');
        setParsing(false);
        return;
      }

      setDetectedColumns(cols);

      // Check title column exists — show which columns were found to help debug
      if (!cols.title) {
        const foundCols = allColumns.map(k => cleanColumnName(k)).filter(Boolean).join(', ');
        toast.error(`לא נמצאה עמודת "שם ספר" בקובץ.\nעמודות שנמצאו: ${foundCols || 'לא זוהו'}\nנדרשת עמודה בשם: שם ספר / כותר / Title`, { duration: 10000 });
        setParsing(false);
        return;
      }

      const allParsed = dataRows.map(parseRow);
      // Drop rows without a title silently
      const parsed = allParsed.filter(b => b.title);
      setBooks(parsed);
      setErrors(validateBooks(parsed));
      toast.success(`זוהו ${parsed.length} ספרים`);
      setStep(3);
    } catch (e) {
      toast.error('שגיאה בקריאת הקובץ');
    }
    setParsing(false);
    e.target.value = '';
  };

  const addManualBook = () => setBooks(b => [...b, { ...EMPTY_BOOK }]);

  const updateManualBook = (i, field, value) => {
    setBooks(b => { const u = [...b]; u[i] = { ...u[i], [field]: value }; return u; });
  };

  const removeManualBook = (i) => setBooks(b => b.filter((_, idx) => idx !== i));
  const recalcErrors = () => setErrors(validateBooks(books));

  const handleSave = async () => {
    // Normalize unknown nylon to 'any' before saving
    const valid = books.filter(b => b.title).map(b => ({
      ...b,
      nylon_required: b.nylon_required === 'unknown' ? 'any' : (b.nylon_required || 'any'),
    }));
    if (valid.length === 0) { toast.error('אין ספרים תקינים לשמירה'); return; }
    setSaving(true);
    try {
      await onSave({
        ...form,
        books: valid,
        status: 'received',
        notes: form.notes || (importMethod === 'excel' ? `יובא מקובץ: ${fileName}` : ''),
      });
    } catch (e) { toast.error('שגיאה בשמירה'); }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto font-heebo" dir="rtl">
        <DialogHeader>
          <DialogTitle>{editing ? 'עריכת רשימה' : 'רשימת ספרים חדשה'}</DialogTitle>
          {(step === 2 || step === 3) && <p className="text-sm text-muted-foreground">{form.title}</p>}
        </DialogHeader>

        {/* ── STEP 1 – Metadata ── */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-2"><Label>שם הרשימה *</Label><Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="למשל: הצעת ספרים יוני 2026" /></div>
              <div className="space-y-1.5"><Label>תאריך קבלה</Label><Input type="date" value={form.received_date} onChange={e => setForm(f => ({ ...f, received_date: e.target.value }))} /></div>
              <div className="space-y-1.5">
                <Label>קטגוריית ספרים</Label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue placeholder="בחר תת-קטגוריית ספרים" /></SelectTrigger>
                  <SelectContent>
                    {bookSubcategories.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 col-span-2"><Label>הערות</Label><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} /></div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>ביטול</Button>
              <Button disabled={!canNextStep1} onClick={() => setStep(2)} className="bg-gradient-to-l from-pink-400 to-rose-500 text-white border-0 hover:opacity-90">
                המשך להוספת ספרים
              </Button>
            </div>
          </div>
        )}

        {/* ── STEP 2 – Choose method ── */}
        {step === 2 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">בחרי איך להוסיף ספרים לרשימה:</p>
            <div className="grid grid-cols-1 gap-3">
              <button onClick={() => { setImportMethod('excel'); setStep('excelUpload'); }}
                className="flex items-center gap-4 border-2 border-dashed border-border rounded-xl p-5 hover:border-green-400 hover:bg-green-50/30 transition-colors text-right">
                <div className="w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center shrink-0"><FileSpreadsheet className="w-6 h-6 text-green-600" /></div>
                <div><p className="font-semibold text-foreground">העלאת קובץ Excel/CSV</p><p className="text-sm text-muted-foreground">רשימת ספרים – זיהוי אוטומטי של העמודות</p></div>
              </button>
              <button onClick={() => { setImportMethod('manual'); setStep(3); }}
                className="flex items-center gap-4 border-2 border-dashed border-border rounded-xl p-5 hover:border-pink-400 hover:bg-pink-50/30 transition-colors text-right">
                <div className="w-12 h-12 rounded-lg bg-pink-100 flex items-center justify-center shrink-0"><Edit3 className="w-6 h-6 text-pink-600" /></div>
                <div><p className="font-semibold text-foreground">הזנה ידנית</p><p className="text-sm text-muted-foreground">הקלדת ספרים אחד-אחד בטבלה</p></div>
              </button>
            </div>
            <div className="flex justify-end"><Button variant="outline" onClick={() => setStep(1)}>חזרה</Button></div>
          </div>
        )}

        {/* ── STEP Excel Upload ── */}
        {step === 'excelUpload' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">העלי קובץ Excel או CSV עם רשימת הספרים. המערכת תזהה את העמודות אוטומטית.</p>
            <label className={cn('flex flex-col items-center gap-3 cursor-pointer border-2 border-dashed border-border rounded-xl px-6 py-8 hover:border-green-400 hover:bg-green-50/30 transition-colors', parsing && 'opacity-60 pointer-events-none')}>
              <div className="w-14 h-14 rounded-xl bg-green-100 flex items-center justify-center">
                {parsing ? <div className="w-6 h-6 border-2 border-green-400 border-t-transparent rounded-full animate-spin" /> : <FileSpreadsheet className="w-7 h-7 text-green-600" />}
              </div>
              <div className="text-center">
                <p className="font-semibold text-foreground">{fileName ? `✓ ${fileName}` : parsing ? 'קורא קובץ...' : 'לחצי לבחירת קובץ'}</p>
                <p className="text-xs text-muted-foreground mt-1">xlsx, xls, csv · עמודות: שם ספר, מחבר, הוצאה, ISBN, ניילון, הערות</p>
              </div>
              <input type="file" className="hidden" onChange={handleFileSelect} disabled={parsing} accept=".csv,.xlsx,.xls" />
            </label>
            {fileName && !parsing && (
              <button onClick={() => { setFileName(''); setBooks([]); }} className="text-xs text-red-400 hover:text-red-500">הסר קובץ</button>
            )}
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => setStep(2)}>חזרה</Button>
            </div>
          </div>
        )}

        {/* ── STEP 3 – Books preview / manual table ── */}
        {step === 3 && (books.length > 0 || importMethod === 'manual') && (
          <div className="space-y-3">
            {/* Errors */}
            {importMethod === 'excel' && errors.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1">
                <div className="flex items-center gap-2 text-amber-700 font-medium text-sm"><AlertTriangle className="w-4 h-4" /> {errors.length} בעיות נמצאו</div>
                {errors.map((e, i) => <p key={i} className="text-xs text-amber-600 pr-6">שורה {e.row}: {e.msg}</p>)}
              </div>
            )}
            {importMethod === 'excel' && errors.length === 0 && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-2 text-green-700 text-sm"><Check className="w-4 h-4" /> כל {books.length} הספרים תקינים</div>
            )}

            {/* Debug: detected columns */}
            {importMethod === 'excel' && Object.keys(detectedColumns).length > 0 && (
              <div className="border border-blue-200 rounded-lg overflow-hidden bg-blue-50/50">
                <button onClick={() => setShowDebug(!showDebug)}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-blue-700 hover:bg-blue-100/50 transition-colors">
                  <span className="flex items-center gap-1.5"><Info className="w-3.5 h-3.5" /> עמודות שזוהו בקובץ</span>
                  {showDebug ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
                {showDebug && (
                  <div className="px-3 pb-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    {['title','author','publisher','isbn','category','supplier_price','discount_percent','discounted_price','recommended_quantity','requested_quantity','nylon_required','notes'].map(field => (
                      <div key={field} className="flex items-center gap-1.5 py-0.5">
                        <span className="text-muted-foreground w-24 shrink-0">{FIELD_LABELS[field]}:</span>
                        {detectedColumns[field] ? (
                          <span className="font-medium text-blue-700">← "{detectedColumns[field]}"</span>
                        ) : (
                          <span className="text-red-400 italic">לא זוהה</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Manual add button */}
            {importMethod === 'manual' && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{books.length} ספרים</span>
                <Button variant="outline" size="sm" onClick={addManualBook} className="gap-1">
                  <Plus className="w-3.5 h-3.5" /> הוסף ספר
                </Button>
              </div>
            )}

            {/* Books table */}
            <div className="border border-border rounded-xl overflow-auto max-h-[40vh]">
              <table className="w-full text-xs" dir="rtl">
                <thead className="sticky top-0 bg-muted/50 z-10">
                  <tr className="border-b border-border">
                    {importMethod === 'manual' && <th className="p-1.5 w-8"></th>}
                    <th className="text-right p-1.5 font-medium text-muted-foreground">שם ספר</th>
                    <th className="text-right p-1.5 font-medium text-muted-foreground">מחבר</th>
                    <th className="text-right p-1.5 font-medium text-muted-foreground">הוצאה</th>
                    <th className="text-right p-1.5 font-medium text-muted-foreground">ISBN</th>
                    <th className="text-center p-1.5 font-medium text-muted-foreground w-32">ניילון</th>
                    <th className="text-right p-1.5 font-medium text-muted-foreground">הערות</th>
                    {importMethod === 'excel' && <th className="text-center p-1.5 font-medium text-muted-foreground">סטטוס</th>}
                  </tr>
                </thead>
                <tbody>
                  {books.map((b, i) => {
                    const hasErr = errors.some(e => e.row === i + 1);
                    return (
                      <tr key={i} className={cn('border-b border-border/40', hasErr && 'bg-red-50/40')}>
                        {importMethod === 'manual' && (
                          <td className="p-1">
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeManualBook(i)}>
                              <Trash2 className="w-3 h-3 text-red-400" />
                            </Button>
                          </td>
                        )}
                        <td className="p-1.5">
                          {importMethod === 'manual' ? (
                            <Input className="h-7 text-xs" value={b.title} onChange={e => { updateManualBook(i, 'title', e.target.value); }} onBlur={recalcErrors} placeholder="שם ספר *" />
                          ) : (
                            <span className={!b.title ? 'text-red-500' : ''}>{b.title || <em className="text-red-400">חסר</em>}</span>
                          )}
                        </td>
                        <td className="p-1.5 text-muted-foreground">
                          {importMethod === 'manual' ? <Input className="h-7 text-xs" value={b.author} onChange={e => updateManualBook(i, 'author', e.target.value)} /> : (b.author || '-')}
                        </td>
                        <td className="p-1.5 text-muted-foreground">
                          {importMethod === 'manual' ? <Input className="h-7 text-xs" value={b.publisher} onChange={e => updateManualBook(i, 'publisher', e.target.value)} /> : (b.publisher || '-')}
                        </td>
                        <td className="p-1.5 font-mono text-muted-foreground">
                          {importMethod === 'manual' ? <Input className="h-7 text-xs" value={b.isbn} onChange={e => { updateManualBook(i, 'isbn', e.target.value); }} onBlur={recalcErrors} /> : (b.isbn || '-')}
                        </td>
                        <td className="p-1.5 text-center">
                          {importMethod === 'manual' ? (
                            <Select value={b.nylon_required || 'any'} onValueChange={v => updateManualBook(i, 'nylon_required', v)}>
                              <SelectTrigger className="h-7 text-xs w-28"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="with_nylon">עם ניילון</SelectItem>
                                <SelectItem value="without_nylon">בלי ניילון</SelectItem>
                                <SelectItem value="any">לא משנה / לפי הזול</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-xs">{nylonLabel(b.nylon_required)}</span>
                          )}
                        </td>
                        <td className="p-1.5 text-muted-foreground">
                          {importMethod === 'manual' ? <Input className="h-7 text-xs" value={b.notes} onChange={e => updateManualBook(i, 'notes', e.target.value)} /> : (b.notes || '-')}
                        </td>
                        {importMethod === 'excel' && (
                          <td className="p-1.5 text-center">
                            {!b.title ? (
                              <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">חסר שם ספר</span>
                            ) : b.nylon_required === 'unknown' ? (
                              <span className="text-xs bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded-full">דורש בדיקה</span>
                            ) : (
                              <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">תקינה</span>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                  {books.length === 0 && importMethod === 'manual' && (
                    <tr><td colSpan={7} className="text-center py-8 text-muted-foreground text-sm">לחצי "הוסף ספר" כדי להתחיל</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <DialogFooter className="gap-2">
              {importMethod === 'excel' && <Button variant="outline" onClick={() => setStep(2)}>חזרה</Button>}
              {importMethod === 'manual' && <Button variant="outline" onClick={() => setStep(2)}>חזרה</Button>}
              <Button onClick={handleSave} disabled={saving || books.filter(b => b.title).length === 0}
                className="gap-2 bg-gradient-to-l from-pink-400 to-rose-500 text-white border-0 hover:opacity-90">
                {saving ? 'שומר...' : `שמור רשימה (${books.filter(b => b.title).length} ספרים)`}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}