import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Plus, Trash2, Edit, Settings, ChevronDown, ChevronUp, FolderTree, GripVertical, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { canEditSettings } from '@/lib/permissions';

const MAIN_CATEGORIES = [
  { id: 'books', name: 'ספרים' },
  { id: 'book_supplies', name: 'ציוד ספרים' },
  { id: 'office_supplies', name: 'ציוד משרדי' },
  { id: 'furniture', name: 'ריהוט' },
  { id: 'it_communications', name: 'תקשורת ומחשוב' },
  { id: 'cultural_activities', name: 'פעילות תרבות' },
  { id: 'maintenance', name: 'תחזוקה' },
  { id: 'general_services', name: 'שירותים כלליים' },
  { id: 'materials', name: 'חומרים' },
  { id: 'other', name: 'אחר' },
];

const DEFAULT_SUBS = {
  books: [
    'ספרות יפה', 'ספרי עיון', 'ספרי ילדים', 'ספרי נוער', 'ספרי יעץ', 'ספרי לימוד', 'מקצועי',
  ],
  book_supplies: [
    'כריכות פלסטיק', 'מדבקות סיווג', 'תגי RFID', 'חומרי שימור', 'אחר',
  ],
  office_supplies: [
    'כלי כתיבה', 'נייר ומוצרי נייר', 'תיקיות וארכיון', 'ציוד מחשבים נלווה', 'אחר',
  ],
  furniture: [
    'כיסאות', 'שולחנות', 'מדפים', 'ארונות', 'אחר',
  ],
  it_communications: [
    'מחשבים', 'מדפסות', 'ציוד רשת', 'תוכנות', 'אחר',
  ],
  cultural_activities: [
    'מופעים', 'סדנאות', 'הרצאות', 'תערוכות', 'אחר',
  ],
  maintenance: [
    'חשמל', 'אינסטלציה', 'מיזוג', 'ניקיון', 'אחר',
  ],
  general_services: [
    'ייעוץ', 'הדרכה', 'אבטחה', 'אחר',
  ],
  other: ['אחר'],
};

