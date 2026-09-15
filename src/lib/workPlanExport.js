import {
  VIEWS, amountColumns, itemsForView, groupByCategory, groupAmount, quartersLabel, num, formatMoney,
} from '@/lib/workPlan';

/**
 * ייצוא תכנית העבודה: קובץ Excel (גיליון לכל תצוגה + סיכום) ומסמך להדפסה/PDF.
 */

const viewLabel = (view) => VIEWS.find(v => v.id === view)?.label || '';

const DETAIL_HEADERS = ['קטגוריה', 'שם הפעילות', 'תיאור', 'קהל יעד', 'משתתפים צפויים', 'מועד'];

function detailSheetRows(plan, items, view) {
  const cols = amountColumns(view);
  const rows = [
    [plan.title],
    [`שנת ${plan.year} · ${viewLabel(view)}`],
    [],
    [...DETAIL_HEADERS, ...cols.map(c => c.label), 'הערות'],
  ];
  const groups = groupByCategory(itemsForView(items, view));
  for (const g of groups) {
    for (const i of g.items) {
      rows.push([
        g.category, i.activity_name || '', i.description || '', i.target_audience || '',
        i.expected_participants != null ? num(i.expected_participants) : '',
        quartersLabel(i.quarters),
        ...cols.map(c => c.value(i)),
        i.notes || '',
      ]);
    }
    rows.push([`סה"כ ${g.category}`, '', '', '', '', '', ...cols.map(c => g.items.reduce((s, i) => s + c.value(i), 0)), '']);
    rows.push([]);
  }
  const all = groups.flatMap(g => g.items);
  rows.push(['סה"כ התכנית', '', '', '', '', '', ...cols.map(c => all.reduce((s, i) => s + c.value(i), 0)), '']);
  return rows;
}

function summarySheetRows(plan, items) {
  const groups = groupByCategory(items);
  const grand = groups.reduce((s, g) => s + g.total, 0);
  const rows = [
    [plan.title],
    [`שנת ${plan.year} · סיכום לפי קטגוריה`],
    [],
    ['קטגוריה', 'תקציב עירוני', 'משרד התרבות', 'סה"כ', 'אחוז מהתכנית'],
  ];
  for (const g of groups) {
    rows.push([g.category, g.municipal, g.ministry, g.total, grand > 0 ? Math.round((g.total / grand) * 1000) / 10 : 0]);
  }
  rows.push([
    'סה"כ',
    groups.reduce((s, g) => s + g.municipal, 0),
    groups.reduce((s, g) => s + g.ministry, 0),
    grand,
    grand > 0 ? 100 : 0,
  ]);
  return rows;
}

