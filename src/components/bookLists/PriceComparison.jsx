import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { base44 } from '@/api/base44Client';
import { Scale } from 'lucide-react';

export default function PriceComparison({ book, onClose }) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!book) return;
    base44.entities.SupplierBookList.list('-created_date', 500).then(lists => {
      const matches = [];
      for (const list of lists) {
        for (const b of (list.books || [])) {
          const isMatch =
            (book.isbn && b.isbn === book.isbn) ||
            (book.title && b.title?.toLowerCase() === book.title?.toLowerCase() &&
             book.author && b.author?.toLowerCase() === book.author?.toLowerCase() &&
             book.publisher && b.publisher?.toLowerCase() === book.publisher?.toLowerCase());
          if (isMatch) {
            matches.push({
              list_title: list.title,
              supplier_name: list.supplier_name || 'לא ידוע',
              received_date: list.received_date,
              title: b.title,
              author: b.author,
              publisher: b.publisher,
              isbn: b.isbn,
              supplier_price: b.supplier_price || 0,
              discounted_price: b.discounted_price || 0,
            });
          }
        }
      }
      matches.sort((a, b) => (a.discounted_price || a.supplier_price) - (b.discounted_price || b.supplier_price));
      setResults(matches);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [book]);

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto font-heebo" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scale className="w-5 h-5" /> השוואת מחירים
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            {book.title} {book.author ? `· ${book.author}` : ''} {book.isbn ? `· ISBN: ${book.isbn}` : ''}
          </p>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" /></div>
        ) : results.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>לא נמצאו הצעות מחיר נוספות לספר זה</p>
          </div>
        ) : (
          <div className="overflow-x-auto border border-border rounded-xl">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-right p-3 font-medium text-muted-foreground">ספק</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">רשימה</th>
                  <th className="text-right p-3 font-medium text-muted-foreground hidden sm:table-cell">תאריך</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">מחיר ספק</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">מחיר לאחר הנחה</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="p-3 font-medium">{r.supplier_name}</td>
                    <td className="p-3 text-muted-foreground">{r.list_title}</td>
                    <td className="p-3 text-muted-foreground hidden sm:table-cell">{r.received_date ? new Date(r.received_date).toLocaleDateString('he-IL') : '-'}</td>
                    <td className="p-3 font-medium">₪{(r.supplier_price || 0).toFixed(2)}</td>
                    <td className="p-3 font-medium text-green-600">₪{(r.discounted_price || 0).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}