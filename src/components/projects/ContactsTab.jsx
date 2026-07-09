import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Pencil, Trash2, Phone, Mail, UserCircle } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import { cn } from '@/lib/utils';
import { CONTACT_TYPE_LABELS, CONTACT_TYPE_COLORS } from '@/lib/projectUtils';
import { canCreateTasks } from '@/lib/permissions';
import ContactDialog from './ContactDialog';

export default function ContactsTab({ project, user, contacts, onLoad }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [typeFilter, setTypeFilter] = useState('all');
  const canManage = canCreateTasks(user);

  const handleSave = async (data) => {
    try {
      if (editing) { await base44.entities.ProjectContact.update(editing.id, data); toast.success('איש קשר עודכן'); }
      else { await base44.entities.ProjectContact.create({ ...data, project_id: project.id, project_name: project.name }); toast.success('איש קשר נוסף'); }
      setEditing(null); setDialogOpen(false); onLoad();
    } catch (e) { toast.error('שגיאה בשמירה'); }
  };

  const handleDelete = async (contact) => {
    if (!confirm('למחוק איש קשר זה?')) return;
    try { await base44.entities.ProjectContact.delete(contact.id); toast.success('נמחק'); onLoad(); }
    catch (e) { toast.error('שגיאה במחיקה'); }
  };

  const filtered = contacts.filter(c => typeFilter === 'all' || c.contact_type === typeFilter);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <h3 className="text-lg font-semibold">אנשי קשר ({filtered.length})</h3>
        <div className="flex gap-2">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">כל הסוגים</SelectItem>
              {Object.entries(CONTACT_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
          {canManage && <Button onClick={() => { setEditing(null); setDialogOpen(true); }} className="gap-2"><Plus className="w-4 h-4" /> איש קשר חדש</Button>}
        </div>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map(c => (
          <div key={c.id} className="bg-card rounded-xl p-4 border border-border">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2">
                <UserCircle className="w-8 h-8 text-primary shrink-0" />
                <div>
                  <p className="font-medium">{c.contact_name}</p>
                  {c.contact_role && <p className="text-xs text-muted-foreground">{c.contact_role}</p>}
                </div>
              </div>
              <span className={cn('text-xs px-2 py-0.5 rounded shrink-0', CONTACT_TYPE_COLORS[c.contact_type])}>{CONTACT_TYPE_LABELS[c.contact_type]}</span>
            </div>
            <div className="mt-2 space-y-1 text-sm">
              {c.contact_phone && <p className="flex items-center gap-1.5 text-muted-foreground"><Phone className="w-3.5 h-3.5" /> {c.contact_phone}</p>}
              {c.contact_email && <p className="flex items-center gap-1.5 text-muted-foreground truncate"><Mail className="w-3.5 h-3.5" /> {c.contact_email}</p>}
            </div>
            {c.notes && <p className="text-xs text-muted-foreground mt-2 border-t pt-2">{c.notes}</p>}
            {canManage && (
              <div className="flex gap-1 mt-2">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditing(c); setDialogOpen(true); }}><Pencil className="w-3.5 h-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => handleDelete(c)}><Trash2 className="w-3.5 h-3.5" /></Button>
              </div>
            )}
          </div>
        ))}
        {filtered.length === 0 && <div className="col-span-full text-center py-12 text-muted-foreground">אין אנשי קשר</div>}
      </div>

      <ContactDialog open={dialogOpen} onOpenChange={setDialogOpen} initialData={editing} onSave={handleSave} />
    </div>
  );
}