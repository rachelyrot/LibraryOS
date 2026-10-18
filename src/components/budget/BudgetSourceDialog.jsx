import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import MoneyInput from '@/components/budget/MoneyInput';

const PRESET_COLORS = ['#8b5cf6', '#14b8a6', '#f97316', '#ec4899', '#3b82f6', '#22c55e', '#f43f5e', '#f59e0b', '#6366f1', '#0ea5e9'];
const EMPTY = { name: '', funding_source_type: '', color: '#8b5cf6', planned_amount: '', uses_categories: true, category_number: '', year: new Date().getFullYear().toString(), notes: '', status: 'active', start_date: '', end_date: '' };
// סוגי מימון שמקור חדש מהם נפתח כברירת מחדל בלי חלוקה לקטגוריות
const NO_CATEGORIES_BY_DEFAULT = ['culture_ministry'];
const PRESETS = ['עיריית בני ברק', 'משרד התרבות', 'משרד הפריפריה', 'מפעל הפייס', 'קרן תרבות', 'ג\'וינט', 'עמותה מקומית'];

const FUNDING_TYPES = [
  { value: 'municipal', label: 'תקציב עירוני' },
  { value: 'culture_ministry', label: 'תקציב משרד התרבות' },
  { value: 'mifal_hapais', label: 'מפעל הפיס' },
  { value: 'kol_kore', label: 'קול קורא / תמיכה' },
  { value: 'other', label: 'אחר' },
];

/**
 * categoryCount — כמה קטגוריות יש כבר למקור. אי אפשר לבטל חלוקה לקטגוריות
 * כשיש יותר מאחת (גם הטריגר במיגרציה 0015 חוסם את זה).
 */
