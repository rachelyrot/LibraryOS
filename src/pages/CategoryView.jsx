import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { ArrowRight, ShoppingCart, FileText } from 'lucide-react';
import StatusBadge from '@/components/StatusBadge';
import PageHeader from '@/components/PageHeader';
import { CATEGORIES, SUBCATEGORIES, getCategoryLabel } from '@/lib/orderCategories';
import { motion } from 'framer-motion';

export default function CategoryView() {
  const { category } = useParams();
  const [orders, setOrders] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('orders');

  const categoryLabel = getCategoryLabel(category);

  useEffect(() => {
    Promise.all([
      base44.entities.PurchaseOrder.filter({ category }, '-created_date', 100),
      base44.entities.QuoteRequest.filter({ category }, '-created_date', 100),
    ]).then(([o, q]) => {
      setOrders(o);
      setQuotes(q);
      setLoading(false);
    });
  }, [category]);

  const subcats = SUBCATEGORIES[category] || [];

  return (
    <div className="p-6 max-w-5xl mx-auto animate-fade-in">
      <div className="flex items-center gap-3 mb-6">
        <Link to="/categories" className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowRight className="w-5 h-5" />
        </Link>
        <PageHeader
          title={categoryLabel}
          subtitle={`${orders.length} הזמנות · ${quotes.length} הצעות מחיר`}
          gradient="from-blue-500 to-purple-500"
        />
      </div>

      {/* Subcategory chips */}
      {subcats.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-5">
          {subcats.map(s => {
            const oCount = orders.filter(o => o.subcategory === s).length;
            const qCount = quotes.filter(q => q.subcategory === s).length;
            if (oCount + qCount === 0) return null;
            return (
              <span key={s} className="px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
                {s} ({oCount + qCount})
              </span>
            );
          })}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-muted p-1 rounded-xl w-fit">
        {[
          { key: 'orders', label: `הזמנות (${orders.length})`, icon: ShoppingCart },
          { key: 'quotes', label: `הצעות מחיר (${quotes.length})`, icon: FileText },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === key ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" /></div>
      ) : tab === 'orders' ? (
        orders.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground"><ShoppingCart className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>אין הזמנות בקטגוריה זו</p></div>
        ) : (
          <div className="space-y-2">
            {orders.map(order => (
              <motion.div key={order.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <Link to={`/orders/${order.id}`}
                  className="flex items-center gap-4 bg-card border border-border rounded-2xl px-5 py-4 hover:border-primary/40 hover:shadow-sm transition-all group">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {order.subcategory && <span className="text-xs bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full">{order.subcategory}</span>}
                      <span className="font-semibold text-foreground group-hover:text-primary transition-colors">{order.title || order.supplier_name}</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">{order.supplier_name}</p>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    {order.total_amount && <span className="font-bold">₪{order.total_amount.toLocaleString('he-IL')}</span>}
                    <StatusBadge status={order.status} />
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        )
      ) : (
        quotes.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground"><FileText className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>אין הצעות מחיר בקטגוריה זו</p></div>
        ) : (
          <div className="space-y-2">
            {quotes.map(q => (
              <motion.div key={q.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="flex items-center gap-4 bg-card border border-border rounded-2xl px-5 py-4 hover:border-teal-300 hover:shadow-sm transition-all cursor-pointer">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-100 to-blue-100 flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5 text-teal-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {q.subcategory && <span className="text-xs bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full">{q.subcategory}</span>}
                    <span className="font-semibold text-foreground">{q.title}</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">{q.supplier_name}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {q.total_amount && <span className="font-bold">₪{Number(q.total_amount).toLocaleString('he-IL')}</span>}
                  <StatusBadge status={q.status} />
                  {q.file_url && <a href={q.file_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-xs text-blue-500 underline">קובץ</a>}
                </div>
              </motion.div>
            ))}
          </div>
        )
      )}
    </div>
  );
}