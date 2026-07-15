import { useState } from 'react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Download, Upload, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import { canCreateTasks } from '@/lib/permissions';
import ProjectDataGrid from './grid/ProjectDataGrid';
import { textColumn, enumColumn } from './grid/columnHelpers';
import { makeGridSaveHandler } from './grid/gridSave';

const DOC_TYPE_LABELS = {
  approval: 'אישור',
  quote: 'הצעת מחיר',
  plan: 'תוכנית עבודה',
  contract: 'חוזה',
  image: 'תמונה',
  other: 'אחר',
};
const DOC_TYPE_COLORS = {
  approval: 'bg-green-100 text-green-700',
  quote: 'bg-blue-100 text-blue-700',
  plan: 'bg-purple-100 text-purple-700',
  contract: 'bg-amber-100 text-amber-700',
  image: 'bg-pink-100 text-pink-700',
  other: 'bg-gray-100 text-gray-700',
};

// file_url/name are NOT NULL at the DB level, so unlike the other tabs' "create an
// empty placeholder row, edit cell-by-cell" flow, a document can't be created
// before a file is actually chosen. This small popover (not a big modal form) is
// the deliberate exception — see plan §11 point 7.
function AddDocumentButton({ project, user, onLoad }) {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [docType, setDocType] = useState('other');
  const [fileUrl, setFileUrl] = useState('');

  const reset = () => { setName(''); setDocType('other'); setFileUrl(''); };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const res = await base44.integrations.Core.UploadFile({ file });
      setFileUrl(res.file_url);
      setName((n) => n || file.name);
    } catch (err) {
      toast.error('שגיאה בהעלאת קובץ');
    }
    setUploading(false);
  };

  const handleSave = async () => {
    if (!fileUrl || !name.trim()) { toast.error('יש להעלות קובץ ולתת שם'); return; }
    setSaving(true);
    try {
      await base44.entities.ProjectDocument.create({
        name, document_type: docType, file_url: fileUrl,
        project_id: project.id, project_name: project.name,
        uploaded_by: user?.full_name || user?.email || '',
      });
      toast.success('מסמך נוסף');
      reset();
      setOpen(false);
      onLoad();
    } catch (e) { toast.error('שגיאה בשמירה'); }
    setSaving(false);
  };

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <PopoverTrigger asChild>
        <Button className="gap-2"><Plus className="w-4 h-4" /> העלאת מסמך</Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 font-heebo"
        dir="rtl"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <div className="space-y-3">
          <div>
            <Label>קובץ</Label>
            <label className="flex items-center justify-center gap-2 text-sm border border-dashed border-border rounded-lg py-2 cursor-pointer hover:border-primary transition-colors">
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {fileUrl ? 'קובץ הועלה ✓' : uploading ? 'מעלה...' : 'בחר קובץ'}
              <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
            </label>
          </div>
          <div>
            <Label>שם מסמך *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9" />
          </div>
          <div>
            <Label>סוג מסמך</Label>
            <Select value={docType} onValueChange={setDocType}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(DOC_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Button onClick={handleSave} disabled={saving || uploading} className="w-full">{saving ? 'שומר...' : 'הוסף מסמך'}</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default function DocumentsTab({ project, user, documents, setDocuments, onLoad }) {
  const canManage = canCreateTasks(user);

  const handleDelete = async (doc) => {
    if (!confirm('למחוק מסמך זה?')) return;
    try { await base44.entities.ProjectDocument.delete(doc.id); toast.success('נמחק'); onLoad(); }
    catch (e) { toast.error('שגיאה במחיקה'); }
  };

  const handleRowsChange = makeGridSaveHandler(base44.entities.ProjectDocument, setDocuments, { onError: onLoad });

  const columns = [
    textColumn('name', 'שם מסמך', { editable: canManage, width: 200 }),
    enumColumn('document_type', 'סוג', DOC_TYPE_LABELS, DOC_TYPE_COLORS, { editable: canManage, width: 130 }),
    {
      key: 'file_url', name: 'קובץ', width: 80, editable: false, resizable: false,
      renderCell({ row }) {
        return (
          <div className="w-full h-full flex items-center justify-center">
            <a href={row.file_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:opacity-70">
              <Download className="w-4 h-4" />
            </a>
          </div>
        );
      },
    },
    textColumn('uploaded_by', 'הועלה ע"י', { editable: false, width: 130 }),
    textColumn('notes', 'הערות', { editable: canManage, width: 200 }),
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">מסמכים ({documents.length})</h3>
        {canManage && <AddDocumentButton project={project} user={user} onLoad={onLoad} />}
      </div>

      <ProjectDataGrid
        rows={documents}
        columns={columns}
        onRowsChange={handleRowsChange}
        readOnly={!canManage}
        onDeleteRow={handleDelete}
        emptyMessage="אין מסמכים"
      />
    </div>
  );
}
