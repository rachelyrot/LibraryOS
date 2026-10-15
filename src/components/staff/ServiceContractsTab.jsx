import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Plus, Pencil, Trash2, Phone, Users, AlertTriangle, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { WEEKDAY_LABELS, calcShiftHours, formatDate } from '@/lib/staffUtils';
import { canManageServiceContracts, canViewSensitiveBudgetData } from '@/lib/permissions';
import ServiceContractDialog from './ServiceContractDialog';

/**
 * לשונית אבטחה / ניקיון: חברות חיצוניות לפי סניף (מיגרציה 0018). אותה לשונית
 * לשני השירותים, לפי serviceType. העובדים של החברה לא נספרים בתקני הספרייה.
 */
const daysLabel = (days = []) => {
  if (days.length === 0) return 'לא נקבעו ימים';
  const sorted = [...days].sort();
  const contiguous = sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1);
  return contiguous && sorted.length > 2
    ? `${WEEKDAY_LABELS[sorted[0]]}–${WEEKDAY_LABELS[sorted[sorted.length - 1]]}`
    : sorted.map(d => WEEKDAY_LABELS[d]).join(', ');
};
const weeklyHours = (c) => Math.round(calcShiftHours(c.start_time, c.end_time) * (c.days || []).length * 10) / 10;
const daysUntil = (date) => (date ? Math.ceil((new Date(`${date}T00:00:00`) - new Date()) / 86400000) : null);

