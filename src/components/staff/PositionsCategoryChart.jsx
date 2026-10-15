import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { EMPLOYER_TYPE_LABELS, positionTotalPct, formatFte, pctToHours } from '@/lib/staffUtils';

// Fixed categorical order/colors (validated: node scripts/validate_palette.js
// "#2a78d6,#008300,#e87ba4" --mode light — passes, magenta slot needs the
// direct % labels below per the contrast WARN). "לא מוגדר" (no category set)
// is a separate muted-gray bucket, not a 4th identity color, since it means
// "no answer" rather than a real category.
const CATEGORY_COLORS = { chakal: '#2a78d6', municipality: '#008300', other: '#e87ba4' };
const UNSET_COLOR = '#898781';

// Recharts positions labels assuming an LTR ambient direction; under this app's
// dir="rtl" layout the inherited CSS `direction` flips what text-anchor
// start/end resolve to, clipping the label off the wrong side. Rendering an
// explicit <text> with direction: ltr locked in sidesteps that inheritance.
const RADIAN = Math.PI / 180;
const renderLabel = ({ cx, cy, midAngle, outerRadius, percent }) => {
  const radius = outerRadius + 18;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central" style={{ direction: 'ltr' }} className="fill-muted-foreground text-xs">
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

export default function PositionsCategoryChart({ positions }) {
  // במשרות מלאות (100% = 40 ש'), לא במספר שורות תקן — שני תקנים של 50% הם
  // משרה אחת
  const counts = { chakal: 0, municipality: 0, other: 0 };
  let unset = 0;
  positions.forEach(p => {
    const fte = positionTotalPct(p) / 100;
    const cats = p.category || [];
    if (cats.length === 0) { unset += fte; return; }
    cats.forEach(c => { if (counts[c] !== undefined) counts[c] += fte; });
  });

  const data = [
    ...Object.entries(counts).filter(([, v]) => v > 0).map(([k, v]) => ({ name: EMPLOYER_TYPE_LABELS[k], value: v, color: CATEGORY_COLORS[k] })),
    ...(unset > 0 ? [{ name: 'לא מוגדר', value: unset, color: UNSET_COLOR }] : []),
  ];

  if (data.length === 0) {
    return (
      <div className="bg-card border border-border rounded-2xl p-5">
        <h3 className="font-bold text-sm text-muted-foreground mb-4">תקנים לפי קטגוריה</h3>
        <p className="text-center text-sm text-muted-foreground py-8">אין תקנים להצגה</p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <h3 className="font-bold text-sm text-muted-foreground mb-1">תקנים לפי קטגוריה</h3>
      <p className="text-xs text-muted-foreground mb-3">תקן עם יותר ממקור אחד נספר בכל קטגוריה שסומנה לו</p>
      <ResponsiveContainer width="100%" height={260}>
        <PieChart margin={{ top: 20, bottom: 20, left: 40, right: 40 }}>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} label={renderLabel} labelLine={false}>
            {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
          </Pie>
          <Tooltip formatter={(v) => `${formatFte(v * 100)} · ${pctToHours(v * 100)} ש'`} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
