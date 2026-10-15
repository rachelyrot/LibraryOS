import {
  VIEWS, MONTHS, amountColumns, itemsForView, groupByCategory, parameterRows, monthlySchedule,
  YEAR_PCT_LABELS, utilizationLabel, RULE_STATUS_LABELS, num, formatMoney, formatPct,
} from '@/lib/workPlan';

/**
 * ייצוא תכנית העבודה: קובץ Excel (טופס הפרמטרים, פירוט לכל תצוגה ולוח ניצול
 * חודשי) ומסמך להדפסה/PDF לתצוגה הנבחרת.
 */

const viewLabel = (view) => VIEWS.find(v => v.id === view)?.label || '';
const round = (v) => Math.round(num(v) * 100) / 100;
const pct1 = (v) => Math.round(num(v) * 10) / 10;

/** גיליון בנוסח טופס המשרד: פרמטר, סכומים ואחוזים לכל מקור, הגבלה ועמידה בה. */
function formSheetRows(plan, items) {
  const all = parameterRows(items, 'all');
  const mun = parameterRows(items, 'municipal');
  const min = parameterRows(items, 'ministry');
  const find = (res, category) => res.rows.find(r => r.category === category) || { amount: 0, pct: 0, status: null };

  const rows = [
    [`תכנון התקציב של הספרייה לשנת ${plan.year}`],
    [plan.title],
    [],
    // עמידה בהגבלה נבדקת פעם אחת, על התכנית כולה ומול הבסיס של ההגבלה
    // (evaluateRules) — לכן עמודה אחת, ולא אחת לכל מקור
    ['פרמטר', 'סה"כ', 'אחוז', 'תקציב עירוני', 'אחוז', 'משרד התרבות', 'אחוז', 'הגבלה', 'עמידה בהגבלה', 'אחוז מול בסיס ההגבלה', 'הערה'],
  ];
  for (const r of all.rows) {
    const m = find(mun, r.category);
    const k = find(min, r.category);
    rows.push([
      r.category, round(r.amount), pct1(r.pct), round(m.amount), pct1(m.pct), round(k.amount), pct1(k.pct),
      r.rule, r.status ? RULE_STATUS_LABELS[r.status] : '', r.status && r.rulePct != null ? pct1(r.rulePct) : '',
      r.param?.note || '',
    ]);
  }
  rows.push(['סה"כ', round(all.total), all.total > 0 ? 100 : 0, round(mun.total), mun.total > 0 ? 100 : 0, round(min.total), min.total > 0 ? 100 : 0, '', '', '', '']);
  return rows;
}

function detailSheetRows(plan, items, view) {
  const cols = amountColumns(view);
  const rows = [
    [plan.title],
    [`שנת ${plan.year} · פירוט · ${viewLabel(view)}`],
    [],
    ['פרמטר', 'פירוט', 'תיאור', 'זמן ניצול', 'קהל יעד', 'משתתפים צפויים', ...cols.map(c => c.label), 'הערות'],
  ];
  const groups = groupByCategory(itemsForView(items, view), { includeEmpty: false });
  for (const g of groups) {
    for (const i of g.items) {
      rows.push([
        g.category, i.activity_name || '', i.description || '', utilizationLabel(i) || 'לא נקבע',
        i.target_audience || '', i.expected_participants != null ? num(i.expected_participants) : '',
        ...cols.map(c => round(c.value(i))), i.notes || '',
      ]);
    }
    rows.push([`סה"כ ${g.category}`, '', '', '', '', '', ...cols.map(c => round(g.items.reduce((s, i) => s + c.value(i), 0))), '']);
    rows.push([]);
  }
  const all = groups.flatMap(g => g.items);
  rows.push(['סה"כ התכנית', '', '', '', '', '', ...cols.map(c => round(all.reduce((s, i) => s + c.value(i), 0))), '']);
  return rows;
}

/**
 * @param {string[]} headers שמות החודשים, או YEAR_PCT_LABELS — אותם סכומים,
 *   כשבאחוזים כל עמודה היא חודש (100/12) והכותרת היא אחוז השנה בסופו
 */
function scheduleSheetRows(plan, items, view, headers = MONTHS) {
  const s = monthlySchedule(items, view);
  const rows = [
    [plan.title],
    [`שנת ${plan.year} · לוח ניצול ${headers === MONTHS ? 'חודשי' : 'לפי אחוזי שנה'} · ${viewLabel(view)}`],
    ['הסכום של כל שורה מחולק שווה בין החודשים בתקופת הניצול שלה'],
    [],
    ['פרמטר', ...headers, 'לא נקבע', 'סה"כ'],
  ];
  for (const g of s.groups) rows.push([g.category, ...g.months.map(Math.round), Math.round(g.unscheduled), round(g.total)]);
  rows.push(['סה"כ', ...s.months.map(Math.round), Math.round(s.unscheduled), round(s.total)]);
  return rows;
}

