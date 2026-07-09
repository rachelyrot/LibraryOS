import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Wallet, ShoppingCart, TrendingDown, TrendingUp, CheckCircle, FileText, Download } from 'lucide-react';
import { Link } from 'react-router-dom';
import StatusBadge from '@/components/StatusBadge';
import { formatCurrency, formatDate } from '@/lib/projectUtils';
import { canViewProjectBudget, canManageProjectBudget } from '@/lib/permissions';
import { cn } from '@/lib/utils';

export default function BudgetTab({ project, user, purchaseOrders, credits }) {
  const canViewBudget = canViewProjectBudget(user);
  const canManageBudget = canManageProjectBudget(user);
  const planned = project.budget_planned || 0;
  const approved = project.budget_approved || 0;
  const used = project.budget_used || 0;
  const remaining = approved - used;
  const utilization = approved > 0 ? Math.round((used / approved) * 100) : 0;
  const poTotal = purchaseOrders.reduce((s, po) => s + (po.total_amount || 0), 0);

  if (!canViewBudget) {
    return <div className="text-center py-12 text-muted-foreground">אין הרשאה לצפות בתקציב הפרויקט</div>;
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">תקציב פרויקט</h3>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-blue-500 mb-1"><Wallet className="w-4 h-4" /><span className="text-xs text-muted-foreground">תקציב מתוכנן</span></div>
            <p className="text-xl font-bold">{formatCurrency(planned)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-purple-500 mb-1"><TrendingUp className="w-4 h-4" /><span className="text-xs text-muted-foreground">תקציב מאושר</span></div>
            <p className="text-xl font-bold">{formatCurrency(approved)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-red-500 mb-1"><TrendingDown className="w-4 h-4" /><span className="text-xs text-muted-foreground">תקציב מנוצל</span></div>
            <p className="text-xl font-bold">{formatCurrency(used)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-green-500 mb-1"><Wallet className="w-4 h-4" /><span className="text-xs text-muted-foreground">יתרה</span></div>
            <p className="text-xl font-bold">{formatCurrency(remaining)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">ניצול תקציב</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Progress value={utilization} className="h-3 flex-1" />
            <span className="text-lg font-bold">{utilization}%</span>
          </div>
          {project.budget_source_name && <p className="text-sm text-muted-foreground mt-2">מקור תקציב: {project.budget_source_name}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><CheckCircle className="w-4 h-4" /> אישור תקציב</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">סטטוס אישור</span>
            <span className={cn('font-medium px-2 py-0.5 rounded text-xs', project.budget_is_approved ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700')}>
              {project.budget_is_approved ? 'מאושר' : 'לא מאושר'}
            </span>
          </div>
          {project.budget_approver && <div className="flex justify-between"><span className="text-muted-foreground">גורם מאשר</span><span>{project.budget_approver}</span></div>}
          {project.budget_approval_date && <div className="flex justify-between"><span className="text-muted-foreground">תאריך אישור</span><span>{formatDate(project.budget_approval_date)}</span></div>}
          {project.budget_approval_file_url && (
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">קובץ אישור</span>
              <a href={project.budget_approval_file_url} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm" className="h-7 gap-1 text-xs"><Download className="w-3 h-3" /> צפייה</Button>
              </a>
            </div>
          )}
          {canManageBudget && !project.budget_is_approved && (
            <p className="text-xs text-amber-600 mt-2">ניתן לעדכן אישור תקציב בעריכת הפרויקט</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <ShoppingCart className="w-4 h-4" /> הזמנות רכש קשורות ({purchaseOrders.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {purchaseOrders.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground text-sm">אין הזמנות רכש משויכות לפרויקט זה</p>
          ) : (
            <div className="border border-border rounded-xl overflow-auto max-h-[40vh]">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0">
                  <tr className="border-b border-border">
                    <th className="text-right p-2 font-medium">מספר הזמנה</th>
                    <th className="text-right p-2 font-medium">ספק</th>
                    <th className="text-center p-2 font-medium">סכום</th>
                    <th className="text-center p-2 font-medium">סטטוס</th>
                    <th className="text-center p-2 font-medium hidden md:table-cell">תאריך קבלה</th>
                  </tr>
                </thead>
                <tbody>
                  {purchaseOrders.map(po => (
                    <tr key={po.id} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="p-2"><Link to={`/orders/${po.id}`} className="text-primary hover:underline">{po.order_number || po.title || 'הזמנה'}</Link></td>
                      <td className="p-2">{po.supplier_name || '-'}</td>
                      <td className="p-2 text-center font-medium">{formatCurrency(po.total_amount)}</td>
                      <td className="p-2 text-center"><StatusBadge entity="PurchaseOrder" status={po.status} /></td>
                      <td className="p-2 text-center hidden md:table-cell text-xs">{formatDate(po.received_date)}</td>
                    </tr>
                  ))}
                  <tr className="bg-muted/30 font-medium">
                    <td className="p-2" colSpan={2}>סה"כ הזמנות רכש</td>
                    <td className="p-2 text-center">{formatCurrency(poTotal)}</td>
                    <td colSpan={2}></td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {credits && credits.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">זיכויים קשורים ({credits.length})</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {credits.map(c => (
                <div key={c.id} className="flex justify-between items-center text-sm border-b border-border/50 pb-1">
                  <span>{c.supplier_name}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-muted-foreground">יתרה: {formatCurrency(c.remaining_amount)}</span>
                    <span className={cn('text-xs px-2 py-0.5 rounded', c.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700')}>{c.status === 'active' ? 'פעיל' : c.status}</span>
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