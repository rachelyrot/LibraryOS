import { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import { CONTACT_TYPE_LABELS, CONTACT_TYPE_COLORS } from '@/lib/projectUtils';
import { canCreateTasks } from '@/lib/permissions';
import ProjectDataGrid from './grid/ProjectDataGrid';
import { textColumn, enumColumn, fkPickerColumn } from './grid/columnHelpers';
import { makeGridSaveHandler } from './grid/gridSave';

export default function ContactsTab({ project, user, contacts, tasks, onLoad }) {
  const [typeFilter, setTypeFilter] = useState('all');
  const canManage = canCreateTasks(user);

  const handleAdd = async () => {
    try {
      await base44.entities.ProjectContact.create({
        project_id: project.id, project_name: project.name, contact_name: 'איש קשר חדש', contact_type: 'other',
      });
      onLoad();
    } catch (e) { toast.error('שגיאה בהוספה'); }
  };

  const handleDelete = async (contact) => {
    if (!confirm('למחוק איש קשר זה?')) return;
    try { await base44.entities.ProjectContact.delete(contact.id); toast.success('נמחק'); onLoad(); }
    catch (e) { toast.error('שגיאה במחיקה'); }
  };

  const handleRowsChange = makeGridSaveHandler(base44.entities.ProjectContact, { onError: onLoad });

  const filtered = contacts.filter((c) => typeFilter === 'all' || c.contact_type === typeFilter);

  const columns = [
    textColumn('contact_name', 'שם', { editable: canManage, width: 150 }),
    enumColumn('contact_type', 'סוג', CONTACT_TYPE_LABELS, CONTACT_TYPE_COLORS, { editable: canManage, width: 120 }),
    textColumn('contact_role', 'תפקיד', { editable: canManage, width: 130 }),
    textColumn('contact_phone', 'טלפון', { editable: canManage, width: 120 }),
    textColumn('contact_email', 'מייל', { editable: canManage, width: 170 }),
    fkPickerColumn('task_id', null, 'משימה קשורה', tasks || [], (t) => t.task_description, { editable: canManage, width: 160, noNameColumn: true }),
    textColumn('notes', 'הערות', { editable: canManage, width: 180 }),
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <h3 className="text-lg font-semibold">אנשי קשר ({filtered.length})</h3>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">כל הסוגים</SelectItem>
            {Object.entries(CONTACT_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <ProjectDataGrid
        rows={filtered}
        columns={columns}
        onRowsChange={handleRowsChange}
        readOnly={!canManage}
        onAddRow={handleAdd}
        addLabel="איש קשר חדש"
        onDeleteRow={handleDelete}
        emptyMessage="אין אנשי קשר"
      />
    </div>
  );
}
