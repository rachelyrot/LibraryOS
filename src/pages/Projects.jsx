import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Plus, Upload, Search, FolderKanban, Calendar, Wallet, Download } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import * as XLSX from 'xlsx';
import { PROJECT_TYPE_LABELS, PROJECT_STATUS_LABELS, PROJECT_STATUS_COLORS, PRIORITY_LABELS, PRIORITY_COLORS, formatDate, daysUntil, isOverdue, formatCurrency } from '@/lib/projectUtils';
import { canCreateProjects, canViewProjectReports } from '@/lib/permissions';
import ProjectDialog from '@/components/projects/ProjectDialog';
import ImportTasksDialog from '@/components/projects/ImportTasksDialog';
import PageHeader from '@/components/PageHeader';

export default function Projects() {
  const [user, setUser] = useState(null);
  const [projects, setProjects] = useState([]);
  const [branches, setBranches] = useState([]);
  const [budgetSources, setBudgetSources] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filters, setFilters] = useState({ status: 'all', type: 'all', search: '' });

  const load = () => {
    Promise.all([
      base44.entities.Project.list('-created_date', 500).catch(() => []),
      base44.entities.Branch.list('name', 500).catch(() => []),
      base44.entities.BudgetSource.list('-created_date', 200).catch(() => []),
      base44.entities.ProjectTask.list('-created_date', 500).catch(() => []),
    ]).then(([p, b, bs, t]) => {
      setProjects(p); setBranches(b); setBudgetSources(bs); setTasks(t); setLoading(false);
    });
  };

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
    load();
  }, []);

  const canCreate = canCreateProjects(user);
  const canViewReports = canViewProjectReports(user);

  const filtered = projects.filter(p => {
    if (filters.status !== 'all' && p.status !== filters.status) return false;
    if (filters.type !== 'all' && p.project_type !== filters.type) return false;
    if (filters.search && !p.name?.includes(filters.search) && !p.manager_name?.includes(filters.search)) return false;
    return true;
  });

  const handleSave = async (data) => {
    try {
      if (editing) { await base44.entities.Project.update(editing.id, data); toast.success('פרויקט עודכן'); }
      else { await base44.entities.Project.create(data); toast.success('פרויקט נוצר'); }
      setEditing(null); load();
    } catch (e) { toast.error('שגיאה בשמירה'); }
  };

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

  return (
    <div className="p-6 max-w-7xl mx-auto animate-fade-in">
      <PageHeader
        title="ניהול פרויקטים"
        subtitle="ניהול פרויקטים, תוכניות עבודה, משימות, תקציבים וכוח אדם"
        actions={
          <div className="flex gap-2">
            {canCreate && <Button variant="outline" onClick={() => setImportOpen(true)} className="gap-2"><Upload className="w-4 h-4" /> ייבוא מאקסל</Button>}
            {canViewReports && <Button variant="outline" onClick={exportProjects} className="gap-2"><Download className="w-4 h-4" /> ייצא דוח</Button>}
            {canCreate && <Button onClick={() => { setEditing(null); setDialogOpen(true); }} className="gap-2"><Plus className="w-4 h-4" /> פרויקט חדש</Button>}
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
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <FolderKanban className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">אין פרויקטים{canCreate ? ' — צרי פרויקט חדש כדי להתחיל' : ''}</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(p => {
            const pTasks = tasks.filter(t => t.project_id === p.id);
            const openTasks = pTasks.filter(t => t.status !== 'completed' && t.status !== 'cancelled');
            const overdue = pTasks.filter(t => isOverdue(t.due_date, t.status));
            const dDay = daysUntil(p.target_end_date);
            const budgetRemaining = (p.budget_approved || p.budget_planned || 0) - (p.budget_used || 0);
            return (
              <Link key={p.id} to={`/projects/${p.id}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold truncate">{p.name}</h3>
                        <p className="text-xs text-muted-foreground">{PROJECT_TYPE_LABELS[p.project_type]}</p>
                      </div>
                      <span className={cn('text-xs px-2 py-0.5 rounded shrink-0', PROJECT_STATUS_COLORS[p.status])}>{PROJECT_STATUS_LABELS[p.status]}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Progress value={p.progress_percentage || 0} className="h-2 flex-1" />
                      <span className="text-sm font-bold">{p.progress_percentage || 0}%</span>
                    </div>

                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className={cn('px-2 py-0.5 rounded', PRIORITY_COLORS[p.priority])}>{PRIORITY_LABELS[p.priority]}</span>
                      {p.branch_name && <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded">{p.branch_name}</span>}
                      {p.manager_name && <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded">{p.manager_name}</span>}
                    </div>

                    <div className="flex items-center justify-between text-xs text-muted-foreground border-t pt-2">
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {formatDate(p.target_end_date)} {dDay !== null && dDay < 0 && <span className="text-red-600">({Math.abs(dDay)}י איחור)</span>}</span>
                      <span className="flex items-center gap-1"><Wallet className="w-3 h-3" /> {formatCurrency(budgetRemaining)}</span>
                    </div>

                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-blue-600">{openTasks.length} פתוחות</span>
                      {overdue.length > 0 && <span className="text-red-600">{overdue.length} באיחור</span>}
                      <span className="text-green-600">{pTasks.filter(t => t.status === 'completed').length} הושלמו</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      <ProjectDialog open={dialogOpen} onOpenChange={setDialogOpen} initialData={editing} branches={branches} budgetSources={budgetSources} onSave={handleSave} />
      <ImportTasksDialog open={importOpen} onOpenChange={setImportOpen} projects={projects} onImported={load} />
    </div>
  );
}