import { useMemo, useState } from 'react';
import { Folder, FolderOpen, FileText, Download, Upload, Loader2, Trash2, ListTodo, ChevronLeft } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import { canCreateTasks } from '@/lib/permissions';
import { formatDate } from '@/lib/projectUtils';
import { cn } from '@/lib/utils';
import { fileNameFromUrl } from './grid/popoverCellEditors';

const DOC_TYPE_LABELS = {
  approval: 'אישור',
  quote: 'הצעת מחיר',
  plan: 'תוכנית עבודה',
  contract: 'חוזה',
  image: 'תמונה',
  other: 'אחר',
};

/*
 * קבצי הפרויקט בתיקיות לפי תחומים ותתי-תחומים (מלשונית התחומים).
 * שני מקורות, מסונכרנים:
 *  - מסמכים שהועלו כאן (project_documents, עם domain / sub_domain — מיגרציה 0026)
 *  - קבצים שצורפו למשימות (project_tasks.file_urls) — מופיעים לבד בתיקייה של
 *    התחום / תת-התחום של המשימה; מחיקה כאן מסירה אותם מהמשימה.
 * תיקייה: 'all' | 'none' (ללא תחום) | 'd:<תחום>' | 's:<תחום>\u0000<תת-תחום>'.
 */
const SEP = '\u0000';
const folderKey = (domain, sub) => (!domain ? 'none' : sub ? `s:${domain}${SEP}${sub}` : `d:${domain}`);
const parseKey = (key) => {
  if (key.startsWith('s:')) { const [domain, sub] = key.slice(2).split(SEP); return { domain, sub }; }
  if (key.startsWith('d:')) return { domain: key.slice(2), sub: null };
  return { domain: null, sub: null };
};

function inFolder(file, key) {
  if (key === 'all') return true;
  if (key === 'none') return !file.domain;
  const { domain, sub } = parseKey(key);
  if (file.domain !== domain) return false;
  return sub == null || file.sub_domain === sub;
}

