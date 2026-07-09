import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell } from 'recharts';

export default function BudgetBarChart({ categories }) {
  const data = categories.map(c => ({
    name: c.name,
    'מוקצה': c.allocated_amount || 0,
    'נוצל': c.spent_amount || 0,
    'יתרה': Math.max(0, (c.allocated_amount || 0) - (c.spent_amount || 0)),
    color: c.color || '#14b8a6',
  }));

  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <h3 className="font-bold text-sm text-muted-foreground mb-4">השוואת מוקצה מול נוצל לפי קטגוריה</h3>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="name" tick={{ fontSize: 12, fontFamily: 'Heebo' }} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₪${(v / 1000).toFixed(0)}k`} />
          <Tooltip formatter={(v, name) => [`₪${v.toLocaleString('he-IL')}`, name]} />
          <Legend />
          <Bar dataKey="מוקצה" fill="#cbd5e1" radius={[6, 6, 0, 0]} />
          <Bar dataKey="נוצל" radius={[6, 6, 0, 0]}>
            {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}