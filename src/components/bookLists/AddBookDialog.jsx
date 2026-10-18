import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { EMPTY_BOOK } from '@/lib/bookListImport';
import { isNylonChecked, nylonFromChecked, isBindingChecked } from '@/lib/bookQuoteExcel';

/**
 * הוספת ספר בודד לרשימה *קיימת* (שכבר נשמרה).
 *
 * טופס נפרד ולא עריכה ישירה בטבלת BookListTab: הטבלה שם היא תצוגת עבודה
 * (סימון "מעניין", בדיקת אגרון, המלצות) ולא טופס הזנה, והפיכת כל התאים שלה
 * לשדות קלט הייתה מסבכת מסך שכבר עמוס. כאן מזינים את השדות שהמשתמשת באמת
 * ממלאת ידנית, והספר נכנס לרשימה באותו מבנה בדיוק כמו ספר שיובא מקובץ.
 */
export default function AddBookDialog({ open, onOpenChange, onAdd }) {
  const [form, setForm] = useState(EMPTY_BOOK);

  useEffect(() => { if (open) setForm({ ...EMPTY_BOOK }); }, [open]);

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const handleAdd = () => {
    if (!form.title.trim()) return;
    onAdd({ ...form, title: form.title.trim() });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto font-heebo" dir="rtl">
        <DialogHeader><DialogTitle>הוספת ספר לרשימה</DialogTitle></DialogHeader>
        <div className="form-grid">
          <div className="space-y-1.5">
            <Label>שם ספר *</Label>
            <Input value={form.title} onChange={e => set('title', e.target.value)} placeholder="שם הספר" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>מחבר</Label>
              <Input value={form.author} onChange={e => set('author', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>הוצאה</Label>
              <Input value={form.publisher} onChange={e => set('publisher', e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>ISBN</Label>
              <Input className="font-mono" dir="ltr" value={form.isbn} onChange={e => set('isbn', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>קטגוריה</Label>
              <Input value={form.category} onChange={e => set('category', e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>כמות מבוקשת</Label>
            <Input type="number" min="0" dir="ltr" className="text-right"
              value={form.requested_quantity}
              onChange={e => set('requested_quantity', parseInt(e.target.value, 10) || 0)} />
          </div>
          <div className="flex items-center gap-6 rounded-xl border border-border bg-muted/30 px-3 py-2.5">
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <Checkbox
                checked={isNylonChecked(form.nylon_required)}
                onCheckedChange={c => set('nylon_required', nylonFromChecked(c === true))}
              />
              <span>ניילון</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <Checkbox
                checked={isBindingChecked(form.binding_required)}
                onCheckedChange={c => set('binding_required', c === true)}
              />
              <span>כריכה</span>
            </label>
          </div>
          <div className="space-y-1.5">
            <Label>הערות</Label>
            <Textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>ביטול</Button>
          <Button onClick={handleAdd} disabled={!form.title.trim()}
            className="bg-gradient-to-l from-pink-400 to-rose-500 text-white border-0 hover:opacity-90">
            הוסף לרשימה
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
