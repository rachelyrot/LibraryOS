import { useEffect, useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download, FileText, ShoppingCart, BookOpen, Wallet, CreditCard, Package, AlertTriangle, Calendar, Building2, Layers, CheckCircle, Clock, XCircle, LayoutDashboard } from 'lucide-react';
import StatusBadge from '@/components/StatusBadge';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import moment from 'moment';
import { canViewBudgets, canViewSensitiveBudgetData, isAdmin } from '@/lib/permissions';
import StaffDashboardCards from '@/components/staff/StaffDashboardCards';
import ProjectsDashboardCards from '@/components/projects/ProjectsDashboardCards';

// Date range presets
const DATE_RANGES = [
  { value: 'all', label: 'כל התקופות' },
  { value: 'month_start', label: 'מתחילת חודש' },
  { value: 'last_month', label: 'חודש קודם' },
  { value: 'quarter', label: 'רבעון נוכחי' },
  { value: 'year', label: 'שנה נוכחית' },
  { value: 'custom', label: 'בחירה ידנית' },
];

const REPORT_TYPES = [
  { value: 'orders', label: 'הזמנות רכש', icon: ShoppingCart },
  { value: 'quotes', label: 'הצעות מחיר', icon: FileText },
  { value: 'budget', label: 'תקציב וניצול', icon: Wallet },
  { value: 'credits', label: 'זיכויי ספקים', icon: CreditCard },
  { value: 'inventory', label: 'מלאי', icon: Package },
  { value: 'booklists', label: 'רשימות ספרים', icon: BookOpen },
];