export default function SettingsPage() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({});

  // Form state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState('new'); // 'new' | 'edit'
  const [form, setForm] = useState({ name: '', category_type: 'main', parent_id: '', parent_name: '', sort_order: 0, status: 'active' });
  const [saving, setSaving] = useState(false);
  const [user, setUser] = useState(null);
  const canEdit = canEditSettings(user);

  useEffect(() => { load(); base44.auth.me().then(setUser).catch(() => {}); }, []);

  const load = async () => {
    try {
      const data = await base44.entities.Category.list('sort_order', 500);
      if (data.length > 0) {
        setCategories(data);
      } else {
        // Seed default categories
        await seedDefaults();
        const fresh = await base44.entities.Category.list('sort_order', 500);
        setCategories(fresh);
      }
    } catch (e) {
      // Entity doesn't exist yet, seed defaults
      try {
        await seedDefaults();
        const fresh = await base44.entities.Category.list('sort_order', 500);
        setCategories(fresh);
      } catch (e2) {
        setCategories([]);
        toast.error('טעינת הקטגוריות נכשלה');
      }
    }
    setLoading(false);
  };

  const seedDefaults = async () => {
    const all = [];
    MAIN_CATEGORIES.forEach((mc, i) => {
      all.push({ name: mc.name, category_type: 'main', sort_order: i + 1, status: 'active' });
    });
    await base44.entities.Category.bulkCreate(all);

    // Now create sub-categories with parent references
    const mains = await base44.entities.Category.list('sort_order', 500);
    const mainMap = {};
    mains.filter(c => c.category_type === 'main').forEach(c => { mainMap[c.name] = c.id; });

    const subs = [];
    Object.entries(DEFAULT_SUBS).forEach(([key, names]) => {
      const main = MAIN_CATEGORIES.find(m => m.id === key);
      if (!main || !mainMap[main.name]) return;
      names.forEach((name, j) => {
        subs.push({
          name,
          category_type: 'sub',
          parent_id: mainMap[main.name],
          parent_name: main.name,
          sort_order: j + 1,
          status: 'active',
        });
      });
    });
    if (subs.length > 0) await base44.entities.Category.bulkCreate(subs);
  };

  const mains = categories.filter(c => c.category_type === 'main');
  const subsOf = (parentId) => categories.filter(c => c.category_type === 'sub' && c.parent_id === parentId);

  const openNew = () => { setDialogMode('new'); setForm({ name: '', category_type: 'main', parent_id: '', parent_name: '', sort_order: 0, status: 'active' }); setDialogOpen(true); };
  const openEdit = (cat) => { setDialogMode('edit'); setForm({ ...cat }); setDialogOpen(true); };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    if (form.category_type === 'sub' && form.parent_id) {
      const parent = categories.find(c => c.id === form.parent_id);
      form.parent_name = parent?.name || '';
    }
    if (dialogMode === 'new') {
      await base44.entities.Category.create(form);
      toast.success('קטגוריה נוספה');
    } else {
      await base44.entities.Category.update(form.id, form);
      toast.success('קטגוריה עודכנה');
    }
    setSaving(false);
    setDialogOpen(false);
    load();
  };

  const toggleStatus = async (cat) => {
    const newStatus = cat.status === 'active' ? 'inactive' : 'active';
    await base44.entities.Category.update(cat.id, { status: newStatus });
    toast.success(newStatus === 'active' ? 'הקטגוריה הופעלה' : 'הקטגוריה הושבתה');
    load();
  };

  if (loading) return <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" /></div>;

  return (
    <div className="p-6 max-w-3xl mx-auto animate-fade-in" dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">הגדרות</h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול קטגוריות מרכזיות</p>
        </div>
        {canEdit && <Button onClick={openNew} className="gap-2 bg-gradient-to-l from-purple-400 to-indigo-500 text-white border-0 hover:opacity-90">
          <Plus className="w-4 h-4" /> הוסף קטגוריה
        </Button>}
      </div>

      <div className="space-y-3">
        {mains.map(main => {
          const subs = subsOf(main.id);
          const isExpanded = expanded[main.id] !== false;
          const activeCount = subs.filter(s => s.status === 'active').length;
          const totalCount = subs.length;

          return (
            <div key={main.id} className={cn('border rounded-xl overflow-hidden transition-all', main.status === 'inactive' ? 'border-red-200 bg-red-50/30' : 'border-border bg-card')}>
              {/* Main category header */}
              <div className="flex items-center gap-3 px-4 py-3">
                <button onClick={() => setExpanded(e => ({ ...e, [main.id]: !isExpanded }))}
                  className="p-1 hover:bg-muted rounded transition-colors">
                  {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
                </button>
                <FolderTree className="w-4 h-4 text-purple-500 shrink-0" />
                <span className={cn('font-semibold flex-1', main.status === 'inactive' && 'text-muted-foreground line-through')}>{main.name}</span>
                <span className="text-xs text-muted-foreground">{totalCount} תתי-קטגוריות ({activeCount} פעילות)</span>
                {canEdit && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(main)}><Edit className="w-3.5 h-3.5" /></Button>}
                {canEdit && <Switch checked={main.status === 'active'} onCheckedChange={() => toggleStatus(main)} />}
              </div>

              {/* Sub categories */}
              {isExpanded && (
                <div className="border-t border-border/50">
                  {subs.length === 0 ? (
                    <div className="px-4 py-3 text-sm text-muted-foreground">אין תתי-קטגוריות</div>
                  ) : (
                    subs.map(sub => (
                      <div key={sub.id} className={cn('flex items-center gap-3 px-6 py-2 border-b border-border/30 last:border-b-0', sub.status === 'inactive' && 'bg-red-50/20')}>
                        <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
                        <span className={cn('text-sm flex-1', sub.status === 'inactive' && 'text-muted-foreground line-through')}>{sub.name}</span>
                        {canEdit && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(sub)}><Edit className="w-3 h-3" /></Button>}
                        {canEdit && <Switch checked={sub.status === 'active'} onCheckedChange={() => toggleStatus(sub)} />}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md font-heebo" dir="rtl">
          <DialogHeader>
            <DialogTitle>{dialogMode === 'new' ? 'קטגוריה חדשה' : 'עריכת קטגוריה'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>שם *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="שם הקטגוריה" />
            </div>
            <div className="space-y-1.5">
              <Label>סוג</Label>
              <Select value={form.category_type} onValueChange={v => setForm(f => ({ ...f, category_type: v, parent_id: v === 'main' ? '' : f.parent_id }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="main">קטגוריה ראשית</SelectItem>
                  <SelectItem value="sub">תת-קטגוריה</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.category_type === 'sub' && (
              <div className="space-y-1.5">
                <Label>קטגוריית אב</Label>
                <Select value={form.parent_id || ''} onValueChange={v => setForm(f => ({ ...f, parent_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="בחר קטגוריית אב" /></SelectTrigger>
                  <SelectContent>
                    {mains.filter(c => c.status === 'active').map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>סדר מיון</Label>
              <Input type="number" value={form.sort_order || 0} onChange={e => setForm(f => ({ ...f, sort_order: parseInt(e.target.value, 10) || 0 }))} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>ביטול</Button>
              <Button onClick={handleSave} disabled={saving || !form.name.trim()}
                className="bg-gradient-to-l from-purple-400 to-indigo-500 text-white border-0 hover:opacity-90">
                {saving ? 'שומר...' : 'שמור'}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}