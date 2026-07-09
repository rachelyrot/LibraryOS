import { CheckCircle2, Star } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function QuoteComparison({ grouped, onSelect, getLabel }) {
  if (!grouped || grouped.length < 2) return null;

  const bestPrice = Math.min(...grouped.map(q => q.total_amount || 0));

  return (
    <div className="border-2 border-amber-200 bg-amber-50/50 rounded-2xl overflow-hidden">
      <div className="bg-amber-100 px-4 py-2.5 flex items-center gap-2">
        <Star className="w-4 h-4 text-amber-600" />
        <span className="text-sm font-bold text-amber-800">השוואת הצעות – {grouped[0].request_title}</span>
        <span className="text-xs text-amber-600 mr-auto">{grouped.length} הצעות</span>
      </div>

      <div className="p-3 overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-amber-200">
              <th className="text-right p-2 font-semibold text-amber-800">ספק</th>
              <th className="text-right p-2 font-semibold text-amber-800">מחיר</th>
              <th className="text-right p-2 font-semibold text-amber-800 hidden md:table-cell">תוקף</th>
              <th className="text-right p-2 font-semibold text-amber-800 hidden md:table-cell">הערות</th>
              <th className="text-center p-2 font-semibold text-amber-800">נבחרה</th>
            </tr>
          </thead>
          <tbody>
            {grouped.map(q => {
              const isBest = q.total_amount === bestPrice && q.total_amount > 0;
              const isSelected = q.selected;
              return (
                <tr key={q.id} className={cn(
                  "border-b border-amber-100 transition-colors",
                  isSelected && "bg-green-50",
                  isBest && !isSelected && "bg-amber-50"
                )}>
                  <td className="p-2">
                    <span className="font-medium">{q.supplier_name}</span>
                    {q.quote_number && <span className="text-muted-foreground mr-2 font-mono">{q.quote_number}</span>}
                  </td>
                  <td className="p-2">
                    <span className={cn("font-bold", isBest && "text-green-600")}>
                      ₪{(q.total_amount || 0).toLocaleString('he-IL')}
                    </span>
                    {isBest && <CheckCircle2 className="w-3 h-3 inline mr-1 text-green-500" />}
                  </td>
                  <td className="p-2 hidden md:table-cell">
                    {q.validity_date ? new Date(q.validity_date).toLocaleDateString('he-IL') : '–'}
                  </td>
                  <td className="p-2 hidden md:table-cell max-w-[150px] truncate text-muted-foreground">
                    {q.notes || '–'}
                  </td>
                  <td className="p-2 text-center">
                    <button
                      onClick={() => onSelect(q)}
                      className={cn(
                        "inline-flex items-center justify-center w-7 h-7 rounded-full transition-all",
                        isSelected
                          ? "bg-green-500 text-white"
                          : "bg-muted text-muted-foreground hover:bg-green-200 hover:text-green-700"
                      )}
                      title={isSelected ? "ההצעה שנבחרה" : "בחר הצעה זו"}
                    >
                      {isSelected ? <CheckCircle2 className="w-4 h-4" /> : <CheckCircle2 className="w-3.5 h-3.5 opacity-40" />}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}