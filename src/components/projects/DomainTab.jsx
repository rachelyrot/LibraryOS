import { Button } from '@/components/ui/button';
import { Layers } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import { DOMAIN_STATUS_LABELS, DOMAIN_STATUS_COLORS, DEFAULT_DOMAINS } from '@/lib/projectUtils';
import { canCreateTasks } from '@/lib/permissions';
import ProjectDataGrid from './grid/ProjectDataGrid';
import { textColumn, enumColumn, numberColumn, fkPickerColumn } from './grid/columnHelpers';
import { makeGridSaveHandler } from './grid/gridSave';

export default function DomainTab({ project, user, domains, setDomains, onLoad }) {
  const canManage = canCreateTasks(user);

  const handleAdd = async () => {
    try {
      await base44.entities.ProjectDomain.create({
        project_id: project.id, project_name: project.name, name: 'תחום חדש', status: 'active',
      });
      onLoad();
    } catch (e) { toast.error('שגיאה בהוספה'); }
  };

  const handleDelete = async (domain) => {
    if (!confirm('למחוק תחום זה?')) return;
    try { await base44.entities.ProjectDomain.delete(domain.id); toast.success('נמחק'); onLoad(); }
    catch (e) { toast.error('שגיאה במחיקה'); }
  };

  const addDefaultDomains = async () => {
    if (!confirm(`להוסיף ${DEFAULT_DOMAINS.length} תחומים ברירת מחדל?`)) return;
    try {
      await base44.entities.ProjectDomain.bulkCreate(
        DEFAULT_DOMAINS.map((name, i) => ({ name, project_id: project.id, project_name: project.name, status: 'active', sort_order: i }))
      );
      toast.success('תחומים נוספו');
      onLoad();
    } catch (e) { toast.error('שגיאה בהוספה'); }
  };

  const handleRowsChange = makeGridSaveHandler(base44.entities.ProjectDomain, setDomains, {
    pairedFields: { parent_domain_id: 'parent_domain_name' },
    onError: onLoad,
  });

  const topLevelDomains = domains.filter((d) => !d.parent_domain_id);

  // תחום (ההורה) ותת תחום (השורה עצמה); עלות לכל שורה, ריקה עד שמזינים
  const costColumn = {
    ...numberColumn('cost', 'עלות', { editable: canManage, width: 120, min: 0 }),
    renderCell: ({ row }) => (
      <div className="text-left w-full px-2" dir="ltr">
        {row.cost != null && row.cost !== '' ? `₪${Number(row.cost).toLocaleString('he-IL')}` : ''}
      </div>
    ),
  };
  const totalCost = domains.reduce((s, d) => s + (Number(d.cost) || 0), 0);

  const columns = [
    fkPickerColumn('parent_domain_id', 'parent_domain_name', 'תחום', topLevelDomains, (d) => d.name, { editable: canManage, width: 160 }),
    textColumn('name', 'תת תחום', { editable: canManage }),
    costColumn,
    enumColumn('status', 'סטטוס', DOMAIN_STATUS_LABELS, DOMAIN_STATUS_COLORS, { editable: canManage, width: 110 }),
    numberColumn('sort_order', 'סדר מיון', { editable: canManage, width: 90 }),
    textColumn('notes', 'הערות', { editable: canManage }),
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <h3 className="text-lg font-semibold">
          תחומים ({domains.length})
          {totalCost > 0 && <span className="text-sm font-normal text-muted-foreground mr-2">· סה"כ עלות <b dir="ltr">₪{totalCost.toLocaleString('he-IL')}</b></span>}
        </h3>
        {canManage && domains.length === 0 && (
          <Button variant="outline" onClick={addDefaultDomains} className="gap-2">
            <Layers className="w-4 h-4" /> תחומים ברירת מחדל
          </Button>
        )}
      </div>

      <ProjectDataGrid
        rows={domains}
        columns={columns}
        onRowsChange={handleRowsChange}
        readOnly={!canManage}
        onAddRow={handleAdd}
        addLabel="תחום חדש"
        onDeleteRow={handleDelete}
        emptyMessage="אין תחומים — הוסיפי תחומים או השתמשי בתחומי ברירת מחדל"
      />
    </div>
  );
}
