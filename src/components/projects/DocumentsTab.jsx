import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, FileText, Download, Upload, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import { formatDate } from '@/lib/projectUtils';
import { canCreateTasks } from '@/lib/permissions';

const DOC_TYPE_LABELS = {
  approval: 'אישור',
  quote: 'הצעת מחיר',
  plan: 'תוכנית עבודה',
  contract: 'חוזה',
  image: 'תמונה',
  other: 'אחר',
};

export default function DocumentsTab({ project, user, documents, onLoad }) {
  const [uploading, setUploading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', document_type: 'other', notes: '' });
  const [pendingUrl, setPendingUrl] = useState('');
  const fileRef = useRef(null);
  const canManage = canCreateTasks(user);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const res = await base44.integrations.Core.UploadFile({ file });
      setPendingUrl(res.file_url);
      setForm(f => ({ ...f, name: f.name || file.name }));
      toast.success('קובץ הועלה');
    } catch (err) {
      toast.error('שגיאה בהעלאת קובץ');
    }
    setUploading(false);
  };

  const handleSave = async () => {
    if (!pendingUrl || !form.name?.trim()) { toast.error('יש להעלות קובץ ולתת שם'); return; }
    try {
      await base44.entities.ProjectDocument.create({
        ...form,
        file_url: pendingUrl,
        project_id: project.id,
        project_name: project.name,
        uploaded_by: user?.full_name || '',
      });
      toast.success('מסמך נוסף');
      setForm({ name: '', document_type: 'other', notes: '' });
      setPendingUrl('');
      setShowForm(false);
      if (fileRef.current) fileRef.current.value = '';
      onLoad();
    } catch (e) { toast.error('שגיאה בשמירה'); }
  };

  const handleDelete = async (doc) => {
    if (!confirm('למחוק מסמך זה?')) return;
    try { await base44.entities.ProjectDocument.delete(doc.id); toast.success('נמחק'); onLoad(); }
    catch (e) { toast.error('שגיאה במחיקה'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">מסמכים ({documents.length})</h3>
        {canManage && <Button onClick={() => setShowForm(!showForm)} className="gap-2"><Plus className="w-4 h-4" /> העלאת מסמך</Button>}
      </div>

      {showForm && (
        <div className="bg-card rounded-xl p-4 border border-border space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>קובץ</Label>
              <div className="flex items-center gap-2">
                <input ref={fileRef} type="file" onChange={handleUpload} className="hidden" id="doc-file" />
                <Button variant="outline" onClick={() => document.getElementById('doc-file').click()} className="gap-2 w-full" disabled={uploading}>
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {pendingUrl ? 'קובץ הועלה ✓' : 'בחר קובץ'}
                </Button>
              </div>
            </div>
            <div>
              <Label>סוג מסמך</Label>
              <Select value={form.document_type} onValueChange={v => setForm(f => ({ ...f, document_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(DOC_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>שם מסמך *</Label>
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="לדוגמה: תוכנית עבודה 2026" />
          </div>
          <div>
            <Label>הערות</Label>
            <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSave}>שמור מסמך</Button>
            <Button variant="outline" onClick={() => { setShowForm(false); setPendingUrl(''); }}>ביטול</Button>
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
        {documents.map(doc => (
          <div key={doc.id} className="bg-card rounded-xl p-4 border border-border flex items-start gap-3">
            <FileText className="w-8 h-8 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{doc.name}</p>
              <p className="text-xs text-muted-foreground">{DOC_TYPE_LABELS[doc.document_type] || doc.document_type}</p>
              {doc.uploaded_by && <p className="text-xs text-muted-foreground">הועלה ע"י {doc.uploaded_by}</p>}
              {doc.notes && <p className="text-xs text-muted-foreground mt-1 truncate">{doc.notes}</p>}
              <div className="flex gap-2 mt-2">
                <a href={doc.file_url} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="sm" className="h-7 gap-1 text-xs"><Download className="w-3 h-3" /> הורד</Button>
                </a>
                {canManage && <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => handleDelete(doc)}><Trash2 className="w-3.5 h-3.5" /></Button>}
              </div>
            </div>
          </div>
        ))}
        {documents.length === 0 && !showForm && <div className="col-span-full text-center py-12 text-muted-foreground">אין מסמכים</div>}
      </div>
    </div>
  );
}