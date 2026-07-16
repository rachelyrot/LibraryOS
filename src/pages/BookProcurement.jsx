import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useSearchParams } from 'react-router-dom';
import { Plus, Search, BookMarked, Trash2, Pencil, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';
import { toast } from 'sonner';
import BookListForm from '@/components/bookLists/BookListForm';
import BookProcurementDetail from '@/components/bookProcurement/BookProcurementDetail';
import useCategories from '@/hooks/useCategories';
import { canDeleteMasterData, canEditBookList, canArchiveBookList } from '@/lib/permissions';
import { cn } from '@/lib/utils';

const STAGES = ['רשימה', 'בקשת מחיר', 'הצעות', 'השוואה', 'הזמנות'];

function getProcessStage(quoteReq) {
  if (!quoteReq) return 0;
  const s = quoteReq.status;
  if (s === 'draft' || s === 'sent_to_suppliers' || s === 'awaiting_quotes') return 1;
  if (s === 'partial_quotes' || s === 'all_quotes_received') return 2;
  if (s === 'in_comparison' || s === 'suppliers_selected') return 3;
  if (s === 'transferred_to_orders' || s === 'closed') return 4;
  return 0;
}

function FlowStage({ stage }) {
  return (
    <div className="flex items-center gap-0.5">
      {STAGES.map((_, i) => (
        <div key={i} className="flex items-center gap-0.5">
          <div className={cn('w-2 h-2 rounded-full transition-colors', i <= stage ? 'bg-primary' : 'bg-border')} />
          {i < STAGES.length - 1 && <div className={cn('w-3 h-0.5', i < stage ? 'bg-primary' : 'bg-border')} />}
        </div>
      ))}
    </div>
  );
}

const STATUS_FILTER_LABELS = { received: 'התקבל', in_review: 'בבדיקה' };

export default function BookProcurement() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [lists, setLists] = useState([]);
  const [quoteReqs, setQuoteReqs] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStage, setFilterStage] = useState('');
  const statusParam = searchParams.get('status');
  const statusSet = statusParam ? statusParam.split(',') : null;
  const [detailList, setDetailList] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [user, setUser] = useState(null);
  const { mains: bookCats, getLabel: getBookCatLabel } = useCategories();

  const canArchive = canArchiveBookList(user);

  const load = async () => {
    const [data, quoteData, sups] = await Promise.all([
      base44.entities.SupplierBookList.list('-created_date', 200),
      base44.entities.BookQuoteRequest.list('-created_date', 200),
      base44.entities.Supplier.list('name', 500),
    ]);
    setLists(data);
    setQuoteReqs(quoteData);
    setSuppliers(sups.filter(s => (s.type === 'ספרים' || s.type === 'books') && s.status === 'active'));
    setLoading(false);
  };

  useEffect(() => { load(); base44.auth.me().then(setUser).catch(() => {}); }, []);

  const handleSave = async (form) => {
    if (editing) { await base44.entities.SupplierBookList.update(editing.id, form); toast.success('הרשימה עודכנה!'); }
    else { await base44.entities.SupplierBookList.create(form); toast.success('רשימה חדשה נוצרה!'); }
    setFormOpen(false); setEditing(null); load();
  };

  const handleDelete = async (list) => {
    if (!list?.id) return;
    if (!canArchive) { toast.error('אין לך הרשאה למחוק רשימת ספרים'); return; }
    try { await base44.entities.SupplierBookList.delete(list.id); setLists(prev => prev.filter(l => l.id !== list.id)); toast.success('הרשימה נמחקה'); }
    catch (e) { toast.error('לא ניתן למחוק את הרשימה'); load(); }
  };

  const getQuoteReq = (list) => quoteReqs.find(q => q.id === list.linked_quote_request_id);

  const filtered = lists.filter(l => {
    if (search && !l.title?.includes(search) && !l.supplier_name?.includes(search)) return false;
    if (filterStage && filterStage !== '__all__') {
      const stage = getProcessStage(getQuoteReq(l));
      if (String(stage) !== filterStage) return false;
    }
    if (statusSet && !statusSet.includes(l.status)) return false;
    return true;
  });

  const clearStatusFilter = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('status');
    setSearchParams(next);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto animate-fade-in">
      <PageHeader
        title="רכש ספרים"
        subtitle={`${lists.length} תהליכים · רשימת ספרים ← בקשת מחיר ← הצעות ← השוואה ← הזמנה`}
        gradient="from-pink-400 to-indigo-500"
        actions={
          <Button onClick={() => { setEditing(null); setFormOpen(true); }} className="gap-2 bg-gradient-to-l from-pink-400 to-indigo-500 text-white border-0 hover:opacity-90">
            <Plus className="w-4 h-4" /> רשימת ספרים חדשה
          </Button>
        }
      />

      {statusSet && (
        <div className="flex items-center gap-2 bg-pink-50 border border-pink-200 text-pink-700 rounded-xl px-3 py-2 mb-3 text-sm w-fit">
          <span>מציג רשימות: {statusSet.map(s => STATUS_FILTER_LABELS[s] || s).join(', ')}</span>
          <button onClick={clearStatusFilter} className="hover:text-pink-900"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      <div className="flex flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="חיפוש לפי שם רשימה או ספק..." className="pr-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={filterStage} onValueChange={setFilterStage}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="כל השלבים" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">כל השלבים</SelectItem>
            <SelectItem value="0">1. רשימת ספרים</SelectItem>
            <SelectItem value="1">2. בקשת מחיר</SelectItem>
            <SelectItem value="2">3. הצעות התקבלו</SelectItem>
            <SelectItem value="3">4. השוואת מחירים</SelectItem>
            <SelectItem value="4">5. הזמנות רכש</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <BookMarked className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>אין תהליכי רכש ספרים</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-right p-3 font-medium text-muted-foreground">שם רשימה</th>
                  <th className="text-right p-3 font-medium text-muted-foreground hidden md:table-cell">ספק</th>
                  <th className="text-center p-3 font-medium text-muted-foreground">ספרים</th>
                  <th className="text-center p-3 font-medium text-muted-foreground">שלב התהליך</th>
                  <th className="text-center p-3 font-medium text-muted-foreground hidden md:table-cell">סטטוס בקשה</th>
                  <th className="text-center p-3 font-medium text-muted-foreground hidden lg:table-cell">הזמנות</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(list => {
                  const qr = getQuoteReq(list);
                  const stage = getProcessStage(qr);
                  const bookCount = (list.books || []).length;
                  const orderCount = (qr?.linked_order_ids || []).length;
                  return (
                    <tr key={list.id} className="border-b border-border/50 hover:bg-pink-50/30 transition-colors cursor-pointer" onClick={() => setDetailList(list)}>
                      <td className="p-3">
                        <p className="font-semibold text-foreground">{list.title}</p>
                        {list.category && <span className="text-xs text-muted-foreground">{getBookCatLabel(list.category)}</span>}
                      </td>
                      <td className="p-3 text-muted-foreground hidden md:table-cell">{list.supplier_name || 'רשימה פנימית'}</td>
                      <td className="p-3 text-center font-medium">{bookCount}</td>
                      <td className="p-3">
                        <div className="flex flex-col items-center gap-1">
                          <FlowStage stage={stage} />
                          <span className="text-xs text-muted-foreground">{STAGES[stage]}</span>
                        </div>
                      </td>
                      <td className="p-3 text-center hidden md:table-cell">
                        {qr ? <StatusBadge status={qr.status} entityType="BookQuoteRequest" /> : <span className="text-xs text-muted-foreground">טרם נוצרה</span>}
                      </td>
                      <td className="p-3 text-center hidden lg:table-cell">
                        {orderCount > 0 ? <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">{orderCount} הזמנות</span> : <span className="text-xs text-muted-foreground">-</span>}
                      </td>
                      <td className="p-3">
                        {(canEditBookList(user, list) || canArchive) && (
                          <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                            {canEditBookList(user, list) && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditing(list); setFormOpen(true); }}><Pencil className="w-4 h-4" /></Button>}
                            {canArchive && <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:text-red-500" onClick={() => handleDelete(list)}><Trash2 className="w-4 h-4" /></Button>}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <BookListForm open={formOpen} onOpenChange={setFormOpen} editing={editing} suppliers={suppliers} onSave={handleSave} />
      <BookProcurementDetail bookList={detailList} onClose={() => { setDetailList(null); load(); }} onRefresh={load} />
    </div>
  );
}