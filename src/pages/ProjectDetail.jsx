import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowRight, LayoutGrid, ListTodo, Flag, Wallet, FileText, BarChart3, Layers, UserCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import { PROJECT_TYPE_LABELS, PROJECT_STATUS_LABELS, PROJECT_STATUS_COLORS, PRIORITY_LABELS, PRIORITY_COLORS, formatDate, daysUntil } from '@/lib/projectUtils';
import { canViewProjectBudget, canViewProjectReports } from '@/lib/permissions';
import OverviewTab from '@/components/projects/OverviewTab';
import TasksTab from '@/components/projects/TasksTab';
import MilestonesTab from '@/components/projects/MilestonesTab';
import DomainTab from '@/components/projects/DomainTab';
import BudgetTab from '@/components/projects/BudgetTab';
import ContactsTab from '@/components/projects/ContactsTab';
import DocumentsTab from '@/components/projects/DocumentsTab';
import ReportsTab from '@/components/projects/ReportsTab';

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [project, setProject] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [domains, setDomains] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [credits, setCredits] = useState([]);
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    if (!id) return;
    Promise.all([
      base44.entities.Project.get(id).catch(() => null),
      base44.entities.ProjectTask.filter({ project_id: id }, '-created_date', 500).catch(() => []),
      base44.entities.ProjectMilestone.filter({ project_id: id }, '-created_date', 200).catch(() => []),
      base44.entities.ProjectDomain.filter({ project_id: id }, 'sort_order', 500).catch(() => []),
      base44.entities.ProjectContact.filter({ project_id: id }, '-created_date', 200).catch(() => []),
      base44.entities.ProjectDocument.filter({ project_id: id }, '-created_date', 200).catch(() => []),
      base44.entities.PurchaseOrder.filter({ project_id: id }, '-created_date', 200).catch(() => []),
      base44.entities.SupplierCredit.filter({ status: 'active' }, '-created_date', 200).catch(() => []),
    ]).then(([p, t, m, dom, cont, docs, pos, cr]) => {
      setProject(p); setTasks(t); setMilestones(m); setDomains(dom); setContacts(cont);
      setDocuments(docs); setPurchaseOrders(pos);
      setCredits(cr); setLoading(false);
    });
  }, [id]);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
    load();
  }, [load]);

  if (loading) {
    return <div className="p-6 flex items-center justify-center h-full"><div className="w-8 h-8 border-4 border-cyan-200 border-t-cyan-600 rounded-full animate-spin" /></div>;
  }

  if (!project) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground mb-4">פרויקט לא נמצא</p>
        <Button onClick={() => navigate('/projects')} className="gap-2"><ArrowRight className="w-4 h-4" /> חזרה לפרויקטים</Button>
      </div>
    );
  }

  const canViewBudget = canViewProjectBudget(user);
  const canViewReports = canViewProjectReports(user);
  const dDay = daysUntil(project.target_end_date);
  const openTasks = tasks.filter(t => t.status !== 'completed' && t.status !== 'cancelled');

  return (
    <div className="p-6 max-w-7xl mx-auto animate-fade-in">
      <Button variant="ghost" onClick={() => navigate('/projects')} className="gap-2 mb-4 -mr-2">
        <ArrowRight className="w-4 h-4" /> חזרה לפרויקטים
      </Button>

      <div className="bg-card rounded-2xl p-5 border border-border mb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h1 className="text-2xl font-bold">{project.name}</h1>
              <span className={cn('text-xs px-2 py-0.5 rounded', PROJECT_STATUS_COLORS[project.status])}>{PROJECT_STATUS_LABELS[project.status]}</span>
              <span className={cn('text-xs px-2 py-0.5 rounded', PRIORITY_COLORS[project.priority])}>{PRIORITY_LABELS[project.priority]}</span>
              {project.budget_is_approved && <span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-700">תקציב מאושר</span>}
            </div>
            <p className="text-sm text-muted-foreground">{PROJECT_TYPE_LABELS[project.project_type]}{project.branch_name && ` • ${project.branch_name}`}{project.manager_name && ` • ${project.manager_name}`}</p>
            {project.description && <p className="text-sm mt-2 text-muted-foreground">{project.description}</p>}
            <div className="flex items-center gap-4 mt-3">
              <div className="flex items-center gap-2">
                <Progress value={project.progress_percentage || 0} className="h-2 w-32" />
                <span className="text-sm font-bold">{project.progress_percentage || 0}%</span>
              </div>
              {project.target_end_date && (
                <span className={cn('text-sm', dDay < 0 && 'text-red-600 font-medium')}>
                  יעד: {formatDate(project.target_end_date)} {dDay !== null && dDay >= 0 && `(${dDay} ימים)`}{dDay !== null && dDay < 0 && `(${Math.abs(dDay)} ימים באיחור)`}
                </span>
              )}
              <span className="text-sm text-muted-foreground">{openTasks.length} משימות פתוחות</span>
            </div>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid grid-cols-4 lg:grid-cols-8 gap-1 h-auto">
          <TabsTrigger value="overview" className="flex items-center gap-1.5 py-2.5"><LayoutGrid className="w-4 h-4" /><span className="hidden lg:inline">סקירה</span></TabsTrigger>
          <TabsTrigger value="domains" className="flex items-center gap-1.5 py-2.5"><Layers className="w-4 h-4" /><span className="hidden lg:inline">תחומים</span></TabsTrigger>
          <TabsTrigger value="tasks" className="flex items-center gap-1.5 py-2.5"><ListTodo className="w-4 h-4" /><span className="hidden lg:inline">משימות</span></TabsTrigger>
          <TabsTrigger value="milestones" className="flex items-center gap-1.5 py-2.5"><Flag className="w-4 h-4" /><span className="hidden lg:inline">אבני דרך</span></TabsTrigger>
          {canViewBudget && <TabsTrigger value="budget" className="flex items-center gap-1.5 py-2.5"><Wallet className="w-4 h-4" /><span className="hidden lg:inline">תקציב</span></TabsTrigger>}
          <TabsTrigger value="contacts" className="flex items-center gap-1.5 py-2.5"><UserCircle className="w-4 h-4" /><span className="hidden lg:inline">אנשי קשר</span></TabsTrigger>
          <TabsTrigger value="documents" className="flex items-center gap-1.5 py-2.5"><FileText className="w-4 h-4" /><span className="hidden lg:inline">קבצים</span></TabsTrigger>
          {canViewReports && <TabsTrigger value="reports" className="flex items-center gap-1.5 py-2.5"><BarChart3 className="w-4 h-4" /><span className="hidden lg:inline">דוחות</span></TabsTrigger>}
        </TabsList>

        <TabsContent value="overview"><OverviewTab project={project} tasks={tasks} milestones={milestones} domains={domains} contacts={contacts} purchaseOrders={purchaseOrders} /></TabsContent>
        <TabsContent value="domains"><DomainTab project={project} user={user} domains={domains} setDomains={setDomains} onLoad={load} /></TabsContent>
        <TabsContent value="tasks"><TasksTab project={project} user={user} tasks={tasks} setTasks={setTasks} onLoad={load} projects={[project]} domains={domains} /></TabsContent>
        <TabsContent value="milestones"><MilestonesTab project={project} user={user} milestones={milestones} setMilestones={setMilestones} tasks={tasks} onLoad={load} /></TabsContent>
        {canViewBudget && <TabsContent value="budget"><BudgetTab project={project} user={user} purchaseOrders={purchaseOrders} credits={credits} /></TabsContent>}
        <TabsContent value="contacts"><ContactsTab project={project} user={user} contacts={contacts} setContacts={setContacts} tasks={tasks} onLoad={load} /></TabsContent>
        <TabsContent value="documents"><DocumentsTab project={project} user={user} documents={documents} setDocuments={setDocuments} onLoad={load} /></TabsContent>
        {canViewReports && <TabsContent value="reports"><ReportsTab project={project} user={user} tasks={tasks} domains={domains} contacts={contacts} purchaseOrders={purchaseOrders} milestones={milestones} /></TabsContent>}
      </Tabs>
    </div>
  );
}