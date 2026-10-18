import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Trash2, AlertTriangle, Check, FileSpreadsheet, Edit3, Info, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import useCategories from '@/hooks/useCategories';
import { cn } from '@/lib/utils';
import { EMPTY_BOOK, FIELD_LABELS, validateBooks, importBookFiles } from '@/lib/bookListImport';
import { isNylonChecked, nylonFromChecked, isBindingChecked, normalizeNylon } from '@/lib/bookQuoteExcel';

const EMPTY = { title: '', supplier_id: '', supplier_name: '', received_date: '', category: 'ספרים', notes: '' };

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
  // רשימת הקבצים שיובאו (ולא קובץ בודד): אפשר להעלות כמה קבצים בבת אחת, וגם
  // להוסיף עוד קובץ אחרי שכבר יובא אחד — כולם מתאחדים לרשימת ספרים אחת.
  const [importedFiles, setImportedFiles] = useState([]);
  const [detectedColumns, setDetectedColumns] = useState({});
  const [showDebug, setShowDebug] = useState(false);

  useEffect(() => {
    if (open) {
      if (editing) { setForm(editing); setBooks(editing.books || []); }
      else { setForm(EMPTY); setBooks([]); }
      setStep(1); setErrors([]); setImportedFiles([]);
      setDetectedColumns({}); setShowDebug(false);
    }
  }, [open, editing]);

  const hasImported = importedFiles.length > 0;

  const canNextStep1 = form.title;

  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;
    setParsing(true);

    const { books: imported, names, failures, cols } = await importBookFiles(files);

    if (Object.keys(cols).length > 0) setDetectedColumns(c => ({ ...c, ...cols }));

    if (imported.length > 0) {
      // מצרפים לספרים הקיימים ולא מחליפים אותם — כך שני קבצים (או קובץ שנוסף
      // אחרי הזנה ידנית) מתאחדים לרשימה אחת. כפילויות ISBN בין הקבצים ייתפסו
      // ממילא ב-validateBooks ויוצגו כאזהרה.
      const merged = [...books, ...imported];
      setBooks(merged);
      setErrors(validateBooks(merged));
      setImportedFiles(f => [...f, ...names]);
      toast.success(
        names.length > 1
          ? `יובאו ${imported.length} ספרים מ-${names.length} קבצים`
          : `זוהו ${imported.length} ספרים`
      );
      setStep(3);
    }

    failures.forEach(msg => toast.error(msg, { duration: 10000 }));
    setParsing(false);
  };

  const addManualBook = () => setBooks(b => [...b, { ...EMPTY_BOOK }]);

  const updateManualBook = (i, field, value) => {
    setBooks(b => { const u = [...b]; u[i] = { ...u[i], [field]: value }; return u; });
  };

  const removeManualBook = (i) => setBooks(b => b.filter((_, idx) => idx !== i));
  const recalcErrors = () => setErrors(validateBooks(books));

  const handleSave = async () => {
    // ניילון שלא נבחר נשמר כ"בלי ניילון"
    const valid = books.filter(b => b.title).map(b => ({
      ...b,
      nylon_required: normalizeNylon(b.nylon_required),
      binding_required: isBindingChecked(b.binding_required),
    }));
    if (valid.length === 0) { toast.error('אין ספרים תקינים לשמירה'); return; }
    setSaving(true);
    try {
      await onSave({
        ...form,
        books: valid,
        status: 'received',
        notes: form.notes || (hasImported ? `יובא מקבצים: ${importedFiles.map(f => f.name).join(', ')}` : ''),
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
            <p className="text-sm text-muted-foreground">איך להתחיל? אפשר גם לשלב — לצרף קבצים ולהוסיף ספרים ידנית באותה רשימה.</p>
            <div className="grid grid-cols-1 gap-3">
              <button onClick={() => setStep('excelUpload')}
                className="flex items-center gap-4 border-2 border-dashed border-border rounded-xl p-5 hover:border-green-400 hover:bg-green-50/30 transition-colors text-right">
                <div className="w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center shrink-0"><FileSpreadsheet className="w-6 h-6 text-green-600" /></div>
                <div><p className="font-semibold text-foreground">העלאת קובץ Excel/CSV</p><p className="text-sm text-muted-foreground">רשימת ספרים – זיהוי אוטומטי של העמודות</p></div>
              </button>
              <button onClick={() => setStep(3)}
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
            <p className="text-sm text-muted-foreground">העלי קובץ Excel או CSV עם רשימת הספרים. אפשר לבחור <strong>כמה קבצים יחד</strong> — הם יתאחדו לרשימה אחת. המערכת תזהה את העמודות אוטומטית בכל קובץ בנפרד.</p>
            <label className={cn('flex flex-col items-center gap-3 cursor-pointer border-2 border-dashed border-border rounded-xl px-6 py-8 hover:border-green-400 hover:bg-green-50/30 transition-colors', parsing && 'opacity-60 pointer-events-none')}>
              <div className="w-14 h-14 rounded-xl bg-green-100 flex items-center justify-center">
                {parsing ? <div className="w-6 h-6 border-2 border-green-400 border-t-transparent rounded-full animate-spin" /> : <FileSpreadsheet className="w-7 h-7 text-green-600" />}
              </div>
              <div className="text-center">
                <p className="font-semibold text-foreground">{parsing ? 'קורא קבצים...' : 'לחצי לבחירת קבצים'}</p>
                <p className="text-xs text-muted-foreground mt-1">xlsx, xls, csv · אפשר לסמן כמה קבצים יחד · עמודות: שם ספר, מחבר, הוצאה, ISBN, ניילון, כריכה, הערות</p>
              </div>
              <input type="file" multiple className="hidden" onChange={handleFileSelect} disabled={parsing} accept=".csv,.xlsx,.xls" />
            </label>
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => setStep(2)}>חזרה</Button>
            </div>
          </div>
        )}

        {/* ── STEP 3 – Books table (imported and/or manual, always editable) ── */}
        {step === 3 && (
          <div className="space-y-3">
            {/* Errors */}
            {errors.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1">
                <div className="flex items-center gap-2 text-amber-700 font-medium text-sm"><AlertTriangle className="w-4 h-4" /> {errors.length} בעיות נמצאו</div>
                {errors.map((e, i) => <p key={i} className="text-xs text-amber-600 pr-6">שורה {e.row}: {e.msg}</p>)}
              </div>
            )}
            {hasImported && errors.length === 0 && books.length > 0 && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-2 text-green-700 text-sm"><Check className="w-4 h-4" /> כל {books.length} הספרים תקינים</div>
            )}

            {/* Imported files */}
            {hasImported && (
              <div className="bg-muted/40 border border-border rounded-lg p-3 space-y-1">
                <p className="text-xs font-medium text-muted-foreground">קבצים שיובאו ({importedFiles.length})</p>
                {importedFiles.map((f, i) => (
                  <p key={i} className="text-xs text-foreground flex items-center gap-1.5">
                    <FileSpreadsheet className="w-3 h-3 text-green-600 shrink-0" />
                    {f.name} <span className="text-muted-foreground">· {f.count} ספרים</span>
                  </p>
                ))}
              </div>
            )}

            {/* Debug: detected columns */}
            {hasImported && Object.keys(detectedColumns).length > 0 && (
              <div className="border border-blue-200 rounded-lg overflow-hidden bg-blue-50/50">
                <button onClick={() => setShowDebug(!showDebug)}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-blue-700 hover:bg-blue-100/50 transition-colors">
                  <span className="flex items-center gap-1.5"><Info className="w-3.5 h-3.5" /> עמודות שזוהו בקובץ</span>
                  {showDebug ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
                {showDebug && (
                  <div className="px-3 pb-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    {['title','author','publisher','isbn','category','supplier_price','discount_percent','discounted_price','recommended_quantity','requested_quantity','nylon_required','binding_required','notes'].map(field => (
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

            {/* Toolbar — הוספה ידנית וצירוף קובץ נוסף זמינים תמיד, גם אחרי ייבוא */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-sm text-muted-foreground">{books.length} ספרים ברשימה</span>
              <div className="flex items-center gap-2">
                <label className={cn('inline-flex items-center gap-1 h-8 px-3 rounded-md border border-input bg-background text-xs font-medium cursor-pointer hover:bg-accent transition-colors', parsing && 'opacity-60 pointer-events-none')}>
                  {parsing
                    ? <div className="w-3.5 h-3.5 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
                    : <FileSpreadsheet className="w-3.5 h-3.5 text-green-600" />}
                  צרף קובץ
                  <input type="file" multiple className="hidden" onChange={handleFileSelect} disabled={parsing} accept=".csv,.xlsx,.xls" />
                </label>
                <Button variant="outline" size="sm" onClick={addManualBook} className="gap-1">
                  <Plus className="w-3.5 h-3.5" /> הוסף ספר
                </Button>
              </div>
            </div>

            {/* Books table */}
            <div className="border border-border rounded-xl overflow-auto max-h-[40vh]">
              <table className="w-full text-xs" dir="rtl">
                <thead className="sticky top-0 bg-muted/50 z-10">
                  <tr className="border-b border-border">
                    <th className="p-1.5 w-8"></th>
                    <th className="text-right p-1.5 font-medium text-muted-foreground">שם ספר</th>
                    <th className="text-right p-1.5 font-medium text-muted-foreground">מחבר</th>
                    <th className="text-right p-1.5 font-medium text-muted-foreground">הוצאה</th>
                    <th className="text-right p-1.5 font-medium text-muted-foreground">ISBN</th>
                    <th className="text-center p-1.5 font-medium text-muted-foreground w-14">ניילון</th>
                    <th className="text-center p-1.5 font-medium text-muted-foreground w-14">כריכה</th>
                    <th className="text-right p-1.5 font-medium text-muted-foreground">הערות</th>
                    {hasImported && <th className="text-center p-1.5 font-medium text-muted-foreground">סטטוס</th>}
                  </tr>
                </thead>
                <tbody>
                  {books.map((b, i) => {
                    const hasErr = errors.some(e => e.row === i + 1);
                    return (
                      <tr key={i} className={cn('border-b border-border/40', hasErr && 'bg-red-50/40')}>
                        <td className="p-1">
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeManualBook(i)}>
                            <Trash2 className="w-3 h-3 text-red-400" />
                          </Button>
                        </td>
                        <td className="p-1.5">
                          <Input className="h-7 text-xs" value={b.title} onChange={e => updateManualBook(i, 'title', e.target.value)} onBlur={recalcErrors} placeholder="שם ספר *" />
                        </td>
                        <td className="p-1.5">
                          <Input className="h-7 text-xs" value={b.author} onChange={e => updateManualBook(i, 'author', e.target.value)} />
                        </td>
                        <td className="p-1.5">
                          <Input className="h-7 text-xs" value={b.publisher} onChange={e => updateManualBook(i, 'publisher', e.target.value)} />
                        </td>
                        <td className="p-1.5">
                          <Input className="h-7 text-xs font-mono" value={b.isbn} onChange={e => updateManualBook(i, 'isbn', e.target.value)} onBlur={recalcErrors} />
                        </td>
                        <td className="p-1.5 text-center">
                          <Checkbox
                            checked={isNylonChecked(b.nylon_required)}
                            onCheckedChange={c => updateManualBook(i, 'nylon_required', nylonFromChecked(c === true))}
                            aria-label="ניילון"
                          />
                        </td>
                        <td className="p-1.5 text-center">
                          <Checkbox
                            checked={isBindingChecked(b.binding_required)}
                            onCheckedChange={c => updateManualBook(i, 'binding_required', c === true)}
                            aria-label="כריכה"
                          />
                        </td>
                        <td className="p-1.5">
                          <Input className="h-7 text-xs" value={b.notes} onChange={e => updateManualBook(i, 'notes', e.target.value)} />
                        </td>
                        {hasImported && (
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
                  {books.length === 0 && (
                    <tr><td colSpan={hasImported ? 9 : 8} className="text-center py-8 text-muted-foreground text-sm">לחצי "הוסף ספר" או "צרף קובץ" כדי להתחיל</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setStep(2)}>חזרה</Button>
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