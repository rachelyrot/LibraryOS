import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { FolderKanban, AlertTriangle, Clock, CheckCircle, TrendingUp, Wallet } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { cn } from '@/lib/utils';
import { PROJECT_STATUS_COLORS, PROJECT_STATUS_LABELS, isOverdue, formatCurrency } from '@/lib/projectUtils';
import { motion } from 'framer-motion';

function MiniStat({ label, value, icon: Icon, color, to = '/projects' }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <Link to={to}>
        <Card className="hover:shadow-md hover:border-primary/40 transition-all cursor-pointer">
          <CardContent className="flex items-center gap-3 p-4">
            <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', color)}>
              <Icon className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-2xl font-bold">{value}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
          </CardContent>
        </Card>
      </Link>
    </motion.div>
  );
}

export default function ProjectsDashboardCards() {
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);

  useEffect(() => {
    Promise.all([
      base44.entities.Project.list('-created_date', 500).catch(() => []),
      base44.entities.ProjectTask.list('-created_date', 500).catch(() => []),
    ]).then(([p, t]) => { setProjects(p); setTasks(t); });
  }, []);

  const activeProjects = projects.filter(p => p.status === 'active' || p.status === 'planning');
  const overdueTasks = tasks.filter(t => isOverdue(t.due_date, t.status));
  const openTasks = tasks.filter(t => t.status !== 'completed' && t.status !== 'cancelled');
  const completedTasks = tasks.filter(t => t.status === 'completed');
  const stuckTasks = tasks.filter(t => t.status === 'stuck');
  const avgProgress = projects.length > 0 ? Math.round(projects.reduce((s, p) => s + (p.progress_percentage || 0), 0) / projects.length) : 0;
  const totalBudget = projects.reduce((s, p) => s + (p.budget_approved || p.budget_planned || 0), 0);
  const totalUsed = projects.reduce((s, p) => s + (p.budget_used || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold flex items-center gap-2"><FolderKanban className="w-5 h-5 text-cyan-500" /> ניהול פרויקטים</h2>
        <Link to="/projects" className="text-sm text-primary hover:underline">כל הפרויקטים →</Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <MiniStat label="פרויקטים פעילים" value={activeProjects.length} icon={FolderKanban} color="bg-cyan-500" to="/projects?status=active,planning" />
        <MiniStat label="משימות פתוחות" value={openTasks.length} icon={Clock} color="bg-blue-500" />
        <MiniStat label="הושלמו" value={completedTasks.length} icon={CheckCircle} color="bg-green-500" />
        <MiniStat label="באיחור" value={overdueTasks.length} icon={AlertTriangle} color="bg-red-500" />
        <MiniStat label="תקועות" value={stuckTasks.length} icon={AlertTriangle} color="bg-orange-500" />
        <MiniStat label="התקדמות ממוצעת" value={`${avgProgress}%`} icon={TrendingUp} color="bg-purple-500" />
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><Wallet className="w-4 h-4" /> תקציב פרויקטים</div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">תקציב כולל</p>
                <p className="text-lg font-bold">{formatCurrency(totalBudget)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">מנוצל</p>
                <p className="text-lg font-bold text-red-600">{formatCurrency(totalUsed)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">יתרה</p>
                <p className="text-lg font-bold text-green-600">{formatCurrency(totalBudget - totalUsed)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground mb-2">פרויקטים לפי סטטוס</div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(PROJECT_STATUS_LABELS).map(([key, label]) => {
                const count = projects.filter(p => p.status === key).length;
                if (count === 0) return null;
                return (
                  <Link key={key} to={`/projects?status=${key}`} className={cn('text-xs px-2 py-1 rounded hover:opacity-75 transition-opacity', PROJECT_STATUS_COLORS[key])}>
                    {label}: {count}
                  </Link>
                );
              })}
              {projects.length === 0 && <span className="text-sm text-muted-foreground">אין פרויקטים</span>}
            </div>
          </CardContent>
        </Card>
      </div>

      {activeProjects.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="text-sm font-medium mb-2">פרויקטים פעילים</div>
            <div className="space-y-2">
              {activeProjects.slice(0, 5).map(p => (
                <Link key={p.id} to={`/projects/${p.id}`} className="flex items-center justify-between text-sm border-b border-border/50 pb-1 hover:bg-muted/30 -mx-2 px-2 rounded">
                  <span className="font-medium truncate max-w-xs">{p.name}</span>
                  <div className="flex items-center gap-3">
                    <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${p.progress_percentage || 0}%` }} />
                    </div>
                    <span className="text-xs">{p.progress_percentage || 0}%</span>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}