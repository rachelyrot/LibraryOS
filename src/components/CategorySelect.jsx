import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Plus, Trash2, Edit, Settings, ChevronDown, ChevronUp, FolderTree } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export default function CategorySelect({ category_type, parent_id: initialParentId, value, onChange, subValue, onSubChange, showSub = true, className }) {
  const [mainCategories, setMainCategories] = useState([]);
  const [subCategories, setSubCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      const all = await base44.entities.Category.list('sort_order', 500);
      const mains = all.filter(c => c.category_type === 'main' && c.status === 'active');
      setMainCategories(mains);
      setLoading(false);
    } catch (e) {
      setMainCategories([
        { id: 'books', name: 'ספרים', category_type: 'main', status: 'active', sort_order: 1 },
        { id: 'book_supplies', name: 'ציוד ספרים', category_type: 'main', status: 'active', sort_order: 2 },
        { id: 'office_supplies', name: 'ציוד משרדי', category_type: 'main', status: 'active', sort_order: 3 },
        { id: 'furniture', name: 'ריהוט', category_type: 'main', status: 'active', sort_order: 4 },
        { id: 'it_communications', name: 'תקשורת ומחשוב', category_type: 'main', status: 'active', sort_order: 5 },
        { id: 'cultural_activities', name: 'פעילות תרבות', category_type: 'main', status: 'active', sort_order: 6 },
        { id: 'maintenance', name: 'תחזוקה', category_type: 'main', status: 'active', sort_order: 7 },
        { id: 'general_services', name: 'שירותים כלליים', category_type: 'main', status: 'active', sort_order: 8 },
        { id: 'other', name: 'אחר', category_type: 'main', status: 'active', sort_order: 9 },
      ]);
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!value || loading) { setSubCategories([]); return; }
    const loadSubs = async () => {
      try {
        const all = await base44.entities.Category.list('sort_order', 500);
        setSubCategories(all.filter(c => c.category_type === 'sub' && c.parent_id === value && c.status === 'active'));
      } catch (e) { setSubCategories([]); }
    };
    loadSubs();
  }, [value, loading]);

  if (loading) return <div className="h-9 w-full bg-muted animate-pulse rounded-md" />;

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <Select value={value || ''} onValueChange={v => { onChange(v); if (onSubChange) onSubChange(''); }}>
        <SelectTrigger><SelectValue placeholder="בחר קטגוריה" /></SelectTrigger>
        <SelectContent>
          {mainCategories.map(c => <SelectItem key={c.id} value={c.id || c.name}>{c.name}</SelectItem>)}
        </SelectContent>
      </Select>
      {showSub && subCategories.length > 0 && (
        <Select value={subValue || ''} onValueChange={onSubChange}>
          <SelectTrigger><SelectValue placeholder="בחר תת-קטגוריה (אופציונלי)" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={null}>ללא תת-קטגוריה</SelectItem>
            {subCategories.map(c => <SelectItem key={c.id} value={c.id || c.name}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

// Hook for loading categories globally
export function useCategories() {
  const [categories, setCategories] = useState({ mains: [], subs: {}, all: [], loading: true });

  useEffect(() => {
    const load = async () => {
      try {
        const all = await base44.entities.Category.list('sort_order', 500);
        const mains = all.filter(c => c.category_type === 'main');
        const subs = {};
        all.filter(c => c.category_type === 'sub').forEach(c => {
          const pid = c.parent_id || c.parent_name;
          if (pid) { if (!subs[pid]) subs[pid] = []; subs[pid].push(c); }
        });
        setCategories({ mains, subs, all, loading: false });
      } catch (e) { setCategories(c => ({ ...c, loading: false })); }
    };
    load();
  }, []);

  return categories;
}