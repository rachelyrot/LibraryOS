import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle } from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import { PRIORITY_LABELS, TASK_STATUS_LABELS } from '@/lib/projectUtils';
import { pdfToRows } from '@/lib/pdfTable';

const HEADER_MAP = {
  'שלב': 'phase', 'phase': 'phase', 'שלבים': 'phase',
  'תחום': 'domain', 'domain': 'domain', 'תחומים': 'domain',
  'תת-תחום': 'sub_domain', 'תת תחום': 'sub_domain', 'תתתחום': 'sub_domain', 'sub_domain': 'sub_domain',
  'משימה': 'task_description', 'משימה מפורטת': 'task_description', 'task': 'task_description', 'תיאור משימה': 'task_description', 'פירוט': 'notes',
  'אחראית': 'assignee', 'אחראי': 'assignee', 'assignee': 'assignee', 'אחראי בפועל': 'assignee', 'אחראי/ת': 'assignee',
  'שותפים': 'partners', 'partners': 'partners', 'שותף': 'partners', 'שותפים לפרויקט': 'partners',
  'גורמים לביצוע': 'executing_parties', 'גורמי ביצוע': 'executing_parties', 'גורמים': 'executing_parties', 'executing_parties': 'executing_parties',
  'איש קשר': 'contact_name', 'שם איש קשר': 'contact_name', 'contact_name': 'contact_name',
  'תפקיד איש קשר': 'contact_role', 'תפקיד': 'contact_role', 'contact_role': 'contact_role',
  'טלפון איש קשר': 'contact_phone', 'טלפון': 'contact_phone', 'contact_phone': 'contact_phone', 'phone': 'contact_phone',
  'מייל איש קשר': 'contact_email', 'מייל': 'contact_email', 'contact_email': 'contact_email', 'email': 'contact_email',
  'משך': 'estimated_duration', 'משך משוער': 'estimated_duration', 'duration': 'estimated_duration',
  'תאריך יעד': 'due_date', 'יעד': 'due_date', 'due_date': 'due_date',
  'תאריך התחלה': 'start_date', 'start_date': 'start_date',
  'עדיפות': 'priority', 'priority': 'priority',
  'סטטוס': 'status', 'status': 'status', 'מצב': 'status',
  'הערות': 'notes', 'notes': 'notes', 'הערה': 'notes',
};

const PRIORITY_MAP = {
  'גבוהה': 'high', 'גבוה': 'high', 'high': 'high',
  'בינונית': 'medium', 'בינוני': 'medium', 'medium': 'medium',
  'נמוכה': 'low', 'נמוך': 'low', 'low': 'low',
};

const STATUS_MAP = {
  'לא התחיל': 'not_started', 'לא התחילה': 'not_started', 'not_started': 'not_started', 'טרם התחיל': 'not_started',
  'בתהליך': 'in_progress', 'in_progress': 'in_progress', 'בעבודה': 'in_progress',
  'ממתין לאישור': 'waiting_approval', 'waiting_approval': 'waiting_approval',
  'ממתין': 'waiting_external', 'ממתין לגורם חיצוני': 'waiting_external', 'waiting': 'waiting_external',
  'הושלם': 'completed', 'הושלמה': 'completed', 'completed': 'completed', 'סיום': 'completed',
  'בוטל': 'cancelled', 'cancelled': 'cancelled',
  'תקוע': 'stuck', 'stuck': 'stuck', 'חסום': 'stuck',
};