export async function exportWorkPlanExcel(plan, items) {
  const { utils, writeFile } = await import('xlsx');
  const wb = utils.book_new();

  const addSheet = (rows, name, widths) => {
    const ws = utils.aoa_to_sheet(rows);
    ws['!cols'] = widths.map(wch => ({ wch }));
    utils.book_append_sheet(wb, ws, name.slice(0, 31));
  };

  addSheet(formSheetRows(plan, items), 'תכנון לפי פרמטרים', [46, 14, 8, 14, 8, 14, 8, 30, 16, 12, 50]);
  for (const v of VIEWS) {
    addSheet(detailSheetRows(plan, items, v.id), `פירוט - ${v.label}`, [40, 30, 36, 16, 16, 12, ...amountColumns(v.id).map(() => 14), 28]);
  }
  addSheet(scheduleSheetRows(plan, items, 'all'), 'לוח ניצול - כל התכנית', [46, ...MONTHS.map(() => 11), 11, 14]);
  addSheet(scheduleSheetRows(plan, items, 'ministry'), 'לוח ניצול - משרד התרבות', [46, ...MONTHS.map(() => 11), 11, 14]);
  addSheet(scheduleSheetRows(plan, items, 'all', YEAR_PCT_LABELS), 'אחוזים - כל התכנית', [46, ...MONTHS.map(() => 11), 11, 14]);
  addSheet(scheduleSheetRows(plan, items, 'ministry', YEAR_PCT_LABELS), 'אחוזים - משרד התרבות', [46, ...MONTHS.map(() => 11), 11, 14]);

  // גיליונות מימין לשמאל
  wb.Workbook = { Views: [{ RTL: true }] };

  writeFile(wb, `תכנון_תקציב_${plan.year}.xlsx`);
}

const escapeHtml = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * פותח חלון עם מסמך מעוצב להדפסה ומפעיל את חלון ההדפסה של הדפדפן — משם אפשר גם
 * "שמירה כ-PDF". חלון נפרד ולא הדפסת הדף עצמו: המעטפת של האפליקציה (תפריט צד,
 * גלילה פנימית) הייתה נחתכת לעמוד אחד בהדפסה.
 *
 * @returns {boolean} false אם הדפדפן חסם את החלון
 */
