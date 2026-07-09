import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Pencil, Trash2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { VOLUNTEER_ACTIVITY_LABELS, VOLUNTEER_STATUS_LABELS, VOLUNTEER_STATUS_COLORS, fullName } from '@/lib/staffUtils';
import { canManageVolunteers } from '@/lib/permissions';
import VolunteerDialog from './VolunteerDialog';

export default function VolunteersTab({ user, branches }) {
  const [volunteers, setVolunteers] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const canManage = canManageVolunteers(user);

  const load = () => base44.entities.Volunteer.list('-created_date', 500).then(setVolunteers).catch(() => []);
  useEffect(() => { load(); }, []);

  const filtered = volunteers.filter(v => {
    if (search && !fullName(v).includes(search)) return false;
    if (statusFilter !== 'all' && v.status !== statusFilter) return false;
    return true;
  });

  const handleSave = async (data) => {
    try {
      if (editing) { await base44.entities.Volunteer.update(editing.id, data); toast.success('המתנדבת עודכנה'); }
      else { await base44.entities.Volunteer.create(data); toast.success('המתנדבת נוספה'); }
      setEditing(null); load();
    } catch (e) { toast.error('שגיאה בשמירה'); }
  };

  const handleDelete = async (vol) => {
    if (!confirm(`למחוק את ${fullName(vol)}?`)) return;
    try { await base44.entities.Volunteer.delete(vol.id); toast.success('נמחקה'); load(); }
    catch (e) { toast.error('שגיאה במחיקה'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">מתנדבות ({filtered.length})</h3>
        {canManage && <Button onClick={() => { setEditing(null); setDialogOpen(true); }} className="gap-2"><Plus className="w-4 h-4" /> מתנדבת חדשה</Button>}
      </div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="חיפוש מתנדבת..." className="pr-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">כל הסטטוסים</SelectItem>{Object.entries(VOLUNTEER_STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="border border-border rounded-xl overflow-auto max-h-[60vh]">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 sticky top-0">
            <tr className="border-b border-border">
              <th className="text-right p-3 font-medium">שם</th>
              <th className="text-right p-3 font-medium hidden md:table-cell">טלפון</th>
              <th className="text-right p-3 font-medium hidden lg:table-cell">סניף מועדף</th>
              <th className="text-right p-3 font-medium hidden md:table-cell">ימים מועדפים</th>
              <th className="text-right p-3 font-medium hidden lg:table-cell">תחום פעילות</th>
              <th className="text-center p-3 font-medium">סטטוס</th>
              {canManage && <th className="p-3"></th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map(vol => (
              <tr key={vol.id} className="border-b border-border/50 hover:bg-muted/30">
                <td className="p-3 font-medium">{fullName(vol)}</td>
                <td className="p-3 hidden md:table-cell text-muted-foreground">{vol.phone || '-'}</td>
                <td className="p-3 hidden lg:table-cell text-muted-foreground">{vol.preferred_branch_name || '-'}</td>
                <td className="p-3 hidden md:table-cell text-muted-foreground">{vol.preferred_days || '-'}</td>
                <td className="p-3 hidden lg:table-cell">{VOLUNTEER_ACTIVITY_LABELS[vol.activity_area] || '-'}</td>
                <td className="p-3 text-center"><span className={cn('text-xs px-2 py-0.5 rounded', VOLUNTEER_STATUS_COLORS[vol.status] || 'bg-gray-100')}>{VOLUNTEER_STATUS_LABELS[vol.status] || vol.status}</span></td>
                {canManage && (
                  <td className="p-3"><div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditing(vol); setDialogOpen(true); }}><Pencil className="w-3.5 h-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => handleDelete(vol)}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div></td>
                )}
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={canManage ? 7 : 6} className="text-center py-12 text-muted-foreground">אין מתנדבות</td></tr>}
          </tbody>
        </table>
      </div>
      <VolunteerDialog open={dialogOpen} onOpenChange={setDialogOpen} initialData={editing} branches={branches} onSave={handleSave} />
    </div>
  );
}