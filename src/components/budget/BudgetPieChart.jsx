import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const renderLabel = ({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`;

export default function BudgetPieChart({ categories }) {
  const data = categories.map(c => ({
    name: c.name,
    value: c.allocated_amount || 0,
    spent: c.spent_amount || 0,
    color: c.color || '#14b8a6',
  }));

  return (
    <div className="grid md:grid-cols-2 gap-6">
      {/* הקצאה */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <h3 className="font-bold text-sm text-muted-foreground mb-4">הקצאת תקציב לפי קטגוריה</h3>
        <ResponsiveContainer width="100%" height={240}>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={renderLabel} labelLine={false}>
              {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
            </Pie>
            <Tooltip formatter={(v) => `₪${v.toLocaleString('he-IL')}`} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      {/* ניצול */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <h3 className="font-bold text-sm text-muted-foreground mb-4">ניצול בפועל לפי קטגוריה</h3>
        <ResponsiveContainer width="100%" height={240}>
          <PieChart>
            <Pie data={data.filter(d => d.spent > 0)} dataKey="spent" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={renderLabel} labelLine={false}>
              {data.map((entry, i) => <Cell key={i} fill={entry.color} opacity={0.8} />)}
            </Pie>
            <Tooltip formatter={(v) => `₪${v.toLocaleString('he-IL')}`} />
          </PieChart>
        </ResponsiveContainer>
        {data.every(d => d.spent === 0) && (
          <p className="text-center text-sm text-muted-foreground mt-2">טרם נרשמו הוצאות</p>
        )}
      </div>
    </div>
  );
}