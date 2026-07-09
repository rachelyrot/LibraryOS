import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Download, FileText, AlertTriangle, Wallet, Users, Layers } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { cn } from '@/lib/utils';
import { TASK_STATUS_LABELS, PRIORITY_LABELS, CONTACT_TYPE_LABELS, formatDate, isOverdue, daysUntil, formatCurrency } from '@/lib/projectUtils';
import { canViewProjectReports } from '@/lib/permissions';

export default function ReportsTab({ project, user, tasks, domains, contacts, purchaseOrders, milestones }) {
  const canView = canViewProjectReports(user);
  const [exporting, setExporting] = useState('');

  if (!canView) {
    return <div className="text-center py-12 text-muted-foreground">אין הרשאה לצפות בדוחות</div>;
  }

  const exportTasks = () => {
    setExporting('tasks');
    try {
      const data = tasks.map(t => ({
        'שלב': t.phase || '', 'תחום': t.domain || '', 'תת-תחום': t.sub_domain || '',
        'משימה': t.task_description || '', 'אחראי בפועל': t.assignee || '', 'שותפים': t.partners || '',
        'גורמים לביצוע': t.executing_parties || '', 'איש קשר': t.contact_name || '',
        'טלפון': t.contact_phone || '', 'מייל': t.contact_email || '',
        'תאריך יעד': t.due_date || '', 'עדיפות': PRIORITY_LABELS[t.priority] || '',
        'סטטוס': TASK_STATUS_LABELS[t.status] || '', 'אחוז התקדמות': t.progress_percentage || 0, 'הערות': t.notes || ''
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'משימות');
      XLSX.writeFile(wb, `דוח_משימות_${project.name}.xlsx`);
      toast.success('הדוח יוצא');
    } catch (e) { toast.error('שגיאה בייצוא'); }
    setExporting('');
  };

  const exportOverdue = () => {
    setExporting('overdue');
    try {
      const overdue = tasks.filter(t => isOverdue(t.due_date, t.status));
      const data = overdue.map(t => ({
        'פרויקט': project.name, 'תחום': t.domain || '', 'משימה': t.task_description || '',
        'אחראי בפועל': t.assignee || '', 'תאריך יעד': t.due_date || '',
        'ימים באיחור': Math.abs(daysUntil(t.due_date) || 0), 'סטטוס': TASK_STATUS_LABELS[t.status] || ''
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'משימות באיחור');
      XLSX.writeFile(wb, `דוח_משימות_באיחור_${project.name}.xlsx`);
      toast.success('הדוח יוצא');
    } catch (e) { toast.error('שגיאה בייצוא'); }
    setExporting('');
  };

  const exportBudget = () => {
    setExporting('budget');
    try {
      const data = [{
        'פרויקט': project.name, 'מקור תקציב': project.budget_source_name || '',
        'תקציב מתוכנן': project.budget_planned || 0, 'תקציב מאושר': project.budget_approved || 0,
        'תקציב מנוצל': project.budget_used || 0, 'יתרה': (project.budget_approved || 0) - (project.budget_used || 0),
        'תקציב אושר': project.budget_is_approved ? 'כן' : 'לא', 'גורם מאשר': project.budget_approver || '',
        'תאריך אישור': project.budget_approval_date || '',
        'הזמנות רכש': purchaseOrders.length, 'סה"כ הזמנות': purchaseOrders.reduce((s, po) => s + (po.total_amount || 0), 0)
      }];
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'תקציב');
      XLSX.writeFile(wb, `דוח_תקציב_${project.name}.xlsx`);
      toast.success('הדוח יוצא');
    } catch (e) { toast.error('שגיאה בייצוא'); }
    setExporting('');
  };

  const exportContacts = () => {
    setExporting('contacts');
    try {
      const data = contacts.map(c => ({
        'שם': c.contact_name || '', 'תפקיד': c.contact_role || '',
        'סוג קשר': CONTACT_TYPE_LABELS[c.contact_type] || '', 'טלפון': c.contact_phone || '',
        'מייל': c.contact_email || '', 'הערות': c.notes || ''
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'אנשי קשר');
      XLSX.writeFile(wb, `דוח_אנשי_קשר_${project.name}.xlsx`);
      toast.success('הדוח יוצא');
    } catch (e) { toast.error('שגיאה בייצוא'); }
    setExporting('');
  };

  const exportDomains = () => {
    setExporting('domains');
    try {
      const topLevel = domains?.filter(d => !d.parent_domain_id) || [];
      const data = topLevel.map(d => {
        const dTasks = tasks.filter(t => t.domain === d.name);
        const completed = dTasks.filter(t => t.status === 'completed').length;
        return {
          'תחום': d.name, 'סטטוס': d.status === 'active' ? 'פעיל' : 'לא פעיל',
          'משימות': dTasks.length, 'הושלמו': completed,
          'אחוז השלמה': dTasks.length > 0 ? Math.round((completed / dTasks.length) * 100) : 0
        };
      });
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'תחומים');
      XLSX.writeFile(wb, `דוח_תחומים_${project.name}.xlsx`);
      toast.success('הדוח יוצא');
    } catch (e) { toast.error('שגיאה בייצוא'); }
    setExporting('');
  };

  const tasksByStatus = Object.entries(TASK_STATUS_LABELS).map(([key, label]) => ({
    status: key, label, count: tasks.filter(t => t.status === key).length,
    color: { not_started: 'bg-gray-100 text-gray-700', in_progress: 'bg-blue-100 text-blue-700', waiting_approval: 'bg-purple-100 text-purple-700', waiting_external: 'bg-amber-100 text-amber-700', completed: 'bg-green-100 text-green-700', cancelled: 'bg-red-100 text-red-700', stuck: 'bg-red-100 text-red-700' }[key]
  }));

  const topLevel = domains?.filter(d => !d.parent_domain_id) || [];
  const overdueTasks = tasks.filter(t => isOverdue(t.due_date, t.status));

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">דוחות פרויקט</h3>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><FileText className="w-4 h-4" /> משימות לפי סטטוס</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {tasksByStatus.map(s => (
                <div key={s.status} className="flex items-center justify-between">
                  <span className={cn('text-xs px-2 py-0.5 rounded', s.color)}>{s.label}</span>
                  <span className="font-bold">{s.count}</span>
                </div>
              ))}
            </div>
            <Button onClick={exportTasks} disabled={exporting === 'tasks'} className="gap-2 mt-3 w-full" variant="outline">
              <Download className="w-4 h-4" /> {exporting === 'tasks' ? 'מייצא...' : 'ייצא דוח משימות'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> משימות באיחור ({overdueTasks.length})</CardTitle></CardHeader>
          <CardContent>
            {overdueTasks.length === 0 ? (
              <p className="text-sm text-green-600">אין משימות באיחור ✓</p>
            ) : (
              <div className="space-y-1 max-h-32 overflow-auto">
                {overdueTasks.slice(0, 5).map(t => (
                  <div key={t.id} className="text-xs flex justify-between border-b border-border/50 pb-1">
                    <span className="truncate max-w-[200px]">{t.task_description}</span>
                    <span className="text-red-600">{Math.abs(daysUntil(t.due_date))} ימים</span>
                  </div>
                ))}
              </div>
            )}
            <Button onClick={exportOverdue} disabled={exporting === 'overdue'} className="gap-2 mt-3 w-full" variant="outline">
              <Download className="w-4 h-4" /> {exporting === 'overdue' ? 'מייצא...' : 'ייצא דוח איחורים'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Layers className="w-4 h-4" /> תחומים ({topLevel.length})</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-1 max-h-32 overflow-auto">
              {topLevel.map(d => {
                const dTasks = tasks.filter(t => t.domain === d.name);
                return (
                  <div key={d.id} className="text-xs flex justify-between border-b border-border/50 pb-1">
                    <span>{d.name}</span>
                    <span className="text-muted-foreground">{dTasks.filter(t => t.status === 'completed').length}/{dTasks.length}</span>
                  </div>
                );
              })}
              {topLevel.length === 0 && <p className="text-sm text-muted-foreground">אין תחומים</p>}
            </div>
            <Button onClick={exportDomains} disabled={exporting === 'domains'} className="gap-2 mt-3 w-full" variant="outline">
              <Download className="w-4 h-4" /> {exporting === 'domains' ? 'מייצא...' : 'ייצא דוח תחומים'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Wallet className="w-4 h-4" /> תקציב</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">תקציב מאושר</span><span>{formatCurrency(project.budget_approved)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">מנוצל</span><span className="text-red-600">{formatCurrency(project.budget_used)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">יתרה</span><span className="text-green-600">{formatCurrency((project.budget_approved || 0) - (project.budget_used || 0))}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">הזמנות רכש</span><span>{purchaseOrders.length}</span></div>
            </div>
            <Button onClick={exportBudget} disabled={exporting === 'budget'} className="gap-2 mt-3 w-full" variant="outline">
              <Download className="w-4 h-4" /> {exporting === 'budget' ? 'מייצא...' : 'ייצא דוח תקציב'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Users className="w-4 h-4" /> אנשי קשר ({contacts.length})</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">סך אנשי קשר</span><span>{contacts.length}</span></div>
              {Object.entries(CONTACT_TYPE_LABELS).map(([k, v]) => {
                const count = contacts.filter(c => c.contact_type === k).length;
                return count > 0 ? <div key={k} className="flex justify-between text-xs"><span className="text-muted-foreground">{v}</span><span>{count}</span></div> : null;
              })}
            </div>
            <Button onClick={exportContacts} disabled={exporting === 'contacts'} className="gap-2 mt-3 w-full" variant="outline">
              <Download className="w-4 h-4" /> {exporting === 'contacts' ? 'מייצא...' : 'ייצא דוח אנשי קשר'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}