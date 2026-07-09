import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { Plus, Search, ShoppingCart, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import StatusBadge from '@/components/StatusBadge';
import PageHeader from '@/components/PageHeader';

import useCategories from '@/hooks/useCategories';
const STATUS_OPTIONS = [
  { value: '', label: 'כל הסטטוסים' },
  { value: 'draft', label: 'טיוטה' },
  { value: 'pending_approval', label: 'ממתין לאישור' },
  { value: 'approved', label: 'אושר' },
  { value: 'ordered', label: 'הוזמן' },
  { value: 'received_full', label: 'התקבל במלואו' },
  { value: 'received_partial', label: 'התקבל חלקית' },
  { value: 'cancelled', label: 'בוטל' },
];

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const { getLabel } = useCategories();

  useEffect(() => {
    base44.entities.PurchaseOrder.list('-created_date', 100).then(data => {
      setOrders(data);
      setLoading(false);
    });
  }, []);

  const filtered = orders.filter(o => {
    const matchSearch = !search || o.title?.includes(search) || o.supplier_name?.includes(search) || getLabel(o.category)?.includes(search) || o.subcategory?.includes(search);
    const matchStatus = !statusFilter || o.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div className="p-6 max-w-6xl mx-auto animate-fade-in">
      <PageHeader
        title="הזמנות רכש"
        subtitle={`${orders.length} הזמנות סה״כ`}
        gradient="from-blue-500 to-purple-500"
        actions={
          <Link to="/orders/new">
            <Button className="gap-2 bg-gradient-to-l from-blue-500 to-purple-500 hover:opacity-90 text-white border-0">
              <Plus className="w-4 h-4" /> + הזמנה חדשה
            </Button>
          </Link>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="חיפוש לפי כותרת או ספק..." className="pr-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-2 flex-wrap">
          {STATUS_OPTIONS.map(s => (
            <button
              key={s.value}
              onClick={() => setStatusFilter(s.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${statusFilter === s.value ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-muted text-muted-foreground hover:bg-secondary'}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <ShoppingCart className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>אין הזמנות תואמות</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(order => (
            <Link key={order.id} to={`/orders/${order.id}`}
              className="flex items-center gap-4 bg-card border border-border rounded-2xl px-5 py-4 hover:border-primary/40 hover:shadow-sm transition-all group">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {order.category && <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">{getLabel(order.category)}</span>}
                  {order.subcategory && <span className="text-xs bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full">{order.subcategory}</span>}
                  {order.source_quote_id && <Link to="/quotes" onClick={e => e.stopPropagation()} className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full flex items-center gap-1 hover:bg-purple-200 transition-colors"><FileText className="w-3 h-3" /> מקור: הצעת מחיר</Link>}
                  {order.title && <span className="font-semibold text-foreground group-hover:text-primary transition-colors">{order.title}</span>}
                  {!order.category && !order.title && <span className="font-semibold text-foreground">{order.supplier_name}</span>}
                </div>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-sm text-muted-foreground">{order.supplier_name}</span>
                  {order.requested_by && <span className="text-xs text-muted-foreground">· בקשה: {order.requested_by}</span>}
                </div>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                {order.total_amount && <span className="font-bold text-foreground">₪{order.total_amount.toLocaleString('he-IL')}</span>}
                <StatusBadge status={order.status} entityType="PurchaseOrder" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}