import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Plus, Pencil, Trash2, Layers, ChevronDown, ChevronLeft } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { DOMAIN_STATUS_LABELS, DOMAIN_STATUS_COLORS, DEFAULT_DOMAINS } from '@/lib/projectUtils';
import { canCreateTasks } from '@/lib/permissions';
import DomainDialog from './DomainDialog';

export default function DomainTab({ project, user, domains, tasks, onLoad }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [expanded, setExpanded] = useState({});
  const canManage = canCreateTasks(user);

  const topLevel = domains.filter(d => !d.parent_domain_id);
  const getSubDomains = (parentId) => domains.filter(d => d.parent_domain_id === parentId);

  const getDomainStats = (domainName) => {
    const domainTasks = tasks.filter(t => t.domain === domainName);
    const completed = domainTasks.filter(t => t.status === 'completed').length;
    return { total: domainTasks.length, completed, progress: domainTasks.length > 0 ? Math.round((completed / domainTasks.length) * 100) : 0 };
  };

  const handleSave = async (data) => {
    try {
      if (editing) { await base44.entities.ProjectDomain.update(editing.id, data); toast.success('תחום עודכן'); }
      else { await base44.entities.ProjectDomain.create({ ...data, project_id: project.id, project_name: project.name }); toast.success('תחום נוסף'); }
      setEditing(null); onLoad();
    } catch (e) { toast.error('שגיאה בשמירה'); }
  };

  const handleDelete = async (domain) => {
    if (!confirm('למחוק תחום זה?')) return;
    try { await base44.entities.ProjectDomain.delete(domain.id); toast.success('נמחק'); onLoad(); }
    catch (e) { toast.error('שגיאה במחיקה'); }
  };

  const toggleStatus = async (domain) => {
    try {
      await base44.entities.ProjectDomain.update(domain.id, { status: domain.status === 'active' ? 'inactive' : 'active' });
      onLoad();
    } catch (e) { toast.error('שגיאה בעדכון'); }
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

  const toggleExpand = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <h3 className="text-lg font-semibold">תחומים ({topLevel.length})</h3>
        <div className="flex gap-2">
          {canManage && topLevel.length === 0 && <Button variant="outline" onClick={addDefaultDomains} className="gap-2"><Layers className="w-4 h-4" /> תחומים ברירת מחדל</Button>}
          {canManage && <Button onClick={() => { setEditing(null); setDialogOpen(true); }} className="gap-2"><Plus className="w-4 h-4" /> תחום חדש</Button>}
        </div>
      </div>

      <div className="space-y-2">
        {topLevel.map(d => {
          const subs = getSubDomains(d.id);
          const stats = getDomainStats(d.name);
          const isExpanded = expanded[d.id] || subs.length === 0;
          return (
            <Card key={d.id} className={cn(d.status === 'inactive' && 'opacity-60')}>
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  {subs.length > 0 && (
                    <button onClick={() => toggleExpand(d.id)} className="text-muted-foreground hover:text-foreground">
                      {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
                    </button>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-medium">{d.name}</h4>
                      <span className={cn('text-xs px-2 py-0.5 rounded', DOMAIN_STATUS_COLORS[d.status])}>{DOMAIN_STATUS_LABELS[d.status]}</span>
                      {stats.total > 0 && <span className="text-xs text-muted-foreground">{stats.total} משימות ({stats.completed} הושלמו)</span>}
                      {subs.length > 0 && <span className="text-xs text-muted-foreground">{subs.length} תתי-תחומים</span>}
                    </div>
                    {stats.total > 0 && (
                      <div className="flex items-center gap-2 mt-1.5">
                        <Progress value={stats.progress} className="h-1.5 flex-1" />
                        <span className="text-xs font-medium">{stats.progress}%</span>
                      </div>
                    )}
                  </div>
                  {canManage && (
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setEditing({ parent_domain_id: d.id, parent_domain_name: d.name, status: 'active' }); setDialogOpen(true); }}>+ תת-תחום</Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditing(d); setDialogOpen(true); }}><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => handleDelete(d)}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  )}
                </div>
                {isExpanded && subs.length > 0 && (
                  <div className="mt-2 space-y-1 pr-6">
                    {subs.map(sub => {
                      const subStats = getDomainStats(sub.name);
                      return (
                        <div key={sub.id} className="flex items-center gap-2 py-1.5 border-t border-border/30">
                          <span className="text-sm text-muted-foreground">↳</span>
                          <span className="text-sm flex-1">{sub.name}</span>
                          {subStats.total > 0 && <span className="text-xs text-muted-foreground">{subStats.total} משימות</span>}
                          <span className={cn('text-xs px-1.5 py-0.5 rounded', DOMAIN_STATUS_COLORS[sub.status])}>{DOMAIN_STATUS_LABELS[sub.status]}</span>
                          {canManage && (
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setEditing(sub); setDialogOpen(true); }}><Pencil className="w-3 h-3" /></Button>
                              <Button variant="ghost" size="icon" className="h-6 w-6 text-red-500" onClick={() => handleDelete(sub)}><Trash2 className="w-3 h-3" /></Button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
        {topLevel.length === 0 && <div className="text-center py-12 text-muted-foreground">אין תחומים{canManage ? ' — הוסיפי תחומים או השתמשי בתחומי ברירת מחדל' : ''}</div>}
      </div>

      <DomainDialog open={dialogOpen} onOpenChange={setDialogOpen} initialData={editing} parentDomains={topLevel} onSave={handleSave} />
    </div>
  );
}