import { cn } from '@/lib/utils';

const configs = {
  // PurchaseOrder
  'po_draft':             { label: 'טיוטה',            className: 'bg-slate-100 text-slate-600' },
  'po_pending_approval':  { label: 'ממתין לאישור',     className: 'bg-amber-100 text-amber-700' },
  'po_approved':          { label: 'אושר',              className: 'bg-blue-100 text-blue-700' },
  'po_ordered':           { label: 'הוזמן',             className: 'bg-purple-100 text-purple-700' },
  'po_received_full':     { label: 'התקבל במלואו',      className: 'bg-green-100 text-green-700' },
  'po_received_partial':  { label: 'התקבל חלקית',       className: 'bg-amber-100 text-amber-700' },
  'po_cancelled':         { label: 'בוטל',              className: 'bg-red-100 text-red-600' },
  'po_rejected':          { label: 'נדחה',              className: 'bg-red-100 text-red-600' },
  // QuoteRequest
  'qr_draft':             { label: 'טיוטה',             className: 'bg-slate-100 text-slate-600' },
  'qr_sent_to_supplier':  { label: 'נשלחה לספק',        className: 'bg-blue-100 text-blue-700' },
  'qr_received':          { label: 'התקבלה',            className: 'bg-teal-100 text-teal-700' },
  'qr_in_review':         { label: 'בבדיקה',            className: 'bg-indigo-100 text-indigo-700' },
  'qr_pending_approval':  { label: 'ממתינה לאישור',     className: 'bg-amber-100 text-amber-700' },
  'qr_approved':          { label: 'אושרה',             className: 'bg-green-100 text-green-700' },
  'qr_rejected':          { label: 'נדחתה',             className: 'bg-red-100 text-red-600' },
  'qr_expired':           { label: 'פג תוקף',           className: 'bg-gray-200 text-gray-600' },
  'qr_converted_to_order':{ label: 'הפכה להזמנת רכש',   className: 'bg-purple-100 text-purple-700' },
  // SupplierBookList
  'bl_received':          { label: 'התקבלה',            className: 'bg-blue-100 text-blue-700' },
  'bl_in_review':         { label: 'בבדיקה',            className: 'bg-indigo-100 text-indigo-700' },
  'bl_books_selected':    { label: 'נבחרו ספרים', className: 'bg-amber-100 text-amber-700' },
  'bl_transferred_to_quote':{ label: 'הועברה לבקשת הצעת מחיר',className: 'bg-purple-100 text-purple-700' },
  'bl_transferred_to_order':{ label: 'הועברה להזמנת רכש',className: 'bg-purple-100 text-purple-700' },
  'bl_closed':            { label: 'נסגרה',             className: 'bg-gray-100 text-gray-600' },
  // SupplierCredit
  'sc_active':            { label: 'פעיל',              className: 'bg-green-100 text-green-700' },
  'sc_exhausted':         { label: 'נוצל',              className: 'bg-slate-100 text-slate-600' },
  'sc_expired':           { label: 'פג תוקף',           className: 'bg-red-100 text-red-600' },
  // BookQuoteRequest
  'bqr_draft':              { label: 'טיוטה',              className: 'bg-slate-100 text-slate-600' },
  'bqr_sent_to_suppliers':  { label: 'נשלחה לספקים',       className: 'bg-blue-100 text-blue-700' },
  'bqr_awaiting_quotes':    { label: 'ממתינה להצעות',       className: 'bg-cyan-100 text-cyan-700' },
  'bqr_partial_quotes':     { label: 'התקבלו חלק מההצעות',  className: 'bg-amber-100 text-amber-700' },
  'bqr_all_quotes_received':{ label: 'התקבלו כל ההצעות',    className: 'bg-teal-100 text-teal-700' },
  'bqr_in_comparison':      { label: 'בהשוואת מחירים',      className: 'bg-indigo-100 text-indigo-700' },
  'bqr_suppliers_selected': { label: 'נבחרו ספקים',         className: 'bg-purple-100 text-purple-700' },
  'bqr_transferred_to_orders':{ label: 'הועברה להזמנות רכש', className: 'bg-green-100 text-green-700' },
  'bqr_closed':             { label: 'נסגרה',              className: 'bg-gray-100 text-gray-600' },
};

const NAMESPACES = {
  PurchaseOrder: 'po',
  QuoteRequest: 'qr',
  SupplierBookList: 'bl',
  SupplierCredit: 'sc',
  BookQuoteRequest: 'bqr',
};

export default function StatusBadge({ status, className, entityType }) {
  const ns = NAMESPACES[entityType];
  const key = ns ? `${ns}_${status}` : status;
  const cfg = configs[key] || { label: status, className: 'bg-gray-100 text-gray-600' };
  return (
    <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', cfg.className, className)}>
      {cfg.label}
    </span>
  );
}

export function useStatusConfig(status, entityType) {
  const ns = NAMESPACES[entityType];
  const key = ns ? `${ns}_${status}` : status;
  return configs[key] || { label: status, className: 'bg-gray-100 text-gray-600' };
}