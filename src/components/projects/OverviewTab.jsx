import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Calendar, Wallet, CheckCircle, AlertTriangle, Clock, Flag, Layers, TrendingUp, ArrowLeft } from 'lucide-react';
import { PROJECT_STATUS_LABELS, PROJECT_STATUS_COLORS, PROJECT_TYPE_LABELS, PRIORITY_LABELS, PRIORITY_COLORS, TASK_STATUS_LABELS, TASK_STATUS_COLORS, MILESTONE_STATUS_LABELS, formatDate, daysUntil, isOverdue, formatCurrency, calcProgress } from '@/lib/projectUtils';
import { cn } from '@/lib/utils';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';

const STATUS_CHART_COLORS = { not_started: '#9ca3af', in_progress: '#3b82f6', waiting_approval: '#a855f7', waiting_external: '#f59e0b', completed: '#22c55e', cancelled: '#ef4444', stuck: '#dc2626' };
const DOMAIN_CHART_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ec4899', '#06b6d4', '#f97316', '#84cc16', '#6366f1', '#14b8a6', '#eab308', '#6b7280'];

export default function OverviewTab({ project, tasks, milestones, domains, contacts, purchaseOrders }) {
  const openTasks = tasks.filter(t => t.status !== 'completed' && t.status !== 'cancelled');
  const overdueTasks = tasks.filter(t => isOverdue(t.due_date, t.status));
  const completedTasks = tasks.filter(t => t.status === 'completed');
  const inProgressTasks = tasks.filter(t => t.status === 'in_progress');
  const stuckTasks = tasks.filter(t => t.status === 'stuck');
  const progress = project.progress_percentage || calcProgress(tasks);
  const budgetRemaining = (project.budget_approved || project.budget_planned || 0) - (project.budget_used || 0);
  const dDay = daysUntil(project.target_end_date);

  const topLevelDomains = domains?.filter(d => !d.parent_domain_id) || [];
  const completedDomains = topLevelDomains.filter(d => {
    const dTasks = tasks.filter(t => t.domain === d.name);
    return dTasks.length > 0 && dTasks.every(t => t.status === 'completed');
  }).length;

  const completedMilestones = milestones.filter(m => m.is_completed || m.status === 'completed');
  const nextMilestone = milestones
    .filter(m => !m.is_completed && m.target_date)
    .sort((a, b) => (a.target_date || '9999') > (b.target_date || '9999') ? 1 : -1)[0];

  const stats = [
    { label: 'תחומים', value: topLevelDomains.length, icon: Layers, color: 'text-purple-500' },
    { label: 'תחומים שהושלמו', value: completedDomains, icon: CheckCircle, color: 'text-green-500' },
    { label: 'משימות פתוחות', value: openTasks.length, icon: Clock, color: 'text-blue-500' },
    { label: 'משימות שהושלמו', value: completedTasks.length, icon: CheckCircle, color: 'text-green-500' },
    { label: 'משימות בתהליך', value: inProgressTasks.length, icon: TrendingUp, color: 'text-blue-500' },
    { label: 'משימות תקועות', value: stuckTasks.length, icon: AlertTriangle, color: 'text-red-500' },
    { label: 'משימות באיחור', value: overdueTasks.length, icon: AlertTriangle, color: 'text-orange-500' },
    { label: 'אבני דרך שהושלמו', value: completedMilestones.length, icon: Flag, color: 'text-green-500' },
  ];

  const tasksByStatus = Object.entries(TASK_STATUS_LABELS)
    .map(([key, label]) => ({ name: label, value: tasks.filter(t => t.status === key).length, key }))
    .filter(s => s.value > 0);

  const tasksByDomain = topLevelDomains.map(d => {
    const dTasks = tasks.filter(t => t.domain === d.name);
    return { name: d.name.length > 12 ? d.name.substring(0, 12) + '…' : d.name, value: dTasks.length, progress: dTasks.length > 0 ? Math.round((dTasks.filter(t => t.status === 'completed').length / dTasks.length) * 100) : 0 };
  }).filter(d => d.value > 0);

  const budgetData = [
    { name: 'מתוכנן', value: project.budget_planned || 0 },
    { name: 'מאושר', value: project.budget_approved || 0 },
    { name: 'מנוצל', value: project.budget_used || 0 },
    { name: 'יתרה', value: budgetRemaining },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <Card key={label}>
            <CardContent className="flex items-center gap-3 p-3">
              <Icon className={cn('w-7 h-7', color)} />
              <div>
                <p className="text-xl font-bold">{value}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="w-4 h-4" /> התקדמות כללית</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Progress value={progress} className="h-3 flex-1" />
            <span className="text-2xl font-bold">{progress}%</span>
          </div>
        </CardContent>
      </Card>

      {nextMilestone && (
        <Card className="border-blue-200">
          <CardContent className="p-3 flex items-center gap-3">
            <ArrowLeft className="w-5 h-5 text-blue-500 shrink-0" />
            <div className="flex-1">
              <p className="text-xs text-muted-foreground">השלב הבא</p>
              <p className="font-medium">{nextMilestone.name}</p>
            </div>
            <div className="text-left">
              <p className="text-xs text-muted-foreground">יעד</p>
              <p className={cn('text-sm font-medium', daysUntil(nextMilestone.target_date) < 0 && 'text-red-600')}>{formatDate(nextMilestone.target_date)}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">משימות לפי סטטוס</CardTitle></CardHeader>
          <CardContent>
            {tasksByStatus.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={tasksByStatus} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={(e) => `${e.name}: ${e.value}`}>
                    {tasksByStatus.map((entry) => <Cell key={entry.key} fill={STATUS_CHART_COLORS[entry.key]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : <p className="text-center text-muted-foreground py-8">אין נתונים</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">משימות לפי תחום</CardTitle></CardHeader>
          <CardContent>
            {tasksByDomain.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={tasksByDomain} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={(e) => `${e.name}: ${e.value}`}>
                    {tasksByDomain.map((_, i) => <Cell key={i} fill={DOMAIN_CHART_COLORS[i % DOMAIN_CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : <p className="text-center text-muted-foreground py-8">אין נתונים</p>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">התקדמות לפי תחום</CardTitle></CardHeader>
        <CardContent>
          {tasksByDomain.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(150, tasksByDomain.length * 40)}>
              <BarChart data={tasksByDomain} layout="vertical" margin={{ left: 20 }}>
                <XAxis type="number" domain={[0, 100]} unit="%" />
                <YAxis type="category" dataKey="name" width={100} />
                <Bar dataKey="progress" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                <Tooltip />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-center text-muted-foreground py-8">אין נתונים</p>}
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Wallet className="w-4 h-4" /> תקציב</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">תקציב מתוכנן</span><span className="font-medium">{formatCurrency(project.budget_planned)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">תקציב מאושר</span><span className="font-medium">{formatCurrency(project.budget_approved)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">תקציב מנוצל</span><span className="font-medium text-red-600">{formatCurrency(project.budget_used)}</span></div>
            <div className="flex justify-between border-t pt-2"><span className="text-muted-foreground">יתרה</span><span className="font-bold text-green-600">{formatCurrency(budgetRemaining)}</span></div>
            <div className="mt-2">
              <div className="flex justify-between text-xs mb-1"><span>ניצול תקציב</span><span>{project.budget_approved ? Math.round((project.budget_used / project.budget_approved) * 100) : 0}%</span></div>
              <Progress value={project.budget_approved ? (project.budget_used / project.budget_approved) * 100 : 0} className="h-2" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Flag className="w-4 h-4" /> אבני דרך</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {milestones.slice(0, 5).map(m => (
                <div key={m.id} className="flex justify-between items-center text-sm border-b border-border/50 pb-1">
                  <span className={cn('font-medium truncate max-w-[150px]', m.is_completed && 'line-through opacity-60')}>{m.name}</span>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">{formatDate(m.target_date)}</span>
                    <span className={cn('px-1.5 py-0.5 rounded', m.is_completed ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700')}>{m.is_completed ? 'הושלם' : 'פתוח'}</span>
                  </div>
                </div>
              ))}
              {milestones.length === 0 && <p className="text-sm text-muted-foreground">אין אבני דרך</p>}
            </div>
          </CardContent>
        </Card>
      </div>

      {overdueTasks.length > 0 && (
        <Card className="border-red-200">
          <CardHeader><CardTitle className="text-sm flex items-center gap-2 text-red-600"><AlertTriangle className="w-4 h-4" /> משימות באיחור ({overdueTasks.length})</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {overdueTasks.slice(0, 5).map(t => (
                <div key={t.id} className="flex justify-between items-center text-sm border-b border-border/50 pb-1">
                  <span className="truncate max-w-md">{t.task_description}</span>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">{t.assignee || '-'}</span>
                    <span className="text-red-600">{Math.abs(daysUntil(t.due_date))} ימים באיחור</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}