function StatCard({ label, value, icon: Icon, gradient, sub }) {
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-2xl p-5 shadow-sm border border-border">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-3xl font-bold text-foreground mt-1">{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
        </div>
        <div className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${gradient} flex items-center justify-center shadow-md`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
      </div>
    </motion.div>
  );
}

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeReport, setActiveReport] = useState('orders');

  // Filters
  const [dateRange, setDateRange] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [subcategoryFilter, setSubcategoryFilter] = useState('');
  const [budgetSourceFilter, setBudgetSourceFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Data
  const [orders, setOrders] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [budgetSources, setBudgetSources] = useState([]);
  const [budgetCategories, setBudgetCategories] = useState([]);
  const [supplierCredits, setSupplierCredits] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [bookLists, setBookLists] = useState([]);
  const [suppliers, setSuppliers] = useState([]);

  useEffect(() => {
    const init = async () => {
      const u = await base44.auth.me().catch(() => null);
      setUser(u);

      // Load all data in parallel
      const [ordersData, quotesData, budgetSourcesData, budgetCategoriesData, creditsData, inventoryData, bookListsData, suppliersData] = await Promise.all([
        base44.entities.PurchaseOrder.list('-created_date', 500),
        base44.entities.QuoteRequest.list('-created_date', 500),
        base44.entities.BudgetSource.list('-created_date', 100),
        base44.entities.BudgetAllocation.list('name', 300),
        base44.entities.SupplierCredit.list('-created_date', 100),
        base44.entities.InventoryItem.list('-updated_date', 500),
        base44.entities.SupplierBookList.list('-created_date', 200),
        base44.entities.Supplier.list('name', 500),
      ]);

      setOrders(ordersData);
      setQuotes(quotesData);
      setBudgetSources(budgetSourcesData);
      setBudgetCategories(budgetCategoriesData);
      setSupplierCredits(creditsData);
      setInventoryItems(inventoryData);
      setBookLists(bookListsData);
      setSuppliers(suppliersData);
      setLoading(false);
    };
    init();
  }, []);

  // Update date range when preset changes
  useEffect(() => {
    const now = moment();
    switch (dateRange) {
      case 'all':
        setStartDate('');
        setEndDate('');
        break;
      case 'month_start':
        setStartDate(now.startOf('month').format('YYYY-MM-DD'));
        setEndDate(now.format('YYYY-MM-DD'));
        break;
      case 'last_month':
        setStartDate(now.clone().subtract(1, 'month').startOf('month').format('YYYY-MM-DD'));
        setEndDate(now.clone().subtract(1, 'month').endOf('month').format('YYYY-MM-DD'));
        break;
      case 'quarter':
        setStartDate(now.startOf('quarter').format('YYYY-MM-DD'));
        setEndDate(now.format('YYYY-MM-DD'));
        break;
      case 'year':
        setStartDate(now.startOf('year').format('YYYY-MM-DD'));
        setEndDate(now.format('YYYY-MM-DD'));
        break;
      default:
        break;
    }
  }, [dateRange]);

  const canViewBudget = canViewBudgets(user);
  const canViewSensitive = canViewSensitiveBudgetData(user);
  const userIsAdmin = isAdmin(user);

  // Filter data based on selections
  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      // Date filtering - only apply if dates are set
      if (startDate && o.created_date) {
        const orderDate = moment(o.created_date);
        const start = moment(startDate);
        if (orderDate.isBefore(start.startOf('day'))) return false;
      }
      if (endDate && o.created_date) {
        const orderDate = moment(o.created_date);
        const end = moment(endDate);
        if (orderDate.isAfter(end.endOf('day'))) return false;
      }
      if (supplierFilter && o.supplier_id !== supplierFilter) return false;
      if (categoryFilter && o.category !== categoryFilter) return false;
      if (subcategoryFilter && o.subcategory !== subcategoryFilter) return false;
      if (budgetSourceFilter && o.budget_source_id !== budgetSourceFilter) return false;
      if (statusFilter !== 'all' && o.status !== statusFilter) return false;
      return true;
    });
  }, [orders, startDate, endDate, supplierFilter, categoryFilter, subcategoryFilter, budgetSourceFilter, statusFilter]);

  const filteredQuotes = useMemo(() => {
    return quotes.filter(q => {
      // Date filtering - only apply if dates are set
      if (startDate && q.open_date && moment(q.open_date).isBefore(moment(startDate).startOf('day'))) return false;
      if (endDate && q.open_date && moment(q.open_date).isAfter(moment(endDate).endOf('day'))) return false;
      if (supplierFilter && q.supplier_id !== supplierFilter) return false;
      if (categoryFilter && q.category !== categoryFilter) return false;
      if (subcategoryFilter && q.subcategory !== subcategoryFilter) return false;
      if (statusFilter !== 'all' && q.status !== statusFilter) return false;
      return true;
    });
  }, [quotes, startDate, endDate, supplierFilter, categoryFilter, subcategoryFilter, statusFilter]);

  const filteredBudgetCategories = useMemo(() => {
    if (!canViewBudget) return [];
    return budgetCategories.filter(c => {
      if (budgetSourceFilter && c.budget_source_id !== budgetSourceFilter) return false;
      return true;
    });
  }, [budgetCategories, budgetSourceFilter, canViewBudget]);

  const filteredCredits = useMemo(() => {
    if (!canViewSensitive) return [];
    return supplierCredits.filter(c => {
      if (supplierFilter && c.supplier_id !== supplierFilter) return false;
      if (statusFilter !== 'all' && c.status !== statusFilter) return false;
      return true;
    });
  }, [supplierCredits, supplierFilter, statusFilter, canViewSensitive]);

  const filteredInventory = useMemo(() => {
    return inventoryItems.filter(i => {
      if (categoryFilter && i.category !== categoryFilter) return false;
      if (subcategoryFilter && i.subcategory !== subcategoryFilter) return false;
      if (supplierFilter && i.supplier_id !== supplierFilter) return false;
      return true;
    });
  }, [inventoryItems, categoryFilter, subcategoryFilter, supplierFilter]);

  const filteredBookLists = useMemo(() => {
    return bookLists.filter(l => {
      // Date filtering - only apply if dates are set
      if (startDate && l.received_date && moment(l.received_date).isBefore(moment(startDate).startOf('day'))) return false;
      if (endDate && l.received_date && moment(l.received_date).isAfter(moment(endDate).endOf('day'))) return false;
      if (supplierFilter && l.supplier_id !== supplierFilter) return false;
      if (categoryFilter && l.category !== categoryFilter) return false;
      if (statusFilter !== 'all' && l.status !== statusFilter) return false;
      return true;
    });
  }, [bookLists, startDate, endDate, supplierFilter, categoryFilter, statusFilter]);

  // Export to Excel
  const exportToExcel = async (reportType, data) => {
    try {
      const { utils, writeFile } = await import('xlsx');
      
      const ws = utils.json_to_sheet(data);
      const wb = utils.book_new();
      utils.book_append_sheet(wb, ws, 'דוח');

      const dateStr = moment().format('YYYY-MM');
      const filename = `${reportType}-report-${dateStr}.xlsx`;

      writeFile(wb, filename);
      toast.success('הדוח יוצא בהצלחה!');
    } catch (e) {
      toast.error('שגיאה בייצוא הדוח. יש להתקין את חבילת xlsx.');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  // Dashboard summary cards
  const summaryCards = [
    { title: 'הזמנות פתוחות', value: orders.filter(o => ['draft', 'pending_approval', 'approved', 'ordered'].includes(o.status)).length, icon: ShoppingCart, color: 'from-blue-500 to-purple-500' },
    { title: 'ממתינות לאישור', value: orders.filter(o => o.status === 'pending_approval').length, icon: Clock, color: 'from-amber-500 to-orange-500' },
    { title: 'התקבלו החודש', value: orders.filter(o => ['received_full', 'received_partial'].includes(o.status) && moment(o.received_date).isSame(moment(), 'month')).length, icon: CheckCircle, color: 'from-green-500 to-emerald-500' },
    { title: 'מלאי נמוך', value: inventoryItems.filter(i => i.current_quantity <= i.minimum_quantity).length, icon: AlertTriangle, color: 'from-red-500 to-rose-500' },
    { title: 'רשימות לא מטופלות', value: bookLists.filter(l => l.status === 'received' || l.status === 'in_review').length, icon: BookOpen, color: 'from-pink-500 to-rose-500' },
  ];

  if (canViewSensitive) {
    summaryCards.push({
      title: 'תקציב מנוצל החודש',
      value: `₪${budgetCategories.reduce((sum, c) => sum + (c.spent_amount || 0), 0).toLocaleString('he-IL')}`,
      icon: Wallet,
      color: 'from-teal-500 to-cyan-500',
    });
  }

  if (canViewSensitive) {
    summaryCards.push({
      title: 'זיכויים פעילים',
      value: supplierCredits.filter(c => c.status === 'active').length,
      icon: CreditCard,
      color: 'from-violet-500 to-purple-500',
    });
  }

  return (
    <div className="p-6 max-w-7xl mx-auto animate-fade-in">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">דשבורד</h1>
        <p className="text-muted-foreground mt-1">תמונת מצב, דוחות וייצוא נתונים</p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        {summaryCards.map((card, i) => (
          <Card key={i} className="border-border hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{card.title}</CardTitle>
              <card.icon className={cn("w-4 h-4", card.color.includes('blue') ? 'text-blue-500' : card.color.includes('amber') ? 'text-amber-500' : card.color.includes('green') ? 'text-green-500' : card.color.includes('red') ? 'text-red-500' : card.color.includes('pink') ? 'text-pink-500' : 'text-teal-500')} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{card.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Staff Summary */}
      <StaffDashboardCards />

      {/* Projects Summary */}
      <ProjectsDashboardCards />

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
            <div className="space-y-1.5">
              <Label>טווח תאריכים</Label>
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DATE_RANGES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {dateRange === 'custom' && (
              <>
                <div className="space-y-1.5">
                  <Label>מתאריך</Label>
                  <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>עד תאריך</Label>
                  <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
                </div>
              </>
            )}
            <div className="space-y-1.5">
              <Label>ספק</Label>
              <Select value={supplierFilter} onValueChange={setSupplierFilter}>
                <SelectTrigger><SelectValue placeholder="כל הספקים" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>כל הספקים</SelectItem>
                  {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>קטגוריה</Label>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger><SelectValue placeholder="כל הקטגוריות" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>כל הקטגוריות</SelectItem>
                  <SelectItem value="books">ספרים</SelectItem>
                  <SelectItem value="plastic_covers">כריכות פלסטיק</SelectItem>
                  <SelectItem value="stationery">ציוד משרדי</SelectItem>
                  <SelectItem value="equipment">ציוד</SelectItem>
                  <SelectItem value="other">אחר</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>סטטוס</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger><SelectValue placeholder="כל הסטטוסים" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">כל הסטטוסים</SelectItem>
                  <SelectItem value="draft">טיוטה</SelectItem>
                  <SelectItem value="pending_approval">ממתין לאישור</SelectItem>
                  <SelectItem value="approved">מאושר</SelectItem>
                  <SelectItem value="ordered">הוזמן</SelectItem>
                  <SelectItem value="received_full">התקבל במלואו</SelectItem>
                  <SelectItem value="received_partial">התקבל חלקית</SelectItem>
                  <SelectItem value="cancelled">בוטל</SelectItem>
                  <SelectItem value="rejected">נדחה</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Report Tabs */}
      <Tabs value={activeReport} onValueChange={setActiveReport} className="space-y-4">
        <TabsList className="grid grid-cols-3 lg:grid-cols-6 gap-2 h-auto">
          {REPORT_TYPES.map(type => (
            <TabsTrigger key={type.value} value={type.value} className="flex items-center gap-2 py-3">
              <type.icon className="w-4 h-4" />
              <span className="hidden lg:inline">{type.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Orders Report */}
        <TabsContent value="orders" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>דוח הזמנות רכש</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">{filteredOrders.length} הזמנות</p>
              </div>
              <Button onClick={() => exportToExcel('orders', filteredOrders.map(o => ({
                order_number: o.order_number,
                created_date: o.created_date,
                title: o.title,
                supplier_name: o.supplier_name,
                category: o.category,
                subcategory: o.subcategory,
                source: o.source_book_list_id ? 'רשימת ספרים' : o.source_quote_id ? 'הצעת מחיר' : 'ידנית',
                funding_source_type: o.funding_source_type,
                budget_category_name: o.budget_category_name,
                total_amount: o.total_amount,
                status: o.status,
                created_by: o.created_by,
                approved_by: o.approved_by,
                approved_date: o.approved_date,
                received_date: o.received_date,
                inventory_updated: o.inventory_updated ? 'כן' : 'לא',
                notes: o.notes,
              })))} className="gap-2">
                <Download className="w-4 h-4" /> ייצוא לאקסל
              </Button>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-5 mb-4">
                <div className="text-center p-3 bg-muted/50 rounded-lg">
                  <p className="text-xs text-muted-foreground">סך הזמנות</p>
                  <p className="text-2xl font-bold">{filteredOrders.length}</p>
                </div>
                <div className="text-center p-3 bg-muted/50 rounded-lg">
                  <p className="text-xs text-muted-foreground">סך סכום</p>
                  <p className="text-lg font-bold">₪{filteredOrders.reduce((s, o) => s + (o.total_amount || 0), 0).toLocaleString('he-IL')}</p>
                </div>
                <div className="text-center p-3 bg-amber-50 rounded-lg">
                  <p className="text-xs text-amber-700">ממתינות לאישור</p>
                  <p className="text-lg font-bold text-amber-700">{filteredOrders.filter(o => o.status === 'pending_approval').length}</p>
                </div>
                <div className="text-center p-3 bg-green-50 rounded-lg">
                  <p className="text-xs text-green-700">אושרו</p>
                  <p className="text-lg font-bold text-green-700">{filteredOrders.filter(o => o.status === 'approved').length}</p>
                </div>
                <div className="text-center p-3 bg-blue-50 rounded-lg">
                  <p className="text-xs text-blue-700">התקבלו</p>
                  <p className="text-lg font-bold text-blue-700">{filteredOrders.filter(o => ['received_full', 'received_partial'].includes(o.status)).length}</p>
                </div>
              </div>

              <div className="border border-border rounded-xl overflow-auto max-h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>מספר הזמנה</TableHead>
                      <TableHead>תאריך פתיחה</TableHead>
                      <TableHead>כותרת</TableHead>
                      <TableHead>ספק</TableHead>
                      <TableHead className="hidden lg:table-cell">קטגוריה</TableHead>
                      <TableHead className="hidden lg:table-cell">מקור</TableHead>
                      <TableHead className="hidden md:table-cell">מקור מימון</TableHead>
                      <TableHead className="text-right">סכום</TableHead>
                      <TableHead>סטטוס</TableHead>
                      <TableHead className="hidden xl:table-cell">אושר ע"י</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredOrders.map(order => (
                      <TableRow key={order.id}>
                        <TableCell className="font-medium">{order.order_number}</TableCell>
                        <TableCell>{order.created_date ? moment(order.created_date).format('DD/MM/YYYY') : '-'}</TableCell>
                        <TableCell>
                          <Link to={`/orders/${order.id}`} className="text-primary hover:underline">{order.title || order.supplier_name}</Link>
                        </TableCell>
                        <TableCell>{order.supplier_name}</TableCell>
                        <TableCell className="hidden lg:table-cell">{order.category}</TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {order.source_book_list_id ? 'רשימת ספרים' : order.source_quote_id ? 'הצעת מחיר' : 'ידנית'}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">{order.budget_source_name || '-'}</TableCell>
                        <TableCell className="text-right font-medium">₪{(order.total_amount || 0).toLocaleString('he-IL')}</TableCell>
                        <TableCell><StatusBadge status={order.status} entityType="PurchaseOrder" /></TableCell>
                        <TableCell className="hidden xl:table-cell">{order.approved_by || '-'}</TableCell>
                      </TableRow>
                    ))}
                    {filteredOrders.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center py-12 text-muted-foreground">
                          <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
                          <p>אין הזמנות לתצוגה</p>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Quotes Report */}
        <TabsContent value="quotes" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>דוח הצעות מחיר</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">{filteredQuotes.length} הצעות</p>
              </div>
              <Button onClick={() => exportToExcel('quotes', filteredQuotes)} className="gap-2">
                <Download className="w-4 h-4" /> ייצוא לאקסל
              </Button>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-4 mb-4">
                <div className="text-center p-3 bg-muted/50 rounded-lg">
                  <p className="text-xs text-muted-foreground">סך הצעות</p>
                  <p className="text-2xl font-bold">{filteredQuotes.length}</p>
                </div>
                <div className="text-center p-3 bg-amber-50 rounded-lg">
                  <p className="text-xs text-amber-700">ממתינות לאישור</p>
                  <p className="text-lg font-bold text-amber-700">{filteredQuotes.filter(q => q.status === 'pending_approval').length}</p>
                </div>
                <div className="text-center p-3 bg-green-50 rounded-lg">
                  <p className="text-xs text-green-700">אושרו</p>
                  <p className="text-lg font-bold text-green-700">{filteredQuotes.filter(q => q.status === 'approved').length}</p>
                </div>
                <div className="text-center p-3 bg-blue-50 rounded-lg">
                  <p className="text-xs text-blue-700">הפכו להזמנות</p>
                  <p className="text-lg font-bold text-blue-700">{filteredQuotes.filter(q => q.order_created).length}</p>
                </div>
              </div>

              <div className="border border-border rounded-xl overflow-auto max-h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>מספר הצעה</TableHead>
                      <TableHead>תאריך</TableHead>
                      <TableHead>כותרת</TableHead>
                      <TableHead>ספק</TableHead>
                      <TableHead className="hidden lg:table-cell">קטגוריה</TableHead>
                      <TableHead className="text-right">סכום</TableHead>
                      <TableHead>סטטוס</TableHead>
                      <TableHead className="hidden md:table-cell">תוקף</TableHead>
                      <TableHead className="hidden xl:table-cell">נוצרה הזמנה</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredQuotes.map(quote => (
                      <TableRow key={quote.id}>
                        <TableCell className="font-medium">{quote.quote_number}</TableCell>
                        <TableCell>{quote.open_date ? moment(quote.open_date).format('DD/MM/YYYY') : '-'}</TableCell>
                        <TableCell className="font-medium">{quote.title}</TableCell>
                        <TableCell>{quote.supplier_name}</TableCell>
                        <TableCell className="hidden lg:table-cell">{quote.category}</TableCell>
                        <TableCell className="text-right font-medium">₪{(quote.total_amount || 0).toLocaleString('he-IL')}</TableCell>
                        <TableCell><StatusBadge status={quote.status} entityType="QuoteRequest" /></TableCell>
                        <TableCell className="hidden md:table-cell">{quote.validity_date ? moment(quote.validity_date).format('DD/MM/YYYY') : '-'}</TableCell>
                        <TableCell className="hidden xl:table-cell">
                          {quote.linked_order_id ? (
                            <Link to={`/orders/${quote.linked_order_id}`} className="text-primary hover:underline">#{quote.linked_order_id?.slice(0, 8)}</Link>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {filteredQuotes.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                          <p>אין הצעות מחיר לתצוגה</p>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Budget Report */}
        <TabsContent value="budget" className="space-y-4">
          {!canViewBudget ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                </div>
                <h2 className="text-xl font-bold text-foreground mb-2">אין גישה לדוחות תקציב</h2>
                <p className="text-muted-foreground">אין לך הרשאה לצפות בדוחות תקציב וזיכויים.</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>דוח תקציב וניצול</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">{filteredBudgetCategories.length} קטגוריות תקציב</p>
                </div>
                <Button onClick={() => exportToExcel('budget', filteredBudgetCategories.map(c => ({
                  budget_source_name: budgetSources.find(bs => bs.id === c.budget_source_id)?.name || '',
                  category_name: c.name,
                  allocated_amount: c.allocated_amount,
                  reserved_amount: c.reserved_amount,
                  spent_amount: c.spent_amount,
                  remaining_amount: c.remaining_amount,
                  utilization_pct: c.allocated_amount > 0 ? Math.round(((c.reserved_amount || 0) + (c.spent_amount || 0)) / c.allocated_amount * 100) : 0,
                })))} className="gap-2" disabled={!canViewSensitive}>
                  <Download className="w-4 h-4" /> ייצוא לאקסל
                </Button>
              </CardHeader>
              <CardContent>
                {!canViewSensitive ? (
                  <div className="text-center py-8 text-muted-foreground bg-muted/30 rounded-lg">
                    <p>צפייה מוגבלת - פנה למנהלת המערכת לצפייה בנתונים מלאים</p>
                  </div>
                ) : (
                  <>
                    <div className="grid gap-3 md:grid-cols-4 mb-4">
                      <div className="text-center p-3 bg-muted/50 rounded-lg">
                        <p className="text-xs text-muted-foreground">תקציב כולל</p>
                        <p className="text-2xl font-bold">₪{filteredBudgetCategories.reduce((s, c) => s + (c.allocated_amount || 0), 0).toLocaleString('he-IL')}</p>
                      </div>
                      <div className="text-center p-3 bg-amber-50 rounded-lg">
                        <p className="text-xs text-amber-700">משוריין</p>
                        <p className="text-lg font-bold text-amber-700">₪{filteredBudgetCategories.reduce((s, c) => s + (c.reserved_amount || 0), 0).toLocaleString('he-IL')}</p>
                      </div>
                      <div className="text-center p-3 bg-red-50 rounded-lg">
                        <p className="text-xs text-red-700">נוצל בפועל</p>
                        <p className="text-lg font-bold text-red-700">₪{filteredBudgetCategories.reduce((s, c) => s + (c.spent_amount || 0), 0).toLocaleString('he-IL')}</p>
                      </div>
                      <div className="text-center p-3 bg-green-50 rounded-lg">
                        <p className="text-xs text-green-700">יתרה זמינה</p>
                        <p className="text-lg font-bold text-green-700">₪{filteredBudgetCategories.reduce((s, c) => s + (c.remaining_amount || 0), 0).toLocaleString('he-IL')}</p>
                      </div>
                    </div>

                    <div className="border border-border rounded-xl overflow-auto max-h-[500px]">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>מקור תקציב</TableHead>
                            <TableHead>קטגוריית תקציב</TableHead>
                            <TableHead className="text-right">מוקצה</TableHead>
                            <TableHead className="text-right">משוריין</TableHead>
                            <TableHead className="text-right">נוצל</TableHead>
                            <TableHead className="text-right">יתרה</TableHead>
                            <TableHead className="text-right">אחוז ניצול</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredBudgetCategories.map(cat => {
                            const source = budgetSources.find(bs => bs.id === cat.budget_source_id);
                            const allocated = cat.allocated_amount || 0;
                            const reserved = cat.reserved_amount || 0;
                            const spent = cat.spent_amount || 0;
                            const remaining = cat.remaining_amount || 0;
                            const utilization = allocated > 0 ? Math.round(((reserved + spent) / allocated) * 100) : 0;
                            return (
                              <TableRow key={cat.id}>
                                <TableCell className="font-medium">{source?.name || '-'}</TableCell>
                                <TableCell>{cat.name}</TableCell>
                                <TableCell className="text-right font-medium">₪{allocated.toLocaleString('he-IL')}</TableCell>
                                <TableCell className="text-right text-amber-600">₪{reserved.toLocaleString('he-IL')}</TableCell>
                                <TableCell className="text-right text-red-500">₪{spent.toLocaleString('he-IL')}</TableCell>
                                <TableCell className="text-right text-green-600 font-medium">₪{remaining.toLocaleString('he-IL')}</TableCell>
                                <TableCell className="text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <div className="w-20 h-2 bg-muted rounded-full overflow-hidden">
                                      <div className="h-full bg-primary rounded-full" style={{ width: `${utilization}%` }} />
                                    </div>
                                    <span className="text-xs font-medium">{utilization}%</span>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                          {filteredBudgetCategories.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                                <p>אין נתוני תקציב לתצוגה</p>
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Credits Report */}
        <TabsContent value="credits" className="space-y-4">
          {!canViewSensitive ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                </div>
                <h2 className="text-xl font-bold text-foreground mb-2">אין גישה לדוחות זיכויים</h2>
                <p className="text-muted-foreground">אין לך הרשאה לצפות בדוחות זיכויי ספקים.</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>דוח זיכויי ספקים</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">{filteredCredits.length} זיכויים</p>
                </div>
                <Button onClick={() => exportToExcel('credits', filteredCredits)} className="gap-2">
                  <Download className="w-4 h-4" /> ייצוא לאקסל
                </Button>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 md:grid-cols-5 mb-4">
                  <div className="text-center p-3 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground">זיכויים פעילים</p>
                    <p className="text-2xl font-bold">{filteredCredits.filter(c => c.status === 'active').length}</p>
                  </div>
                  <div className="text-center p-3 bg-green-50 rounded-lg">
                    <p className="text-xs text-green-700">סך יתרת זיכויים</p>
                    <p className="text-lg font-bold text-green-700">₪{filteredCredits.reduce((s, c) => s + (c.remaining_amount || 0), 0).toLocaleString('he-IL')}</p>
                  </div>
                  <div className="text-center p-3 bg-blue-50 rounded-lg">
                    <p className="text-xs text-blue-700">נוצלו</p>
                    <p className="text-lg font-bold text-blue-700">{filteredCredits.filter(c => c.status === 'exhausted').length}</p>
                  </div>
                  <div className="text-center p-3 bg-red-50 rounded-lg">
                    <p className="text-xs text-red-700">פג תוקף</p>
                    <p className="text-lg font-bold text-red-700">{filteredCredits.filter(c => c.status === 'expired').length}</p>
                  </div>
                  <div className="text-center p-3 bg-amber-50 rounded-lg">
                    <p className="text-xs text-amber-700">עומדים לפוג</p>
                    <p className="text-lg font-bold text-amber-700">{filteredCredits.filter(c => c.valid_until && moment(c.valid_until).isBetween(moment(), moment().add(30, 'days'))).length}</p>
                  </div>
                </div>

                <div className="border border-border rounded-xl overflow-auto max-h-[500px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ספק</TableHead>
                        <TableHead>סוג זיכוי</TableHead>
                        <TableHead className="text-right">סכום מקורי</TableHead>
                        <TableHead className="text-right">משוריין</TableHead>
                        <TableHead className="text-right">נוצל</TableHead>
                        <TableHead className="text-right">יתרה</TableHead>
                        <TableHead>סיבה</TableHead>
                        <TableHead className="hidden md:table-cell">תוקף</TableHead>
                        <TableHead>סטטוס</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredCredits.map(credit => {
                        const total = credit.total_amount || 0;
                        const reserved = credit.reserved_amount || 0;
                        const used = credit.used_amount || 0;
                        const remaining = credit.remaining_amount !== undefined ? credit.remaining_amount : Math.max(0, total - reserved - used);
                        return (
                          <TableRow key={credit.id}>
                            <TableCell className="font-medium">{credit.supplier_name}</TableCell>
                            <TableCell>{credit.credit_type === 'refund' ? 'החזר' : credit.credit_type === 'supplier_credit' ? 'זיכוי ספק' : 'אחר'}</TableCell>
                            <TableCell className="text-right font-medium">₪{total.toLocaleString('he-IL')}</TableCell>
                            <TableCell className="text-right text-amber-600">₪{reserved.toLocaleString('he-IL')}</TableCell>
                            <TableCell className="text-right text-red-500">₪{used.toLocaleString('he-IL')}</TableCell>
                            <TableCell className="text-right text-green-600 font-medium">₪{remaining.toLocaleString('he-IL')}</TableCell>
                            <TableCell className="max-w-[200px] truncate">{credit.reason || '-'}</TableCell>
                            <TableCell className="hidden md:table-cell">{credit.valid_until ? moment(credit.valid_until).format('DD/MM/YYYY') : '-'}</TableCell>
                            <TableCell><StatusBadge status={credit.status} entityType="SupplierCredit" /></TableCell>
                          </TableRow>
                        );
                      })}
                      {filteredCredits.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                            <p>אין זיכויי ספקים לתצוגה</p>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Inventory Report */}
        <TabsContent value="inventory" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>דוח מלאי</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">{filteredInventory.length} פריטים</p>
              </div>
              <Button onClick={() => exportToExcel('inventory', filteredInventory)} className="gap-2">
                <Download className="w-4 h-4" /> ייצוא לאקסל
              </Button>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-4 mb-4">
                <div className="text-center p-3 bg-muted/50 rounded-lg">
                  <p className="text-xs text-muted-foreground">סך פריטים</p>
                  <p className="text-2xl font-bold">{filteredInventory.length}</p>
                </div>
                <div className="text-center p-3 bg-red-50 rounded-lg">
                  <p className="text-xs text-red-700">מתחת למינימום</p>
                  <p className="text-lg font-bold text-red-700">{filteredInventory.filter(i => i.current_quantity <= i.minimum_quantity).length}</p>
                </div>
                <div className="text-center p-3 bg-amber-50 rounded-lg">
                  <p className="text-xs text-amber-700">חסרים (0 במלאי)</p>
                  <p className="text-lg font-bold text-amber-700">{filteredInventory.filter(i => i.current_quantity === 0).length}</p>
                </div>
                <div className="text-center p-3 bg-green-50 rounded-lg">
                  <p className="text-xs text-green-700">תקינים</p>
                  <p className="text-lg font-bold text-green-700">{filteredInventory.filter(i => i.current_quantity > i.minimum_quantity).length}</p>
                </div>
              </div>

              <div className="border border-border rounded-xl overflow-auto max-h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>שם פריט</TableHead>
                      <TableHead className="hidden lg:table-cell">קטגוריה</TableHead>
                      <TableHead className="text-center">כמות נוכחית</TableHead>
                      <TableHead className="text-center">מינימום</TableHead>
                      <TableHead className="hidden md:table-cell">יחידה</TableHead>
                      <TableHead className="hidden lg:table-cell">ספק אחרון</TableHead>
                      <TableHead className="hidden xl:table-cell">מחיר אחרון</TableHead>
                      <TableHead className="hidden md:table-cell">עודכן לאחרונה</TableHead>
                      <TableHead>סטטוס</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredInventory.map(item => {
                      const isLow = item.current_quantity <= item.minimum_quantity;
                      const isZero = item.current_quantity === 0;
                      return (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.name}</TableCell>
                          <TableCell className="hidden lg:table-cell">{item.category}{item.subcategory ? ` - ${item.subcategory}` : ''}</TableCell>
                          <TableCell className="text-center font-medium">{item.current_quantity}</TableCell>
                          <TableCell className="text-center text-muted-foreground">{item.minimum_quantity}</TableCell>
                          <TableCell className="hidden md:table-cell text-sm">{item.unit || 'יחידות'}</TableCell>
                          <TableCell className="hidden lg:table-cell">{item.supplier_name || '-'}</TableCell>
                          <TableCell className="hidden xl:table-cell">₪{(item.last_unit_price || 0).toFixed(2)}</TableCell>
                          <TableCell className="hidden md:table-cell">{item.last_received_date ? moment(item.last_received_date).format('DD/MM/YYYY') : '-'}</TableCell>
                          <TableCell>
                            <span className={cn('text-xs px-2 py-1 rounded-full font-medium',
                              isZero ? 'bg-red-100 text-red-700' : isLow ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
                            )}>
                              {isZero ? 'חסר' : isLow ? 'נמוך' : 'תקין'}
                            </span>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {filteredInventory.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                          <p>אין פריטי מלאי לתצוגה</p>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Book Lists Report */}
        <TabsContent value="booklists" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>דוח רשימות ספרים מספקים</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">{filteredBookLists.length} רשימות</p>
              </div>
              <Button onClick={() => exportToExcel('booklists', filteredBookLists.map(l => ({
                title: l.title,
                supplier_name: l.supplier_name,
                received_date: l.received_date,
                category: l.category,
                status: l.status,
                total_books: (l.books || []).length,
                marked_books: (l.books || []).filter(b => b.marked_for_order).length,
                order_created: l.order_created ? 'כן' : 'לא',
                linked_order_id: l.linked_order_id || '',
              })))} className="gap-2">
                <Download className="w-4 h-4" /> ייצוא לאקסל
              </Button>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-5 mb-4">
                <div className="text-center p-3 bg-muted/50 rounded-lg">
                  <p className="text-xs text-muted-foreground">סך רשימות</p>
                  <p className="text-2xl font-bold">{filteredBookLists.length}</p>
                </div>
                <div className="text-center p-3 bg-blue-50 rounded-lg">
                  <p className="text-xs text-blue-700">התקבלו</p>
                  <p className="text-lg font-bold text-blue-700">{filteredBookLists.filter(l => l.status === 'received').length}</p>
                </div>
                <div className="text-center p-3 bg-amber-50 rounded-lg">
                  <p className="text-xs text-amber-700">בבדיקה</p>
                  <p className="text-lg font-bold text-amber-700">{filteredBookLists.filter(l => l.status === 'in_review').length}</p>
                </div>
                <div className="text-center p-3 bg-green-50 rounded-lg">
                  <p className="text-xs text-green-700">הועברו להזמנה</p>
                  <p className="text-lg font-bold text-green-700">{filteredBookLists.filter(l => l.status === 'transferred_to_order').length}</p>
                </div>
                <div className="text-center p-3 bg-purple-50 rounded-lg">
                  <p className="text-xs text-purple-700">ספרים מסומנים</p>
                  <p className="text-lg font-bold text-purple-700">{filteredBookLists.reduce((s, l) => s + (l.books || []).filter(b => b.marked_for_order).length, 0)}</p>
                </div>
              </div>

              <div className="border border-border rounded-xl overflow-auto max-h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>שם רשימה</TableHead>
                      <TableHead>ספק</TableHead>
                      <TableHead className="hidden md:table-cell">תאריך קבלה</TableHead>
                      <TableHead className="hidden lg:table-cell">קטגוריה</TableHead>
                      <TableHead>סטטוס</TableHead>
                      <TableHead className="text-center">ספרים</TableHead>
                      <TableHead className="text-center">מסומנים</TableHead>
                      <TableHead className="hidden xl:table-cell">נוצרה הזמנה</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredBookLists.map(list => {
                      const bookCount = (list.books || []).length;
                      const markedCount = (list.books || []).filter(b => b.marked_for_order).length;
                      return (
                        <TableRow key={list.id}>
                          <TableCell className="font-medium">{list.title}</TableCell>
                          <TableCell>{list.supplier_name}</TableCell>
                          <TableCell className="hidden md:table-cell">{list.received_date ? moment(list.received_date).format('DD/MM/YYYY') : '-'}</TableCell>
                          <TableCell className="hidden lg:table-cell">{list.category}</TableCell>
                          <TableCell><StatusBadge status={list.status} entityType="SupplierBookList" /></TableCell>
                          <TableCell className="text-center">{bookCount}</TableCell>
                          <TableCell className="text-center">
                            {markedCount > 0 ? (
                              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">{markedCount}</span>
                            ) : (
                              <span className="text-xs text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="hidden xl:table-cell">
                            {list.linked_order_id ? (
                              <Link to={`/orders/${list.linked_order_id}`} className="text-primary hover:underline">#{list.linked_order_id?.slice(0, 8)}</Link>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {filteredBookLists.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                          <p>אין רשימות ספרים לתצוגה</p>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}