import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import { canManageInventory } from '@/lib/permissions';
import { Package, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function GoodsReceiptDialog({ open, onOpenChange, order, onConfirmed }) {
  const [receivedQtys, setReceivedQtys] = useState({});
  const [notes, setNotes] = useState({});
  const [saving, setSaving] = useState(false);
  const [showDupWarning, setShowDupWarning] = useState(false);
  const [user, setUser] = useState(null);

  if (!order) return null;

  const items = order.items || [];
  const isInventoryUpdated = !!order.inventory_updated;

  // Initialize received qtys to ordered qtys
  if (Object.keys(receivedQtys).length === 0 && items.length > 0) {
    const init = {};
    items.forEach((item, i) => { init[i] = item.quantity || 0; });
    setTimeout(() => setReceivedQtys(init), 0);
  }

  const handleConfirm = () => {
    base44.auth.me().then(u => {
      setUser(u);
      if (!canManageInventory(u)) {
        toast.error('אין הרשאה לקבלת סחורה.');
        return;
      }
      if (isInventoryUpdated) {
        setShowDupWarning(true);
        return;
      }
      processReceipt();
    }).catch(() => {
      toast.error('שגיאה בבדיקת הרשאות');
    });
  };

  const processReceipt = async () => {
    setSaving(true);

    const allFull = items.every((item, i) => (receivedQtys[i] || 0) >= (item.quantity || 0));
    const someReceived = items.some((item, i) => (receivedQtys[i] || 0) > 0);
    const status = allFull ? 'received_full' : 'received_partial';
    const today = new Date().toISOString().split('T')[0];

    try {
      const userData = await base44.auth.me().catch(() => ({}));
      const confirmedBy = userData?.full_name || userData?.email || '';

      // Update inventory for each received item
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const qty = receivedQtys[i] || 0;
        if (qty <= 0) continue;

        // Match: by name + category
        const existing = await base44.entities.InventoryItem.filter({
          name: item.name,
          category: order.category,
        });

        const movement = {
          date: today,
          type: 'קבלת הזמנה',
          purchase_order_id: order.id,
          supplier_name: order.supplier_name || '',
          quantity_added: qty,
        };

        if (existing.length > 0) {
          const inv = existing[0];
          const movements = [...(inv.movements || []), movement];
          await base44.entities.InventoryItem.update(inv.id, {
            current_quantity: (inv.current_quantity || 0) + qty,
            last_purchase_order_id: order.id,
            last_received_date: today,
            last_supplier_id: order.supplier_id || '',
            last_unit_price: item.unit_price || 0,
            supplier_id: order.supplier_id || inv.supplier_id,
            supplier_name: order.supplier_name || inv.supplier_name,
            movements,
          });
        } else {
          await base44.entities.InventoryItem.create({
            name: item.name,
            category: order.category || '',
            subcategory: order.subcategory || '',
            current_quantity: qty,
            minimum_quantity: 1,
            unit: 'יחידות',
            last_purchase_order_id: order.id,
            last_received_date: today,
            last_supplier_id: order.supplier_id || '',
            last_unit_price: item.unit_price || 0,
            supplier_id: order.supplier_id || '',
            supplier_name: order.supplier_name || '',
            isbn: item.isbn || '',
            movements: [movement],
          });
        }
      }

      // Update order
      await base44.entities.PurchaseOrder.update(order.id, {
        status,
        received_date: today,
        receipt_confirmed_by: confirmedBy,
        inventory_updated: true,
      });

      toast.success(`הקבלה נקלטה · ${status === 'received_full' ? 'התקבלה במלואה' : 'התקבלה חלקית'}`);
      setSaving(false);
      onConfirmed({ status, received_date: today, receipt_confirmed_by: confirmedBy, inventory_updated: true });
      onOpenChange(false);
    } catch (e) {
      toast.error('שגיאה בעדכון מלאי');
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto font-heebo" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="w-5 h-5 text-green-500" /> קבלת סחורה
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              {order.title || order.supplier_name} · {order.order_number && `#${order.order_number}`}
            </p>
          </DialogHeader>

          {isInventoryUpdated && !showDupWarning && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" /> המלאי עודכן מהזמנה זו
            </div>
          )}

          <div className="space-y-2">
            <div className="grid grid-cols-12 gap-2 text-xs text-muted-foreground font-medium px-2">
              <span className="col-span-4">פריט</span>
              <span className="col-span-2 text-center">הוזמן</span>
              <span className="col-span-2 text-center">התקבל</span>
              <span className="col-span-2 text-center">חסר</span>
              <span className="col-span-2 text-right">הערות</span>
            </div>
            {items.map((item, i) => {
              const ordered = item.quantity || 0;
              const received = receivedQtys[i] ?? ordered;
              const missing = Math.max(0, ordered - received);
              const isPartial = received < ordered;
              return (
                <div key={i} className={cn('grid grid-cols-12 gap-2 items-center bg-muted/40 rounded-xl px-2 py-2', isPartial && 'bg-amber-50/70')}>
                  <div className="col-span-4">
                    <p className="font-medium text-sm">{item.name || 'ללא שם'}</p>
                    {item.description && <p className="text-xs text-muted-foreground">{item.description}</p>}
                    {item.isbn && <p className="text-xs font-mono text-muted-foreground">{item.isbn}</p>}
                  </div>
                  <span className="col-span-2 text-center font-medium">{ordered}</span>
                  <Input
                    className="col-span-2 h-8 text-sm text-center bg-card"
                    type="number"
                    min={0}
                    max={ordered}
                    value={received}
                    onChange={e => setReceivedQtys(prev => ({ ...prev, [i]: Math.min(Number(e.target.value), ordered) }))}
                  />
                  <span className={cn('col-span-2 text-center font-medium', missing > 0 ? 'text-red-500' : 'text-green-500')}>
                    {missing > 0 ? missing : '✓'}
                  </span>
                  <Input
                    className="col-span-2 h-8 text-xs bg-card"
                    placeholder="הערה"
                    value={notes[i] || ''}
                    onChange={e => setNotes(prev => ({ ...prev, [i]: e.target.value }))}
                  />
                </div>
              );
            })}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>ביטול</Button>
            <Button onClick={handleConfirm} disabled={saving} className="gap-2 bg-gradient-to-l from-green-500 to-emerald-600 text-white border-0 hover:opacity-90">
              <CheckCircle2 className="w-4 h-4" /> {saving ? 'מעדכן...' : 'אשר קבלה ועדכן מלאי'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDupWarning} onOpenChange={setShowDupWarning}>
        <AlertDialogContent dir="rtl" className="font-heebo">
          <AlertDialogHeader>
            <AlertDialogTitle>עדכון מלאי חוזר</AlertDialogTitle>
            <AlertDialogDescription>
              המלאי כבר עודכן מהזמנה זו. עדכון נוסף עלול ליצור כפילות במלאי. האם להמשיך?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel onClick={() => setShowDupWarning(false)}>ביטול</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setShowDupWarning(false); processReceipt(); }} className="bg-amber-500 hover:bg-amber-600">עדכן שוב</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}