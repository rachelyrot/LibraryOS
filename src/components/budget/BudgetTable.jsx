import { useState } from 'react';
import { ChevronDown, ChevronUp, Pencil, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

function ProgressBar({ value, max, color }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-2 bg-muted rounded-full overflow-hidden w-full">
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color || '#14b8a6' }} />
    </div>
  );
}

export default function BudgetTable({ categories, onEdit, onAddExpense, canEdit }) {
  const [expanded, setExpanded] = useState(null);

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr className="text-right">
            <th className="px-4 py-3 font-semibold text-muted-foreground">קטגוריה</th>
            <th className="px-4 py-3 font-semibold text-muted-foreground">מוקצה</th>
            <th className="px-4 py-3 font-semibold text-muted-foreground">נוצל</th>
            <th className="px-4 py-3 font-semibold text-muted-foreground">יתרה</th>
            <th className="px-4 py-3 font-semibold text-muted-foreground w-40">ניצול</th>
            <th className="px-4 py-3 w-24" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {categories.map(cat => {
            const spent = cat.spent_amount || 0;
            const allocated = cat.allocated_amount || 0;
            const remaining = Math.max(0, allocated - spent);
            const pct = allocated > 0 ? Math.min(100, (spent / allocated) * 100) : 0;
            const isOpen = expanded === cat.id;

            return (
              <>
                <tr key={cat.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: cat.color || '#14b8a6' }} />
                      <div>
                        <span className="font-medium">{cat.name}</span>
                        {cat.supplier_name && <p className="text-xs text-muted-foreground">{cat.supplier_name}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-medium">₪{allocated.toLocaleString('he-IL')}</td>
                  <td className="px-4 py-3">
                    <span className={cn('font-medium', pct > 90 ? 'text-red-500' : pct > 70 ? 'text-amber-500' : 'text-foreground')}>
                      ₪{spent.toLocaleString('he-IL')}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-bold text-teal-600">₪{remaining.toLocaleString('he-IL')}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <ProgressBar value={spent} max={allocated} color={cat.color} />
                      <span className="text-xs text-muted-foreground w-10 shrink-0">{pct.toFixed(0)}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      {canEdit && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(cat)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onAddExpense(cat)}>
                        <Plus className="w-3.5 h-3.5 text-teal-600" />
                      </Button>
                      {(cat.transactions || []).length > 0 && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setExpanded(isOpen ? null : cat.id)}>
                          {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
                {isOpen && (
                  <tr key={`${cat.id}-tx`}>
                    <td colSpan={6} className="px-4 py-2 bg-muted/20">
                      <div className="space-y-1.5 py-1">
                        {(cat.transactions || []).map((tx, i) => (
                          <div key={i} className="flex justify-between text-xs text-muted-foreground px-2">
                            <span>{tx.date}</span>
                            <span className="flex-1 px-4">{tx.supplier_name && <span className="font-medium text-foreground">{tx.supplier_name} — </span>}{tx.description}</span>
                            <span className="font-semibold text-red-500">-₪{(tx.amount || 0).toLocaleString('he-IL')}</span>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}