function normalizeHeader(h) {
  return String(h || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export default function ImportTasksDialog({ open, onOpenChange, projects, defaultProjectId, onImported }) {
  const [preview, setPreview] = useState([]);
  const [fileName, setFileName] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState(defaultProjectId || '');
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(0);
  const fileRef = useRef(null);

  const reset = () => {
    setPreview([]);
    setFileName('');
    setImported(0);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setImported(0);
    try {
      const data = await file.arrayBuffer();
      // PDF: הטבלה נבנית מחדש מהטקסט (pdfToRows) לאותה צורה כמו שורות אקסל,
      // ומשם אותו מיפוי עמודות
      let rows;
      if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
        rows = await pdfToRows(data, {
          isHeader: (text) => !!HEADER_MAP[normalizeHeader(text)],
          fallbackHeader: 'משימה',
        });
      } else {
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
      }

      const headers = Object.keys(rows[0] || {}).map(h => HEADER_MAP[normalizeHeader(h)]);
      const hasTask = headers.includes('task_description');
      const hasDetail = Object.keys(rows[0] || {}).some(h => normalizeHeader(h) === 'פירוט');
      const parsed = rows.map((row) => {
        const task = {
          phase: '', domain: '', sub_domain: '', task_description: '', assignee: '', partners: '',
          executing_parties: '', contact_name: '', contact_role: '', contact_phone: '', contact_email: '',
          start_date: '', due_date: '', estimated_duration: '', priority: 'medium', status: 'not_started', notes: ''
        };
        Object.entries(row).forEach(([key, val]) => {
          const norm = normalizeHeader(key);
          const mapped = HEADER_MAP[norm] || HEADER_MAP[key?.trim()?.toLowerCase()];
          if (!mapped || !val) return;
          if (mapped === 'priority') {
            task.priority = PRIORITY_MAP[String(val).trim().toLowerCase()] || 'medium';
          } else if (mapped === 'status') {
            task.status = STATUS_MAP[String(val).trim().toLowerCase()] || 'not_started';
          } else {
            task[mapped] = String(val).trim();
          }
        });
        // "פירוט" הוא שם העמודה של notes (כמו בטבלה ובייצוא). בקובץ ישן בלי עמודת
        // "משימה" הוא היה תיאור המשימה — אז הוא נשאר שם
        if (!task.task_description && task.notes && hasDetail && !hasTask) { task.task_description = task.notes; task.notes = ''; }
        return task;
      }).filter(t => t.task_description?.trim());

      setPreview(parsed);
      if (parsed.length === 0) toast.warning('לא נמצאו שורות עם משימות בקובץ — ודאי שיש עמודת "משימה" או "תיאור משימה"');
      else toast.success(`נמצאו ${parsed.length} משימות. עמודות שלא זוהו הושלמו ידנית`);
    } catch (err) {
      toast.error('שגיאה בקריאת הקובץ');
    }
  };

  const handleImport = async () => {
    if (!selectedProjectId) { toast.error('יש לבחור פרויקט'); return; }
    if (preview.length === 0) return;
    setImporting(true);
    const project = projects.find(p => p.id === selectedProjectId);
    const projectName = project?.name || '';
    let success = 0;
    for (const task of preview) {
      try {
        await base44.entities.ProjectTask.create({
          ...task,
          project_id: selectedProjectId,
          project_name: projectName,
          progress_percentage: task.status === 'completed' ? 100 : 0,
          // משימה שהושלמה היא אבן דרך — עם תאריך השלמה
          ...(task.status === 'completed' ? { completed_date: new Date().toISOString().split('T')[0] } : {}),
        });
        success++;
      } catch (e) { /* continue on error */ }
    }
    setImporting(false);
    setImported(success);
    toast.success(`${success} משימות יובאו בהצלחה`);
    if (onImported) onImported(success);
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>ייבוא משימות מאקסל או PDF</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>פרויקט יעד *</Label>
              <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                <SelectTrigger><SelectValue placeholder="בחר פרויקט" /></SelectTrigger>
                <SelectContent>{projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>קובץ Excel או PDF</Label>
              <div className="flex items-center gap-2">
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.pdf,application/pdf" onChange={handleFile} className="hidden" id="import-file" />
                <Button variant="outline" onClick={() => document.getElementById('import-file').click()} className="gap-2 w-full">
                  <Upload className="w-4 h-4" /> {fileName || 'בחר קובץ'}
                </Button>
              </div>
            </div>
          </div>

          <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-2">
            עמודות מזוהות: תחום, תת-תחום, משימה/פירוט, אחראי בפועל, שותפים, גורמים לביצוע, איש קשר, טלפון, מייל, תאריך יעד, משך משוער, עדיפות, סטטוס, הערות.
            עמודות חסרות לא יפילו את הקובץ — יתאפשר להשלים ידנית.
            ב-PDF הטבלה נקראת מתוך הטקסט שבקובץ — כדאי לעבור על התצוגה המקדימה לפני הייבוא. PDF סרוק (תמונה) לא ניתן לקריאה; PDF בלי טבלה — כל שורה תהיה משימה.
          </div>

          {preview.length > 0 && (
            <>
              <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 rounded-lg p-2">
                <CheckCircle2 className="w-4 h-4" />
                נמצאו {preview.length} משימות לייבוא
              </div>
              <div className="border border-border rounded-xl overflow-auto max-h-[40vh]">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr className="border-b border-border">
                      <th className="text-right p-2 font-medium">תחום</th>
                      <th className="text-right p-2 font-medium">תת-תחום</th>
                      <th className="text-right p-2 font-medium">משימה</th>
                      <th className="text-right p-2 font-medium">אחראית</th>
                      <th className="text-right p-2 font-medium hidden md:table-cell">גורמים לביצוע</th>
                      <th className="text-center p-2 font-medium">עדיפות</th>
                      <th className="text-center p-2 font-medium">סטטוס</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((t, i) => (
                      <tr key={i} className="border-b border-border/50">
                        <td className="p-2">{t.domain || '-'}</td>
                        <td className="p-2">{t.sub_domain || '-'}</td>
                        <td className="p-2 max-w-xs truncate">{t.task_description}</td>
                        <td className="p-2">{t.assignee || '-'}</td>
                        <td className="p-2 hidden md:table-cell">{t.executing_parties || '-'}</td>
                        <td className="p-2 text-center">{PRIORITY_LABELS[t.priority] || t.priority}</td>
                        <td className="p-2 text-center">{TASK_STATUS_LABELS[t.status] || t.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {imported > 0 && (
            <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 rounded-lg p-2">
              <CheckCircle2 className="w-4 h-4" /> {imported} משימות יובאו בהצלחה
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>סגור</Button>
          <Button onClick={handleImport} disabled={importing || preview.length === 0} className="gap-2">
            <FileSpreadsheet className="w-4 h-4" />
            {importing ? 'מייבא...' : `ייבא ${preview.length} משימות`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}