import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { BookOpen, Scissors, Monitor, Sofa, MoreHorizontal } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { CATEGORIES } from '@/lib/orderCategories';
import { motion } from 'framer-motion';

const CATEGORY_ICONS = {
  books: BookOpen,
  book_supplies: Scissors,
  equipment: Monitor,
  furniture: Sofa,
  other: MoreHorizontal,
};

const CATEGORY_COLORS = {
  books: 'from-blue-400 to-indigo-500',
  book_supplies: 'from-teal-400 to-cyan-500',
  equipment: 'from-purple-400 to-violet-500',
  furniture: 'from-orange-400 to-amber-500',
  other: 'from-gray-400 to-slate-500',
};

export default function Categories() {
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      base44.entities.PurchaseOrder.list('-created_date', 200),
      base44.entities.QuoteRequest.list('-created_date', 200),
    ]).then(([orders, quotes]) => {
      const s = {};
      CATEGORIES.forEach(c => {
        s[c.value] = {
          orders: orders.filter(o => o.category === c.value).length,
          quotes: quotes.filter(q => q.category === c.value).length,
          total: orders.filter(o => o.category === c.value).reduce((sum, o) => sum + (o.total_amount || 0), 0),
        };
      });
      setStats(s);
      setLoading(false);
    });
  }, []);

  return (
    <div className="p-6 max-w-5xl mx-auto animate-fade-in">
      <PageHeader
        title="תחומים"
        subtitle="הצג הזמנות והצעות מחיר לפי תחום"
        gradient="from-violet-500 to-blue-500"
      />

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" /></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {CATEGORIES.map((cat, i) => {
            const Icon = CATEGORY_ICONS[cat.value] || MoreHorizontal;
            const gradient = CATEGORY_COLORS[cat.value];
            const s = stats[cat.value] || { orders: 0, quotes: 0, total: 0 };
            return (
              <motion.div key={cat.value} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
                <Link to={`/categories/${cat.value}`}
                  className="block bg-card border border-border rounded-2xl p-5 hover:shadow-md hover:border-primary/30 transition-all group">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center mb-4`}>
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="font-bold text-lg text-foreground group-hover:text-primary transition-colors mb-1">{cat.label}</h3>
                  <div className="flex gap-3 text-sm text-muted-foreground mb-3">
                    <span>{s.orders} הזמנות</span>
                    <span>·</span>
                    <span>{s.quotes} הצעות מחיר</span>
                  </div>
                  {s.total > 0 && (
                    <div className="text-sm font-semibold text-foreground">₪{s.total.toLocaleString('he-IL')} <span className="font-normal text-muted-foreground">סה״כ הוזמן</span></div>
                  )}
                </Link>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}