export default function DocumentsTab({ project, user, documents, tasks = [], domains = [], onLoad }) {
  const canManage = canCreateTasks(user);
  const [folder, setFolder] = useState('all');
  const [uploading, setUploading] = useState(false);

  // כל הקבצים, בצורה אחת
  const files = useMemo(() => [
    ...documents.map(d => ({
      kind: 'doc', id: d.id, doc: d, name: d.name, url: d.file_url,
      domain: d.domain || null, sub_domain: d.sub_domain || null,
      by: d.uploaded_by, date: d.created_date, type: d.document_type,
    })),
    ...tasks.flatMap(t => (t.file_urls || []).map((url, i) => ({
      kind: 'task', id: `${t.id}-${i}`, task: t, index: i, name: fileNameFromUrl(url), url,
      domain: t.domain || null, sub_domain: t.sub_domain || null,
      by: t.assignee, date: t.updated_date,
    }))),
  ], [documents, tasks]);

  // עץ התיקיות: התחומים ותתי-התחומים מלשונית התחומים, ועוד שמות שמופיעים רק
  // בקבצים (תחום שהוקלד פעם ידנית), כדי שאף קובץ לא ייעלם
  const tree = useMemo(() => {
    const top = domains.filter(d => !d.parent_domain_id);
    const parentName = (s) => s.parent_domain_name || top.find(d => d.id === s.parent_domain_id)?.name || '';
    const map = new Map(top.map(d => [d.name, new Set()]));
    for (const s of domains.filter(d => d.parent_domain_id)) {
      const p = parentName(s);
      if (!map.has(p)) map.set(p, new Set());
      map.get(p).add(s.name);
    }
    for (const f of files) {
      if (!f.domain) continue;
      if (!map.has(f.domain)) map.set(f.domain, new Set());
      if (f.sub_domain) map.get(f.domain).add(f.sub_domain);
    }
    return [...map.entries()].filter(([name]) => name).map(([name, subs]) => ({ name, subs: [...subs] }));
  }, [domains, files]);

  const [open, setOpen] = useState(() => new Set());
  const toggleOpen = (name) => setOpen(s => { const n = new Set(s); n.has(name) ? n.delete(name) : n.add(name); return n; });
  const count = (key) => files.filter(f => inFolder(f, key)).length;
  const shown = files.filter(f => inFolder(f, folder))
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

  // כל התיקיות, לבחירה ב"העברה לתיקייה"
  const folderOptions = [
    { key: 'none', label: 'ללא תחום' },
    ...tree.flatMap(d => [{ key: folderKey(d.name), label: d.name }, ...d.subs.map(s => ({ key: folderKey(d.name, s), label: `${d.name} › ${s}` }))]),
  ];
  const folderLabel = folder === 'all' ? 'כל הקבצים' : folderOptions.find(o => o.key === folder)?.label || '';

  // ── פעולות ───────────────────────────────────────────────────
  const uploadHere = async (e) => {
    const list = [...(e.target.files || [])];
    e.target.value = '';
    if (!canManage || list.length === 0) return;
    const { domain, sub } = parseKey(folder);
    setUploading(true);
    let ok = 0;
    for (const file of list) {
      try {
        const res = await base44.integrations.Core.UploadFile({ file });
        await base44.entities.ProjectDocument.create({
          name: file.name, document_type: 'other', file_url: res.file_url,
          project_id: project.id, project_name: project.name,
          uploaded_by: user?.full_name || user?.email || '',
          domain, sub_domain: sub,
        });
        ok++;
      } catch {
        toast.error(`שגיאה בהעלאת ${file.name}`);
      }
    }
    setUploading(false);
    if (ok) { toast.success(ok === 1 ? 'הקובץ הועלה' : `${ok} קבצים הועלו`); onLoad(); }
  };

  const updateDoc = async (doc, patch) => {
    try { await base44.entities.ProjectDocument.update(doc.id, patch); onLoad(); }
    catch { toast.error('שגיאה בשמירה'); }
  };

  const remove = async (f) => {
    if (!canManage) return;
    const msg = f.kind === 'task'
      ? `להסיר את "${f.name}" מהמשימה "${f.task.task_description}"?`
      : `למחוק את "${f.name}"?`;
    if (!window.confirm(msg)) return;
    try {
      if (f.kind === 'task') {
        await base44.entities.ProjectTask.update(f.task.id, { file_urls: (f.task.file_urls || []).filter((_, i) => i !== f.index) });
      } else {
        await base44.entities.ProjectDocument.delete(f.id);
      }
      toast.success('נמחק');
      onLoad();
    } catch { toast.error('שגיאה במחיקה'); }
  };

  const FolderButton = ({ k, label, depth = 0, icon }) => (
    <button type="button" onClick={() => setFolder(k)}
      className={cn('w-full flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-right transition-colors',
        depth && 'pr-7', folder === k ? 'bg-primary/10 text-primary font-semibold' : 'hover:bg-muted')}>
      {icon || (folder === k ? <FolderOpen className="w-4 h-4 shrink-0" /> : <Folder className="w-4 h-4 shrink-0 text-amber-500" />)}
      <span className="truncate flex-1">{label}</span>
      <span className="text-xs text-muted-foreground">{count(k)}</span>
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <h3 className="text-lg font-semibold">קבצים ({files.length})</h3>
        {canManage && (
          <label className={cn('inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium cursor-pointer hover:opacity-90', uploading && 'opacity-60 pointer-events-none')}>
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? 'מעלה…' : `העלאת קבצים ל${folder === 'all' ? 'פרויקט' : `"${folderLabel}"`}`}
            <input type="file" multiple className="hidden" onChange={uploadHere} disabled={uploading} />
          </label>
        )}
      </div>

      <div className="grid md:grid-cols-[240px_1fr] gap-4">
        {/* Folders */}
        <div className="border border-border rounded-xl p-2 space-y-0.5 h-fit">
          <FolderButton k="all" label="כל הקבצים" icon={<FileText className="w-4 h-4 shrink-0" />} />
          {tree.map(d => (
            <div key={d.name}>
              <div className="flex items-center">
                {d.subs.length > 0 ? (
                  <button type="button" onClick={() => toggleOpen(d.name)} className="p-1 text-muted-foreground hover:text-foreground" aria-label="פתיחת תתי-תחומים">
                    <ChevronLeft className={cn('w-3.5 h-3.5 transition-transform', open.has(d.name) && '-rotate-90')} />
                  </button>
                ) : <span className="w-[22px]" />}
                <div className="flex-1 min-w-0"><FolderButton k={folderKey(d.name)} label={d.name} /></div>
              </div>
              {open.has(d.name) && d.subs.map(s => <FolderButton key={s} k={folderKey(d.name, s)} label={s} depth={1} />)}
            </div>
          ))}
          <FolderButton k="none" label="ללא תחום" />
          {tree.length === 0 && <p className="text-[11px] text-muted-foreground px-2 pt-1">התיקיות נבנות מלשונית התחומים</p>}
        </div>

        {/* Files */}
        <div className="border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 bg-muted/40 border-b border-border text-sm font-semibold">{folderLabel} · {shown.length}</div>
          {shown.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">אין קבצים בתיקייה הזו</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground border-b border-border">
                    <th className="text-right font-medium p-2.5">שם</th>
                    <th className="text-right font-medium p-2.5 whitespace-nowrap">מקור</th>
                    <th className="text-right font-medium p-2.5 whitespace-nowrap">תיקייה</th>
                    <th className="text-right font-medium p-2.5 whitespace-nowrap">תאריך</th>
                    <th className="w-20" />
                  </tr>
                </thead>
                <tbody>
                  {shown.map(f => (
                    <tr key={`${f.kind}-${f.id}`} className="border-b border-border/40 align-top">
                      <td className="p-2.5 min-w-[200px]">
                        {f.kind === 'doc' && canManage ? (
                          <input defaultValue={f.name} key={f.name}
                            className="w-full bg-transparent rounded px-1 py-0.5 border border-transparent hover:border-border focus:border-primary outline-none font-medium"
                            onBlur={e => { const v = e.target.value.trim(); if (v && v !== f.name) updateDoc(f.doc, { name: v }); }} />
                        ) : <span className="font-medium px-1">{f.name}</span>}
                        {f.by && <p className="text-[11px] text-muted-foreground px-1">{f.by}</p>}
                      </td>
                      <td className="p-2.5 text-xs">
                        {f.kind === 'task' ? (
                          <span className="inline-flex items-center gap-1 text-blue-700"><ListTodo className="w-3.5 h-3.5 shrink-0" /> משימה: {f.task.task_description}</span>
                        ) : canManage ? (
                          <select value={f.type || 'other'} onChange={e => updateDoc(f.doc, { document_type: e.target.value })}
                            className="bg-transparent border border-border rounded px-1 py-0.5 text-xs">
                            {Object.entries(DOC_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                          </select>
                        ) : DOC_TYPE_LABELS[f.type] || 'אחר'}
                      </td>
                      <td className="p-2.5 text-xs">
                        {/* קובץ של משימה זז עם המשימה (התחום שלה); מסמך — אפשר להעביר */}
                        {f.kind === 'doc' && canManage ? (
                          <select value={folderKey(f.domain, f.sub_domain)}
                            onChange={e => { const { domain, sub } = parseKey(e.target.value); updateDoc(f.doc, { domain, sub_domain: sub }); }}
                            className="bg-transparent border border-border rounded px-1 py-0.5 text-xs max-w-[180px]">
                            {!folderOptions.some(o => o.key === folderKey(f.domain, f.sub_domain)) && (
                              <option value={folderKey(f.domain, f.sub_domain)}>{[f.domain, f.sub_domain].filter(Boolean).join(' › ')}</option>
                            )}
                            {folderOptions.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                          </select>
                        ) : (
                          <span className="text-muted-foreground">{[f.domain, f.sub_domain].filter(Boolean).join(' › ') || 'ללא תחום'}</span>
                        )}
                      </td>
                      <td className="p-2.5 text-xs whitespace-nowrap text-muted-foreground">{formatDate(f.date)}</td>
                      <td className="p-2.5">
                        <div className="flex items-center gap-1 justify-end">
                          <a href={f.url} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded hover:bg-muted text-primary" title="הורדה"><Download className="w-4 h-4" /></a>
                          {canManage && (
                            <button type="button" onClick={() => remove(f)} className="p-1.5 rounded hover:bg-muted" title={f.kind === 'task' ? 'הסרה מהמשימה' : 'מחיקה'}>
                              <Trash2 className="w-4 h-4 text-red-400" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