export default function ServiceContractsTab({ user, branches, serviceType, serviceLabel, icon: Icon }) {
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const canManage = canManageServiceContracts(user);
  const showCost = canViewSensitiveBudgetData(user);

  const load = () => base44.entities.ServiceContract.filter({ service_type: serviceType }, 'branch_name', 500)
    .then(setContracts).catch(() => setContracts([])).finally(() => setLoading(false));
  useEffect(() => { load(); }, [serviceType]);

  const branchIds = new Set(branches.map(b => b.id));
  const visible = contracts.filter(c => !c.branch_id || branchIds.has(c.branch_id));
  const active = visible.filter(c => c.status === 'active');
  const covered = new Set(active.map(c => c.branch_id));
  const uncovered = branches.filter(b => b.status !== 'inactive' && !covered.has(b.id));
  const totalCost = active.reduce((s, c) => s + (Number(c.monthly_cost) || 0), 0);
  const expiring = active.filter(c => { const d = daysUntil(c.contract_end); return d != null && d <= 30; });

  const handleSave = async (data) => {
    if (!canManageServiceContracts(user)) { toast.error('אין לך הרשאה'); throw new Error('forbidden'); }
    try {
      if (editing) { await base44.entities.ServiceContract.update(editing.id, data); toast.success('עודכן'); }
      else { await base44.entities.ServiceContract.create({ ...data, service_type: serviceType }); toast.success('נוסף'); }
      setEditing(null); load();
    } catch (e) {
      toast.error(e?.message || 'שגיאה בשמירה');
      throw e;
    }
  };

  const handleDelete = async (c) => {
    if (!canManageServiceContracts(user)) return;
    if (!confirm(`למחוק את "${c.company_name}" בסניף ${c.branch_name || ''}?`)) return;
    try { await base44.entities.ServiceContract.delete(c.id); toast.success('נמחק'); load(); }
    catch (e) { toast.error('שגיאה במחיקה'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold flex items-center gap-2"><Icon className="w-5 h-5 text-muted-foreground" /> {serviceLabel} — חברות חיצוניות</h3>
        {canManage && <Button onClick={() => { setEditing(null); setDialogOpen(true); }} className="gap-2"><Plus className="w-4 h-4" /> חברה חדשה</Button>}
      </div>

      {/* סיכום */}
      <div className={cn('grid gap-3', showCost ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
        <div className="bg-card rounded-xl p-4 border border-border">
          <p className="text-xs text-muted-foreground">סניפים עם {serviceLabel}</p>
          <p className="text-2xl font-bold mt-1">{covered.size} <span className="text-sm font-normal text-muted-foreground">מתוך {branches.length}</span></p>
        </div>
        {showCost && (
          <div className="bg-card rounded-xl p-4 border border-border">
            <p className="text-xs text-muted-foreground">עלות חודשית כוללת</p>
            <p className="text-2xl font-bold mt-1">₪{totalCost.toLocaleString('he-IL')}</p>
          </div>
        )}
        <div className="bg-card rounded-xl p-4 border border-border">
          <p className="text-xs text-muted-foreground">חוזים פעילים</p>
          <p className="text-2xl font-bold mt-1">{active.length}</p>
        </div>
      </div>

      {(uncovered.length > 0 || expiring.length > 0) && !loading && (
        <div className="space-y-2">
          {uncovered.length > 0 && (
            <div className="flex items-start gap-2 text-sm rounded-xl border border-amber-200 bg-amber-50 text-amber-800 px-4 py-2.5">
              <Building2 className="w-4 h-4 mt-0.5 shrink-0" />
              <span>סניפים בלי {serviceLabel}: <b>{uncovered.map(b => b.name).join(', ')}</b></span>
            </div>
          )}
          {expiring.map(c => {
            const d = daysUntil(c.contract_end);
            return (
              <div key={c.id} className="flex items-start gap-2 text-sm rounded-xl border border-red-200 bg-red-50 text-red-800 px-4 py-2.5">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>החוזה עם <b>{c.company_name}</b> ({c.branch_name}) {d < 0 ? `הסתיים לפני ${-d} ימים` : d === 0 ? 'מסתיים היום' : `מסתיים בעוד ${d} ימים`} — {formatDate(c.contract_end)}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* חברה לכל סניף */}
      {loading ? (
        <div className="flex justify-center py-12"><div className="w-7 h-7 border-4 border-primary/30 border-t-primary rounded-full animate-spin" /></div>
      ) : visible.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground border border-dashed border-border rounded-xl">
          <Icon className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p>לא הוזנו עדיין חברות {serviceLabel}</p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {visible.map(c => (
            <div key={c.id} className={cn('bg-card rounded-xl border p-4', c.status === 'active' ? 'border-border' : 'border-border opacity-60')}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs text-muted-foreground">{c.branch_name || 'ללא סניף'}</p>
                  <p className="font-bold">{c.company_name}</p>
                </div>
                <div className="flex items-center gap-1">
                  <span className={cn('text-xs px-2 py-0.5 rounded', c.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600')}>
                    {c.status === 'active' ? 'פעיל' : 'הסתיים'}
                  </span>
                  {canManage && (
                    <>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditing(c); setDialogOpen(true); }}><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => handleDelete(c)}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </>
                  )}
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">ימים ושעות</p>
                  <p>{daysLabel(c.days)}</p>
                  {c.start_time && c.end_time && <p className="text-xs text-muted-foreground" dir="ltr">{c.start_time}–{c.end_time} · {weeklyHours(c)} ש' בשבוע</p>}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">איש קשר</p>
                  <p>{c.contact_name || '-'}</p>
                  {c.contact_phone && <a href={`tel:${c.contact_phone}`} className="text-xs text-primary inline-flex items-center gap-1" dir="ltr"><Phone className="w-3 h-3" />{c.contact_phone}</a>}
                </div>
                {showCost && (
                  <div>
                    <p className="text-xs text-muted-foreground">עלות חודשית</p>
                    <p className="font-semibold">{c.monthly_cost != null ? `₪${Number(c.monthly_cost).toLocaleString('he-IL')}` : '-'}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-muted-foreground">חוזה</p>
                  <p>{c.contract_start || c.contract_end ? `${formatDate(c.contract_start)} – ${formatDate(c.contract_end)}` : '-'}</p>
                </div>
              </div>

              {(c.workers || []).length > 0 && (
                <div className="mt-3 pt-3 border-t border-border">
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1"><Users className="w-3 h-3" /> עובדים ({c.workers.length})</p>
                  <div className="flex flex-wrap gap-1.5">
                    {c.workers.map((w, i) => (
                      <span key={i} className="text-xs bg-muted rounded-full px-2 py-0.5">
                        {w.name}{w.phone && <span className="text-muted-foreground" dir="ltr"> · {w.phone}</span>}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {c.notes && <p className="mt-2 text-xs text-muted-foreground">{c.notes}</p>}
            </div>
          ))}
        </div>
      )}

      <ServiceContractDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initialData={editing}
        branches={branches}
        serviceLabel={serviceLabel}
        showCost={showCost}
        onSave={handleSave}
      />
    </div>
  );
}