export async function exportWorkPlanExcel(plan, items) {
  const { utils, writeFile } = await import('xlsx');
  const wb = utils.book_new();

  const addSheet = (rows, name, widths) => {
    const ws = utils.aoa_to_sheet(rows);
    ws['!cols'] = widths.map(wch => ({ wch }));
    utils.book_append_sheet(wb, ws, name);
  };

  const detailWidths = (view) => [16, 30, 40, 18, 14, 18, ...amountColumns(view).map(() => 15), 30];
  addSheet(summarySheetRows(plan, items), 'סיכום', [22, 15, 15, 15, 14]);
  for (const v of VIEWS) addSheet(detailSheetRows(plan, items, v.id), v.label, detailWidths(v.id));

  // גיליונות מימין לשמאל
  wb.Workbook = { Views: [{ RTL: true }] };

  writeFile(wb, `תכנית_עבודה_${plan.year}.xlsx`);
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
  const groups = groupByCategory(itemsForView(items, view));
  const all = groups.flatMap(g => g.items);
  const grand = groups.reduce((s, g) => s + groupAmount(g, view), 0);

  const summaryRows = groups.map(g => `
    <tr>
      <td>${escapeHtml(g.category)}</td>
      ${view === 'all' ? `<td class="num">${formatMoney(g.municipal)}</td><td class="num">${formatMoney(g.ministry)}</td>` : ''}
      <td class="num">${formatMoney(groupAmount(g, view))}</td>
      <td class="num">${grand > 0 ? ((groupAmount(g, view) / grand) * 100).toFixed(1) : '0'}%</td>
    </tr>`).join('');

  const detailBody = groups.map(g => `
    <tr class="group"><td colspan="${5 + cols.length}">${escapeHtml(g.category)}</td></tr>
    ${g.items.map(i => `
      <tr>
        <td><strong>${escapeHtml(i.activity_name)}</strong>${i.description ? `<div class="desc">${escapeHtml(i.description)}</div>` : ''}</td>
        <td>${escapeHtml(i.target_audience)}</td>
        <td class="num">${i.expected_participants != null ? num(i.expected_participants).toLocaleString('he-IL') : ''}</td>
        <td>${escapeHtml(quartersLabel(i.quarters))}</td>
        ${cols.map(c => `<td class="num">${formatMoney(c.value(i))}</td>`).join('')}
        <td>${escapeHtml(i.notes)}</td>
      </tr>`).join('')}
    <tr class="subtotal">
      <td colspan="4">סה"כ ${escapeHtml(g.category)}</td>
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
  h1 { font-size: 20px; margin: 0 0 4px; }
  .meta { color: #555; font-size: 12px; }
  h2 { font-size: 14px; margin: 18px 0 6px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #bbb; padding: 4px 6px; text-align: right; vertical-align: top; }
  th { background: #eee; font-weight: 700; }
  td.num, th.num { text-align: left; direction: ltr; white-space: nowrap; }
  tr.group td { background: #f3f0ff; font-weight: 700; font-size: 12px; }
  tr.subtotal td { background: #fafafa; font-weight: 700; }
  tr.total td { background: #e8e8e8; font-weight: 700; font-size: 12px; }
  .desc { color: #555; margin-top: 2px; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  .summary { width: auto; min-width: 50%; }
  .signatures { display: flex; gap: 60px; margin-top: 40px; }
  .signatures div { border-top: 1px solid #333; padding-top: 4px; min-width: 180px; }
</style>
</head>
<body>
  <header>
    <h1>${escapeHtml(plan.title)}</h1>
    <div class="meta">שנת ${escapeHtml(plan.year)} · ${escapeHtml(viewLabel(view))} · הופק ב-${new Date().toLocaleDateString('he-IL')}</div>
  </header>

  <h2>סיכום לפי קטגוריה</h2>
  <table class="summary">
    <thead><tr>
      <th>קטגוריה</th>
      ${view === 'all' ? '<th class="num">תקציב עירוני</th><th class="num">משרד התרבות</th>' : ''}
      <th class="num">${view === 'all' ? 'סה"כ' : escapeHtml(viewLabel(view))}</th>
      <th class="num">אחוז</th>
    </tr></thead>
    <tbody>
      ${summaryRows}
      <tr class="total">
        <td>סה"כ</td>
        ${view === 'all' ? `<td class="num">${formatMoney(groups.reduce((s, g) => s + g.municipal, 0))}</td><td class="num">${formatMoney(groups.reduce((s, g) => s + g.ministry, 0))}</td>` : ''}
        <td class="num">${formatMoney(grand)}</td>
        <td class="num">${grand > 0 ? '100%' : '0%'}</td>
      </tr>
    </tbody>
  </table>

  <h2>פירוט פעילויות</h2>
  <table>
    <thead><tr>
      <th>פעילות</th><th>קהל יעד</th><th class="num">משתתפים</th><th>מועד</th>
      ${cols.map(c => `<th class="num">${escapeHtml(c.label)}</th>`).join('')}
      <th>הערות</th>
    </tr></thead>
    <tbody>
      ${detailBody || `<tr><td colspan="${5 + cols.length}">אין פעילויות בתצוגה זו</td></tr>`}
      <tr class="total">
        <td colspan="4">סה"כ התכנית</td>
        ${cols.map(c => `<td class="num">${formatMoney(all.reduce((s, i) => s + c.value(i), 0))}</td>`).join('')}
        <td></td>
      </tr>
    </tbody>
  </table>

  ${plan.notes ? `<h2>הערות</h2><p>${escapeHtml(plan.notes).replace(/\n/g, '<br>')}</p>` : ''}

  <div class="signatures">
    <div>מנהלת הספרייה</div>
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
