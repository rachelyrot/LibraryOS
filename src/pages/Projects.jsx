import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Upload, Search, Download, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { PROJECT_TYPE_LABELS, PROJECT_STATUS_LABELS, PROJECT_STATUS_COLORS, PRIORITY_LABELS, PRIORITY_COLORS } from '@/lib/projectUtils';
import { canCreateProjects, canViewProjectReports } from '@/lib/permissions';
import ImportTasksDialog from '@/components/projects/ImportTasksDialog';
import PageHeader from '@/components/PageHeader';
import ProjectDataGrid from '@/components/projects/grid/ProjectDataGrid';
import { textColumn, dateColumn, enumColumn, numberColumn, fkPickerColumn } from '@/components/projects/grid/columnHelpers';
import { makeGridSaveHandler } from '@/components/projects/grid/gridSave';

export default function Projects() {
  const [user, setUser] = useState(null);
  const [projects, setProjects] = useState([]);
  const [branches, setBranches] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [importOpen, setImportOpen] = useState(false);
  const [filters, setFilters] = useState({ status: 'all', type: 'all', search: '' });

  const load = () => {
    Promise.all([
      base44.entities.Project.list('-created_date', 500).catch(() => []),
      base44.entities.Branch.list('name', 500).catch(() => []),
      base44.entities.ProjectTask.list('-created_date', 500).catch(() => []),
    ]).then(([p, b, t]) => {
      setProjects(p); setBranches(b); setTasks(t); setLoading(false);
    });
  };

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
    load();
  }, []);

  const canManage = canCreateProjects(user);
  const canViewReports = canViewProjectReports(user);

  const filtered = projects.filter(p => {
    if (filters.status !== 'all' && p.status !== filters.status) return false;
    if (filters.type !== 'all' && p.project_type !== filters.type) return false;
    if (filters.search && !p.name?.includes(filters.search) && !p.manager_name?.includes(filters.search)) return false;
    return true;
  });

  const handleAdd = async () => {
    try {
      await base44.entities.Project.create({ name: 'פרויקט חדש', status: 'draft', project_type: 'other', priority: 'medium' });
      load();
    } catch (e) { toast.error('שגיאה בהוספה'); }
  };

  const handleDelete = async (project) => {
    if (!confirm('למחוק פרויקט זה?')) return;
    try { await base44.entities.Project.delete(project.id); toast.success('נמחק'); load(); }
    catch (e) { toast.error('שגיאה במחיקה'); }
  };

  const handleRowsChange = makeGridSaveHandler(base44.entities.Project, {
    pairedFields: { branch_id: 'branch_name' },
    onError: load,
  });

  const exportProjects = () => {
    try {
      const data = filtered.map(p => {
        const pTasks = tasks.filter(t => t.project_id === p.id);
        const budgetRemaining = (p.budget_approved || p.budget_planned || 0) - (p.budget_used || 0);
        return {
          'שם פרויקט': p.name || '', 'סוג': PROJECT_TYPE_LABELS[p.project_type] || '',
          'סניף': p.branch_name || '', 'אחראית': p.manager_name || '',
          'תאריך התחלה': p.start_date || '', 'תאריך יעד': p.target_end_date || '',
          'סטטוס': PROJECT_STATUS_LABELS[p.status] || '', 'אחוז התקדמות': p.progress_percentage || 0,
          'תקציב מתוכנן': p.budget_planned || 0, 'תקציב מאושר': p.budget_approved || 0,
          'נוצל': p.budget_used || 0, 'יתרה': budgetRemaining,
          'משימות': pTasks.length, 'משימות פתוחות': pTasks.filter(t => t.status !== 'completed' && t.status !== 'cancelled').length
        };
      });
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'פרויקטים');
      XLSX.writeFile(wb, 'דוח_פרויקטים.xlsx');
      toast.success('הדוח יוצא');
    } catch (e) { toast.error('שגיאה בייצוא'); }
  };

  const columns = [
    {
      key: '__open', name: '', width: 40, editable: false, resizable: false,
      renderCell({ row }) {
        return (
          <div className="w-full h-full flex items-center justify-center">
            <Link to={`/projects/${row.id}`} className="text-primary hover:opacity-70">
              <ExternalLink className="w-4 h-4" />
            </Link>
          </div>
        );
      },
    },
    textColumn('name', 'שם פרויקט', { editable: canManage, width: 200 }),
    enumColumn('project_type', 'סוג', PROJECT_TYPE_LABELS, {}, { editable: canManage, width: 140 }),
    fkPickerColumn('branch_id', 'branch_name', 'סניף', branches, (b) => b.name, { editable: canManage, width: 130 }),
    textColumn('manager_name', 'אחראית', { editable: canManage, width: 120 }),
    enumColumn('status', 'סטטוס', PROJECT_STATUS_LABELS, PROJECT_STATUS_COLORS, { editable: canManage, width: 110 }),
    enumColumn('priority', 'עדיפות', PRIORITY_LABELS, PRIORITY_COLORS, { editable: canManage, width: 100 }),
    numberColumn('progress_percentage', 'התקדמות %', { editable: canManage, width: 100 }),
    dateColumn('start_date', 'תאריך התחלה', { editable: canManage, width: 110 }),
    dateColumn('target_end_date', 'תאריך יעד', { editable: canManage, width: 110 }),
    numberColumn('budget_planned', 'תקציב מתוכנן', { editable: canManage, width: 120 }),
    numberColumn('budget_approved', 'תקציב מאושר', { editable: canManage, width: 120 }),
    {
      key: '__tasks', name: 'משימות', width: 90, editable: false, resizable: false,
      renderCell({ row }) {
        const pTasks = tasks.filter(t => t.project_id === row.id);
        const open = pTasks.filter(t => t.status !== 'completed' && t.status !== 'cancelled').length;
        return <div className="w-full px-2 text-center text-xs text-muted-foreground">{open}/{pTasks.length}</div>;
      },
    },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto animate-fade-in">
      <PageHeader
        title="ניהול פרויקטים"
        subtitle="ניהול פרויקטים, תוכניות עבודה, משימות, תקציבים וכוח אדם"
        actions={
          <div className="flex gap-2">
            {canManage && <Button variant="outline" onClick={() => setImportOpen(true)} className="gap-2"><Upload className="w-4 h-4" /> ייבוא מאקסל</Button>}
            {canViewReports && <Button variant="outline" onClick={exportProjects} className="gap-2"><Download className="w-4 h-4" /> ייצא דוח</Button>}
            {canManage && <Button onClick={handleAdd} className="gap-2"><Plus className="w-4 h-4" /> פרויקט חדש</Button>}
          </div>
        }
        gradient="from-cyan-500 to-blue-500"
      />

      <div className="flex gap-2 flex-wrap mb-4">
        <div className="relative">
          <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="חיפוש פרויקט..." value={filters.search} onChange={e => setFilters(f => ({ ...f, search: e.target.value }))} className="w-48 pr-9" />
        </div>
        <Select value={filters.status} onValueChange={v => setFilters(f => ({ ...f, status: v }))}>
          <SelectTrigger className="w-36"><SelectValue placeholder="סטטוס" /></SelectTrigger>
          <SelectContent><SelectItem value="all">כל הסטטוסים</SelectItem>{Object.entries(PROJECT_STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={filters.type} onValueChange={v => setFilters(f => ({ ...f, type: v }))}>
          <SelectTrigger className="w-40"><SelectValue placeholder="סוג" /></SelectTrigger>
          <SelectContent><SelectItem value="all">כל הסוגים</SelectItem>{Object.entries(PROJECT_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="text-center py-20"><div className="w-8 h-8 border-4 border-cyan-200 border-t-cyan-600 rounded-full animate-spin mx-auto" /></div>
      ) : (
        <ProjectDataGrid
          rows={filtered}
          columns={columns}
          onRowsChange={handleRowsChange}
          readOnly={!canManage}
          onDeleteRow={handleDelete}
          emptyMessage={`אין פרויקטים${canManage ? ' — צרי פרויקט חדש כדי להתחיל' : ''}`}
        />
      )}

      <ImportTasksDialog open={importOpen} onOpenChange={setImportOpen} projects={projects} onImported={load} />
    </div>
  );
}