export function printWorkPlan(plan, items, view) {
  const cols = amountColumns(view);
  const form = parameterRows(items, view);
  const schedule = monthlySchedule(items, view);
  const groups = groupByCategory(itemsForView(items, view), { includeEmpty: false });
  const all = groups.flatMap(g => g.items);

  const formRows = form.rows.map(r => `
    <tr>
      <td>${escapeHtml(r.category)}${r.param?.note ? `<div class="desc">${escapeHtml(r.param.note)}</div>` : ''}</td>
      <td class="num">${formatMoney(r.amount)}</td>
      <td class="num strong">${formatPct(r.pct)}</td>
      <td class="rule">${escapeHtml(r.rule)}</td>
      <td class="${r.status === 'ok' ? 'ok' : r.status ? 'bad' : ''}">${r.status ? `${RULE_STATUS_LABELS[r.status]} (${formatPct(r.rulePct)})` : ''}</td>
    </tr>`).join('');

  const scheduleRows = schedule.groups.map(g => `<tr>
      <td>${escapeHtml(g.category)}</td>
      ${g.months.map(v => `<td class="num">${v > 0 ? formatMoney(v, 0) : '-'}</td>`).join('')}
      <td class="num">${g.unscheduled > 0 ? formatMoney(g.unscheduled, 0) : '-'}</td>
      <td class="num strong">${formatMoney(g.total, 0)}</td>
    </tr>`).join('');

  const detailBody = groups.map(g => `
    <tr class="group"><td colspan="${4 + cols.length}">${escapeHtml(g.category)}</td></tr>
    ${g.items.map(i => `
      <tr>
        <td><strong>${escapeHtml(i.activity_name)}</strong>${i.description ? `<div class="desc">${escapeHtml(i.description)}</div>` : ''}</td>
        <td>${escapeHtml(utilizationLabel(i) || 'לא נקבע')}</td>
        <td>${escapeHtml(i.target_audience)}${i.expected_participants != null ? ` <span class="desc">(${num(i.expected_participants).toLocaleString('he-IL')} משתתפים)</span>` : ''}</td>
        ${cols.map(c => `<td class="num">${formatMoney(c.value(i))}</td>`).join('')}
        <td>${escapeHtml(i.notes)}</td>
      </tr>`).join('')}
    <tr class="subtotal">
      <td colspan="3">סה"כ ${escapeHtml(g.category)}</td>
      ${cols.map(c => `<td class="num">${formatMoney(g.items.reduce((s, i) => s + c.value(i), 0))}</td>`).join('')}
      <td></td>
    </tr>`).join('');

  const html = `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<title>${escapeHtml(plan.title)} — ${escapeHtml(viewLabel(view))}</title>
<style>
  @page { size: A4 landscape; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Heebo', 'Arial', sans-serif; color: #111; font-size: 11px; margin: 0; }
  header { border-bottom: 2px solid #333; padding-bottom: 8px; margin-bottom: 14px; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .meta { color: #555; font-size: 12px; }
  h2 { font-size: 14px; margin: 20px 0 6px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #999; padding: 5px 7px; text-align: right; vertical-align: top; }
  th { background: #dfe7f5; font-weight: 700; }
  td.num, th.num { text-align: left; direction: ltr; white-space: nowrap; }
  td.strong { font-weight: 700; }
  td.rule { color: #c00; font-weight: 700; }
  td.ok { color: #1a7f37; font-weight: 700; }
  td.bad { color: #c00; font-weight: 700; }
  tr.group td { background: #eef2fa; font-weight: 700; font-size: 12px; }
  tr.subtotal td { background: #fafafa; font-weight: 700; }
  tr.total td { background: #c9d6ee; font-weight: 700; font-size: 12px; }
  .desc { color: #555; margin-top: 2px; font-weight: normal; }
  .note { color: #666; font-size: 10px; margin: 4px 0 0; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  .page-break { page-break-before: always; }
  .signatures { display: flex; gap: 60px; margin-top: 40px; }
  .signatures div { border-top: 1px solid #333; padding-top: 4px; min-width: 180px; }
</style>
</head>
<body>
  <header>
    <h1>תכנון התקציב של הספרייה לשנת ${escapeHtml(plan.year)}</h1>
    <div class="meta">${escapeHtml(plan.title)} · ${escapeHtml(viewLabel(view))} · הופק ב-${new Date().toLocaleDateString('he-IL')}</div>
  </header>

  <h2>תכנון לפי פרמטרים</h2>
  <table>
    <thead><tr><th>פרמטר</th><th class="num">סכום</th><th class="num">אחוז</th><th>הגבלה</th><th>עמידה בהגבלה</th></tr></thead>
    <tbody>
      ${formRows}
      <tr class="total"><td>סה"כ</td><td class="num">${formatMoney(form.total)}</td><td class="num">${form.total > 0 ? '100%' : '0%'}</td><td></td><td></td></tr>
    </tbody>
  </table>

  <h2>לוח זמנים לניצול התקציב</h2>
  <table>
    <thead><tr><th>פרמטר</th>${YEAR_PCT_LABELS.map(p => `<th class="num">${p}</th>`).join('')}<th class="num">לא נקבע</th><th class="num">סה"כ</th></tr></thead>
    <tbody>
      ${scheduleRows}
      <tr class="total"><td>סה"כ</td>${schedule.months.map(v => `<td class="num">${formatMoney(v, 0)}</td>`).join('')}<td class="num">${formatMoney(schedule.unscheduled, 0)}</td><td class="num">${formatMoney(schedule.total, 0)}</td></tr>
    </tbody>
  </table>
  <p class="note">סכום כל שורה מחולק שווה בין החודשים בתקופת הניצול שלה. כל עמודה היא חודש — 100% חלקי 12 — והכותרת היא האחוז מהשנה בסופו.</p>

  <h2 class="page-break">פירוט</h2>
  <table>
    <thead><tr>
      <th>פירוט</th><th>זמן ניצול</th><th>קהל יעד</th>
      ${cols.map(c => `<th class="num">${escapeHtml(c.label)}</th>`).join('')}
      <th>הערות</th>
    </tr></thead>
    <tbody>
      ${detailBody || `<tr><td colspan="${4 + cols.length}">אין שורות בתצוגה זו</td></tr>`}
      <tr class="total">
        <td colspan="3">סה"כ התכנית</td>
        ${cols.map(c => `<td class="num">${formatMoney(all.reduce((s, i) => s + c.value(i), 0))}</td>`).join('')}
        <td></td>
      </tr>
    </tbody>
  </table>

  ${plan.notes ? `<h2>הערות</h2><p>${escapeHtml(plan.notes).replace(/\n/g, '<br>')}</p>` : ''}

  <div class="signatures">
    <div>מנהל/ת הספרייה</div>
    <div>חתימה</div>
    <div>תאריך</div>
  </div>
</body>
</html>`;

  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  // מחכים לטעינת הגופנים לפני פתיחת חלון ההדפסה
  setTimeout(() => w.print(), 300);
  return true;
}