export default function BudgetSourceDialog({ open, onOpenChange, source, onSubmit, categoryCount = 0 }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  // אפשר להדליק חלוקה תמיד; לכבות רק כשיש לכל היותר קטגוריה אחת
  const lockCategories = form.uses_categories && categoryCount > 1;

  useEffect(() => {
    if (open) setForm(source ? {
      name: source.name,
      funding_source_type: source.funding_source_type || '',
      color: source.color || '#8b5cf6',
      // planned_amount מוחזק כמחרוזת גולמית בטופס — ראה MoneyInput.
      // זהו הסכום שהמשתמשת מקלידה; total_amount מחושב מהקטגוריות ולא נערך כאן
      // (ראה מיגרציה 0011).
      planned_amount: source.planned_amount != null ? String(source.planned_amount) : '',
      uses_categories: source.uses_categories !== false,
      category_number: source.category_number || '',
      year: source.year || '',
      start_date: source.start_date || '',
      end_date: source.end_date || '',
      notes: source.notes || '',
      status: source.status || 'active',
    } : EMPTY);
  }, [open, source]);

  const handleSubmit = async () => {
    if (!form.name) return;
    setSaving(true);
    try {
      // category_number שייך רק למקור בלי קטגוריות (מיגרציה 0016 מעתיקה אותו
      // לקטגוריה היחידה), ונשלח רק כשיש בו ערך — כדי שהשמירה לא תיכשל לפני 0016
      // uses_categories נשלח רק כשהוא כבוי או כשכבר קיים במקור, מאותה סיבה (0015)
      const { category_number, uses_categories, ...rest } = form;
      const data = { ...rest, planned_amount: form.planned_amount === '' ? '' : Number(form.planned_amount) };
      if (!uses_categories || source?.uses_categories != null) data.uses_categories = uses_categories;
      if (!form.uses_categories && (category_number || source?.category_number)) data.category_number = category_number.trim();
      await onSubmit(data);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto font-heebo" dir="rtl">
        <DialogHeader><DialogTitle>{source ? 'עריכת מקור תקציב' : 'מקור תקציב חדש'}</DialogTitle></DialogHeader>
        <div className="form-grid">
          <div className="space-y-1.5">
            <Label>שם מקור התקציב *</Label>
            <Input value={form.name || ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="עיריית בני ברק, משרד התרבות..." />
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {PRESETS.map(p => (
                <button key={p} onClick={() => setForm(f => ({ ...f, name: p }))}
                  className="text-xs bg-muted hover:bg-secondary text-muted-foreground hover:text-foreground px-2 py-1 rounded-lg transition-all">{p}</button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>סוג מקור מימון</Label>
            <Select value={form.funding_source_type || ''} onValueChange={v => setForm(f => ({
              ...f,
              funding_source_type: v,
              // רק במקור חדש — במקור קיים לא משנים את החלוקה בלי שהמשתמשת ביקשה
              ...(source ? {} : { uses_categories: !NO_CATEGORIES_BY_DEFAULT.includes(v) }),
            }))}>
              <SelectTrigger><SelectValue placeholder="בחר סוג מימון" /></SelectTrigger>
              <SelectContent>
                {FUNDING_TYPES.map(ft => <SelectItem key={ft.value} value={ft.value}>{ft.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="uses-categories">חלוקה לקטגוריות</Label>
              <p className="text-xs text-muted-foreground">
                {form.uses_categories
                  ? 'ההזמנות נרשמות על קטגוריות שמגדירים מתחת למקור.'
                  : 'ההזמנות נרשמות ישירות על המקור, מתוך הסכום המתוכנן.'}
              </p>
              {lockCategories && (
                <p className="text-xs text-amber-600">למקור יש {categoryCount} קטגוריות — כדי לבטל את החלוקה צריך שתישאר אחת בלבד.</p>
              )}
            </div>
            <Switch id="uses-categories" checked={form.uses_categories} disabled={lockCategories}
              onCheckedChange={v => setForm(f => ({ ...f, uses_categories: v }))} />
          </div>

          {!form.uses_categories && (
            <div className="space-y-1.5">
              <Label>מספר קטגוריה</Label>
              <Input value={form.category_number || ''} onChange={e => setForm(f => ({ ...f, category_number: e.target.value }))} placeholder="אופציונלי" dir="ltr" />
              <p className="text-xs text-muted-foreground">מוצג ליד המקור בהזמנות, בהצעות מחיר ובדוחות.</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>סכום מתוכנן ₪</Label>
              <MoneyInput value={form.planned_amount} onChange={v => setForm(f => ({ ...f, planned_amount: v }))} />
              <p className="text-xs text-muted-foreground">
                {form.uses_categories
                  ? 'התקציב שאושר למקור הזה. מוצג מול סכום הקטגוריות בפועל.'
                  : 'התקציב שאושר למקור הזה — וזה הסכום שזמין להזמנות.'}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>שנה</Label>
              <Input value={form.year || ''} onChange={e => setForm(f => ({ ...f, year: e.target.value }))} placeholder="2026" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>תאריך התחלה</Label>
              <Input type="date" value={form.start_date || ''} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>תאריך סיום</Label>
              <Input type="date" value={form.end_date || ''} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>סטטוס</Label>
            <Select value={form.status || 'active'} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">פעיל</SelectItem>
                <SelectItem value="frozen">מוקפא</SelectItem>
                <SelectItem value="pending">ממתין</SelectItem>
                <SelectItem value="closed">סגור</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>צבע</Label>
            <div className="flex gap-2 flex-wrap">
              {PRESET_COLORS.map(c => (
                <button key={c} onClick={() => setForm(f => ({ ...f, color: c }))}
                  className={`w-8 h-8 rounded-full transition-all ${form.color === c ? 'ring-2 ring-offset-2 ring-foreground scale-110' : 'hover:scale-105'}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>הערות</Label>
            <Textarea value={form.notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => onOpenChange(false)}>ביטול</Button>
            <Button onClick={handleSubmit} disabled={saving || !form.name}
              className="bg-gradient-to-l from-violet-500 to-purple-600 text-white border-0 hover:opacity-90">
              {saving ? 'שומר...' : 'שמור'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}