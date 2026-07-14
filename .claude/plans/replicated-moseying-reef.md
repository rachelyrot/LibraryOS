# מעבר 
 מ-Base44 ל-Supabase + Cloudflare Pages

## Context (רקע)

האתר (LibraryOS) בנוי כיום לגמרי על גבי הפלטפורמה Base44 — מסד נתונים, התחברות (auth) ואחסון קבצים כולם דרך `@base44/sdk`, ואין קוד שרת מקומי בכלל. המשתמש רוצה לפרוס את האתר להיות **עצמאי לחלוטין מ-Base44**, עם דגש על **עלות נמוכה** ומספר משתמשים קטן (ספרייה עירונית אחת, צוות מצומצם).

הוחלט יחד עם המשתמש:
- **בק-אנד**: Supabase (Postgres + Auth + Storage). פרויקט בטיר החינמי "נרדם" (מושהה) אחרי 7 ימים ללא תעבורה, ודורש שחזור **ידני** בלוח הבקרה (לא מתעורר לבד) — לכן נכלל בתוכנית פתרון פינג אוטומטי חינמי (§8) כדי שזה לעולם לא יקרה בפועל.
- **נתונים**: אין נתוני אמת בייצור כיום — **מתחילים מאפס**, ללא ייבוא/ייצוא מ-Base44.
- **ייבוא אקסל למלאי**: מחליפים את זיהוי ה-AI של Base44 (`ExtractDataFromUploadedFile`) בפרסור דטרמיניסטי של עמודות קבועות (בדיוק כמו שכבר קיים היום ב-`BookListForm.jsx` לרשימות ספרים).
- **אחסון פרונט**: Cloudflare Pages.

נבדק ואומת (לא רק תוכנן): כ-51 קבצים / כ-215 נקודות קריאה פונות ל-`base44.entities.*`/`base44.auth.*`/`base44.integrations.*`, **כולן** דרך אותו import יחיד: `import { base44 } from '@/api/base44Client'`. זו נקודת מנוף מרכזית — אם המחליף שומר על אותה צורת אובייקט (`base44.entities.X.list/filter/get/create/update/delete/bulkCreate`, `base44.auth.me/logout`, `base44.integrations.Core.UploadFile`), רוב נקודות הקריאה לא ידרשו שינוי קוד כלל.

נמצא גם: הרכיב `ProtectedRoute.jsx` אינו בשימוש בפועל (קוד מת — `App.jsx` שוער ישירות דרך `AuthenticatedApp`), ו-`GoodsReceiptDialog.jsx`/`Inventory.jsx` אומתו כתואמים בדיוק לתיאור בתוכנית (לולאת receipt סדרתית ללא אטומיות; ייבוא אקסל דרך UploadFile+ExtractDataFromUploadedFile+bulkCreate).

---

## 0. כלי עבודה: סקיל להרצת שלבי התוכנית (`@run-step`)

לפני תחילת המימוש בפועל (עוד לפני "תשתית" ב-§9), ליצור מבנה כלים ב-Claude Code ברמת הפרויקט:

- **`.claude/skills/run-step/SKILL.md`** — סקיל פרויקטלי, מופעל כ-`@run-step <מספר/שם שלב>` (למשל `@run-step שלב 1`). כשמופעל:
  1. קורא את קובץ התוכנית הזה (`C:\Users\רחלי\.claude\plans\replicated-moseying-reef.md`) ומזהה את השלב המבוקש מתוך §9 (סדר העבודה).
  2. מבצע בפועל את מה שהשלב דורש (כתיבת/עריכת קוד, יצירת סכמה, הרצת פקודות וכו', בהתאם לתוכן הסעיף הרלוונטי).
  3. עם סיום, מוסיף רשומה **ישירות בתחתית קובץ התוכנית הזה**, תחת כותרת "## יומן ביצוע" (ליצור אם לא קיימת): תאריך ושעה, מספר/שם השלב, סטטוס (✅ הצליח / ❌ נכשל / ⚠️ הצליח חלקית), הסבר קצר של מה שנעשה בפועל, ואם היו בעיות — מה לא הסתדר ולמה.
  4. אם השלב נכשל בניסיון הראשון — מנסה לאבחן ולתקן לפני שמוותר ומדווח כישלון (לא עוצר על השגיאה הראשונה).
- **`.claude/agents/`** — תיקייה נלווית, נוצרת ריקה/מוכנה לשימוש עתידי (למשל אם ירצו שסקיל מסוים יאציל ביצוע לסוכן ייעודי/מבודד); אין צורך בתוכן בשלב זה אלא אם יוחלט אחרת בהמשך.

זהו למעשה **צעד ראשון ממש, לפני שלב 0 הקיים** ב-§9 — נבנה פעם אחת, ולאחר מכן כל שלבי §9 מבוצעים דרך `@run-step`.

---

## 1. סכמת Supabase (טבלה לכל ישות)

טבלה אחת ל-Postgres לכל אחד מ-23 קבצי `base44/entities/*.jsonc` (חוץ מ-`User`, ראה §2), בשמות snake_case זהים ל-jsonc (`purchase_orders`, `suppliers`, `categories`, וכו'). לכל טבלה: `id uuid primary key default gen_random_uuid()`, `created_date timestamptz default now()`, `updated_date timestamptz default now()` (**לא** לשנות לשמות `created_at`/`updated_at` — יגרור שינוי בכ-40 קריאות `.list('-created_date', ...)`). טריגר לעדכון `updated_date` בכל UPDATE.

**שדות מערך מקוננים → JSONB, לא טבלאות נפרדות**: `PurchaseOrder.items`, `BudgetAllocation.transactions`, `SupplierCredit.transactions`, `SupplierBookList.books`, `InventoryItem.movements`, `ProjectTask.file_urls` — כולם `jsonb` (ברירת מחדל `'[]'::jsonb`). הצדקה: אף אחד מהם לא מסונן/נשאל לפי שדה-פנימי באף מקום בקוד (נבדק ב-`PriceComparison.jsx`, `BookListDetail.jsx`, `budgetUpdater.js`) — תמיד נקראים/נכתבים כבלוק שלם. נרמול לטבלאות בנות יסבך את הפונקציות האטומיות ב-§4 ללא תועלת.

**מפתחות זרים (FK)**: כל שדה `_id` (supplier_id, budget_source_id, budget_category_id, credit_id, project_id וכו') הופך ל-`uuid references <table>(id)`, **nullable**, עם `on delete set null` (המערכת מארכבת נתוני-אב דרך `status`, לא מוחקת בפועל).

**שדות "שם מטמון" (supplier_name, budget_source_name וכו')**: להשאיר **כמו שהם היום** — עמודות `text` רגילות שנכתבות ע"י הלקוח בזמן היצירה, בדיוק כמו היום. לא לעבור ל-views/joins בשלב הזה (אפשר להוסיף views בעתיד כתוספת נקייה, בלי לגעת בטבלאות הבסיס, אם יתעורר צורך אמיתי בדיווח).

**תיקיית `base44/entities/*.jsonc`**: להשאיר, להעביר ל-`docs/legacy-base44-schema/` כתיעוד קפוא (יש בה תיאורים בעברית ששימושיים) — לא למחוק.

---

## 2. Supabase Auth + טבלת `profiles`

**סכמה**: `profiles` — `id uuid primary key references auth.users(id) on delete cascade`, `email text`, `full_name text`, `role text not null default 'user' check (role in ('admin','remote_manager','local_manager','user'))`, `created_date timestamptz default now()`. טריגר `handle_new_user()` על `auth.users` יוצר שורת profile אוטומטית עם `role='user'` ברירת מחדל (least privilege — admin מקדם ידנית).

**שיוך תפקידים (role)**: **עריכה ישירה בטבלה דרך Supabase Studio**, לא מסך ניהול חדש באפליקציה. הצדקה: צוות קטן, שינויי תפקיד נדירים, אין היום שום UI לזה גם ב-Base44 (זה היה בלוח הבקרה של Base44 עצמו). לתעד בעברית ב-`src/pages/Settings.jsx` הפניה ל-Supabase Studio לניהול משתמשים. מסך "ניהול משתמשים" אמיתי — לדחות לעתיד אם הצוות יגדל.

**שער האימות מחדש** (`src/lib/AuthContext.jsx`):
1. `supabase.auth.getSession()` + `onAuthStateChange` בעת טעינה.
2. אין session → `authError.type = 'auth_required'` — אבל בניגוד להיום, **צריך UI התחברות מקומי אמיתי** (`src/pages/Login.jsx` חדש, עם `signInWithPassword`/`signUp`, אימייל+סיסמה — הכי פשוט וזול לצוות קטן), כי Base44 סיפק את כל מסך ההתחברות עד היום.
3. יש session → `select * from profiles where id = session.user.id`. אין שורה → אותו `authError.type = 'user_not_registered'` ואותו רכיב `UserNotRegisteredError.jsx` בדיוק כמו היום.
4. יש שורה → `user` בקונטקסט הופך ל-`{ id, email, full_name, role }` — בדיוק הצורה ש-`permissions.js` וכל קוד ה-audit-stamping (`created_by: user?.full_name || user?.email`) כבר מצפים לה. **`src/lib/permissions.js` נשאר כמעט ללא שינוי**.

`src/lib/app-params.js` הופך מיותר לגמרי — Supabase JS client מנהל session בעצמו ב-localStorage.

**RLS (הגנת שכבה שנייה)**: להפעיל RLS על כל הטבלאות. ברירת מחדל: כל authenticated user יכול select/insert/update (משקף את המצב היום — הכל נאכף רק ב-UI). מדיניות מחמירה **רק** על הפעולות הרגישות שכבר מזוהות ב-`permissions.js`: כתיבה ל-`budget_allocations`/`budget_sources`/`supplier_credits` — admin בלבד; כתיבה לעמודת `role` ב-`profiles` — admin בלבד (דרך פונקציית `security definer` שבודקת את התפקיד *הנוכחי* בטבלה, לא ערך שנשלח מהלקוח).

---

## 3. שכבת גישה-לנתונים דקה — `src/api/base44Client.js`

**לשכתב את התוכן הפנימי של `src/api/base44Client.js`, לא למחוק את הקובץ** — כך שכל כ-51 הקבצים הקוראים לו ממשיכים לעבוד בלי שינוי. הקובץ החדש עוטף את `@supabase/supabase-js` ושומר על אותה צורת אובייקט מקונן:

```js
function makeEntity(table) {
  return {
    list: (sort, limit) => applySort(supabase.from(table).select('*'), sort).limit(limit ?? 1000).then(unwrap),
    filter: (query, sort, limit) => applySort(applyEq(supabase.from(table).select('*'), query), sort).limit(limit ?? 1000).then(unwrap),
    get: (id) => supabase.from(table).select('*').eq('id', id).maybeSingle().then(unwrap),
    create: (data) => supabase.from(table).insert(data).select().single().then(unwrap),
    update: (id, data) => supabase.from(table).update(data).eq('id', id).select().single().then(unwrap),
    delete: (id) => supabase.from(table).delete().eq('id', id).then(unwrap),
    bulkCreate: (rows) => supabase.from(table).insert(rows).select().then(unwrap),
  };
}
```

`applySort` ממיר את מוסכמת המחרוזת הקיימת (`'-created_date'`/`'name'`) ל-`.order(field, { ascending })`. `applyEq` ממיר אובייקט שוויון פשוט (`{ field: value }`) לשרשרת `.eq()` — תואם בדיוק לדפוס הקיים (אין OR/range operators בשום מקום בקוד). `unwrap` זורק שגיאה אם `{ error }` קיים, אחרת מחזיר `data` — כך ש-`.then()`/`await`/`.catch()` הקיימים ממשיכים לעבוד. `base44.auth` עוטף את `supabase.auth` (`me()` ממזג `getUser()` עם שורת ה-profile). `base44.integrations.Core.UploadFile` הופך לעטיפת Storage (§5). טבלת מיפוי סטטית (`PurchaseOrder` → `purchase_orders`) בראש הקובץ.

**לממש פעם אחת, לא ישות-אחר-ישות** — זה קובץ אחד מאחורי ממשק אחיד; הפיצול-לשלבים הרלוונטי הוא לבדיקה ידנית (§9), לא לכתיבת קוד.

---

## 4. אטומיות תקציב/זיכוי — פונקציות RPC ב-Postgres

להחליף את הלוגיקה הסדרתית (ללא אטומיות) ב-`src/lib/budgetUpdater.js` בפונקציות `plpgsql`, נקראות דרך `supabase.rpc(...)`. **חתימות הפונקציות ב-JS (`handleBudgetOnStatusChange`, `recalcBudgetSource`, `validateBudgetSelection`) נשארות זהות** — רק המימוש הפנימי משתנה לקריאת RPC, כך ש-`OrderDetail.jsx`/`GoodsReceiptDialog.jsx` לא צריכים להשתנות.

- **`apply_order_budget_transition(order_id uuid, new_status text)`**: `select ... for update` על שורת ההזמנה (נעילה נגד הגשה כפולה בו-זמנית), בדיקת דגל `budget_updated` **בתוך** הטרנזקציה (לא לסמוך על ערך שהלקוח קרא קודם), הענפים בדיוק כמו היום (approved → שריון + ולידציה מחדש של יתרה; received_full/partial → מעבר reserved→spent/used + הוספת רשומה ל-`transactions` jsonb; cancelled → שחרור שריון), קורא ל-`recalc_budget_source` באותה טרנזקציה.
- **`recalc_budget_source(source_id uuid)`**: פורט ישיר של `recalcBudgetSource` ללוגיקת `sum()` ב-SQL.
- **`apply_goods_receipt(order_id uuid, received_items jsonb)`**: מחליף את הלולאה הסדרתית ב-`GoodsReceiptDialog.jsx` (N+1 קריאות) בלולאת `jsonb_array_elements` בתוך הפונקציה — upsert ל-`inventory_items` + הוספה ל-`movements` + `inventory_updated = true`, הכל בטרנזקציה אחת. לשלב באותו שלב עבודה כמו §תקציב (שני הם אותה בעיית flag-guard/אטומיות).

`validateBudgetSelection` יכול להישאר בדיקה קריאה-בלבד בצד לקוח (UX מוקדם) — ה-RPC עצמו הוא הבדיקה הסמכותית בפועל.

---

## 5. אחסון קבצים

Bucket יחיד ב-Supabase Storage, למשל `library-files`, **ציבורי** (לא signed URLs) — כלי פנימי לצוות מאומת בלבד, קבצים לא רגישים מספיק כדי להצדיק את המורכבות/עלות הנוספת של signed URLs. מוסכמת נתיב: `<entity>/<uuid>-<שם-קובץ>`. מחליף את `base44.integrations.Core.UploadFile({ file })` — `upload()` + `getPublicUrl()`, מוחזר כ-`{ file_url }` (אותה צורה שכל 6 נקודות הקריאה כבר מפרקות).

---

## 6. ייבוא אקסל למלאי (`src/pages/Inventory.jsx`)

**היקף מצומצם ממה שחשבנו בהתחלה**: ייבוא רשימות ספרים (`BookListForm.jsx`) **כבר** דטרמיניסטי היום (פרסור `xlsx` בצד לקוח + `COLUMN_MAP` פאזי) — ה-AI של Base44 (`ExtractDataFromUploadedFile`) משמש **רק** בייבוא המלאי ב-`Inventory.jsx`. לכן: לחלץ את לוגיקת מיפוי-העמודות הקיימת מ-`BookListForm.jsx` ל-`src/lib/excelImport.js` משותף (`parseExcelRows(file, columnMap)`), ושני מקומות הקריאה (`BookListForm.jsx` ו-`Inventory.jsx`) ישתמשו בו. `Inventory.jsx`'s `handleImport` הופך מ-`UploadFile→ExtractDataFromUploadedFile→bulkCreate` ל-`parseExcelRows→ולידציה→bulkCreate`, עם אותה קבוצת עמודות קבועה שכבר מקודדת היום ב-`json_schema` (name/category/subcategory/current_quantity/minimum_quantity/unit/isbn/author). אין צורך אפילו בהעלאת קובץ לשרת — פרסור צד-לקוח ישיר של ה-`File`.

---

## 7. הסרת הצימוד ל-Base44 בבנייה

- `package.json`: הסרת `@base44/sdk`, `@base44/vite-plugin`; הוספת `@supabase/supabase-js`.
- `vite.config.js`: הסרת רישום ה-plugin `base44(...)` לגמרי.
- `src/api/base44Client.js`: משוכתב בפנים (§3), **לא נמחק**.
- `src/lib/app-params.js`: נמחק (מיותר); להסיר את ה-import שלו מ-`AuthContext.jsx`.
- `base44/` directory: מועבר ל-`docs/legacy-base44-schema/`.
- `CLAUDE.md`: לעדכן קטעי Data access / Auth / dev-env בשלב הסופי (לא לשכוח — ידריך שיחות Claude Code עתידיות).
- `.env.local`: `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` במקום משתני ה-Base44.

---

## 8. פריסה ל-Cloudflare Pages

- Build command: `npm run build` (ללא שינוי). Output directory: `dist`.
- משתני סביבה בהגדרות הפרויקט ב-Cloudflare Pages (לא ב-git): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (ה-anon key מיועד לחשיפה בצד לקוח לפי עיצוב Supabase — **RLS, לא סודיות המפתח, הוא ההגנה בפועל**; לתעד את זה כדי שאיש לא יבהל וירוטט את המפתח בעתיד).
- ראוטינג SPA: קובץ `public/_redirects` עם `/*  /index.html  200` (חובה כי `react-router-dom`'s `BrowserRouter` ידרוש נפילה-חזרה בקישורים עמוקים, למשל `/orders/abc123`).
- דרישת קדם: **לאתחל git repo + remote** (אין כרגע — `git init`, לדחוף ל-GitHub, לחבר את Cloudflare Pages לענף הראשי).

### מניעת "השהיה" (pause) של Supabase בטיר החינמי

בטיר החינמי, פרויקט ללא תעבורת API במשך 7 ימים רצופים מושהה, ודורש שחזור **ידני** בלוח הבקרה (לא מתעורר לבד מבקשה נכנסת) — הפרעת שירות אמיתית אם אף אחד לא שם לב.

**עודכן (2026-07-13) — הפתרון בפועל: UptimeRobot, לא GitHub Actions.** התוכנית המקורית תכננה workflow ב-GitHub Actions (`.github/workflows/keep-alive.yml`), אך **הוא מעולם לא נבנה בפועל** (טעות שהתגלתה בדיעבד — נשאר רעיון על הנייר בלבד). במקום זאת הוקם ניטור חינמי ב-**UptimeRobot** (uptimerobot.com), שפונה **ישירות ל-Supabase REST API** (לא לאתר החי — Cloudflare מגיש HTML/JS סטטי, ובלי דפדפן אמיתי שמריץ JS הפנייה ל-Supabase לא הייתה קורית בכלל):
```
https://idktdopfvycenheizqbf.supabase.co/rest/v1/profiles?select=id&limit=1&apikey=<anon key>
```
נבדק כל 5 דקות (ברירת המחדל של UptimeRobot בפועל, אפילו תכוף יותר מ-10 שהוגדר). זה פותר את בעיית ה-pause **וגם** נותן ניטור אמיתי + התראת מייל אם האתר נופל — יתרון נוסף על פני הרעיון המקורי. אין קובץ קוד לתחזק (הכל מוגדר בממשק UptimeRobot). אומת ופעיל בפועל: 100% uptime, ~40 דקות רצף בזמן הבדיקה.

---

## 9. סדר עבודה מומלץ (שלבים)

צעד מקדים (חד-פעמי, לפני הכל): **יצירת הסקיל `@run-step`** לפי §0 — מכאן ואילך, כל שלב מתחתיו מבוצע ע"י הפעלת `@run-step <מספר שלב>`.

0. **תשתית**: `git init` + remote, יצירת פרויקט Supabase, יצירת פרויקט Cloudflare Pages (יכול להצביע על deploy ריק בהתחלה).
1. **סכמה + RLS ב-Supabase**: כל 23 הטבלאות + `profiles`, FKs, עמודות JSONB, מדיניות RLS בסיסית, טריגר `handle_new_user`. עבודת SQL/Studio טהורה, ללא שינוי קוד עדיין.
2. **ליבת האימות**: שכתוב מלא של `src/api/base44Client.js` (§3, כל 24 הישויות בבת אחת) + שכתוב `src/lib/AuthContext.jsx` (§2) + `src/pages/Login.jsx` חדש + חיווט/מחיקה סופית של `ProtectedRoute.jsx` (להחליט אחד מהשניים, לא לשמור את שתי דרכי השערור). בסוף השלב הזה — כל עמוד קיים אמור לעבוד מול Supabase בלי שינוי נוסף לעמוד עצמו.
3. **בדיקה ידנית לפי קבוצות תת-מערכת**: (א) הזמנות+תקציב+זיכויים+קבלת סחורה יחד (הכי תלויים זה בזה); (ב) ספקים+קטגוריות+מלאי; (ג) זרימת ספרים ו-זרימת ציוד/הצעות מחיר בנפרד (לפי הכלל בתיעוד שלא לערבב); (ד) כוח אדם; (ה) ניהול פרויקטים.
4. **העלאת קבצים** (§5): מימוש עטיפת ה-Storage, בדיקת 6 נקודות הקריאה.
5. **ייבוא אקסל** (§6): `excelImport.js` + שכתוב `Inventory.jsx`.
6. **RPC-ים לתקציב** (§4): כתיבה ופריסה של הפונקציות, שכתוב פנים `budgetUpdater.js` + `GoodsReceiptDialog.jsx`.
7. **הסרת צימוד הבנייה** (§7): package.json/vite.config.js, מחיקת app-params.js, העברת base44/, עדכון CLAUDE.md.
8. **פריסה ל-Cloudflare Pages** (§8): משתני סביבה, `_redirects`, deploy ראשון, בדיקת קישורים עמוקים, וה-workflow השומר על Supabase ער (§8, "מניעת השהיה").
9. **מעבר בדיקה ידני מקצה-לקצה** על ה-URL הפרוס האמיתי: login/logout, יצירה→הגשה→אישור→קבלה של הזמנת רכש (עם וידוא effects תקציב+מלאי), רשימת ספרים→ייבוא אקסל→הצעת מחיר→המרה להזמנה, נוכחות כוח אדם, יצירת פרויקט עם העלאת מסמך, התראת מלאי נמוך. **רק אחרי המעבר הזה** Base44 בטוח להוצאה משימוש סופית.

---

## 10. מה נשאר מחוץ להיקף (במפורש)

- אין מסך ניהול-משתמשים באפליקציה — עריכה ב-Supabase Studio מספיקה לשלב זה.
- אין מדיניות RLS מעבר לפעולות הרגישות שכבר צוינו — שאר הטבלאות נשארות נאכפות ב-UI בלבד (כמו היום).
- טיפול ב"הירדמות" הפרויקט בטיר החינמי **נכלל** בתוכנית (§8) — לא הוצא מההיקף, בניגוד להחלטה הראשונית. הפתרון בפועל הוא UptimeRobot (ראו עדכון ב-§8), לא GitHub Actions כפי שתוכנן במקור.
- אין נרמול של שדות ה-JSONB (items/transactions/books) לטבלאות בנות.
- אין signed/expiring URLs לאחסון — bucket ציבורי.
- אין איחוד של כ-20 נקודות הקריאה הכפולות ל-`base44.auth.me()` (השכבה הדקה בשלב 3 עושה שהן ימשיכו לעבוד בלי שינוי) — ניקוי נחמד-אבל-לא-הכרחי.
- אין ייבוא/ייצוא נתונים מ-Base44 (אושר: מתחילים מאפס).
- אין סוויטת בדיקות אוטומטיות — האימות הוא מעבר ידני (שלב 9).

## קבצים קריטיים למימוש

- `src/api/base44Client.js` — כל שכבת הגישה ל-Supabase (§3), הקובץ בעל המנוף הגבוה ביותר.
- `src/lib/AuthContext.jsx` — שכתוב מלא לאימות Supabase + שער profiles (§2).
- `src/lib/budgetUpdater.js` — פנים מוחלפים בקריאות RPC (§4), חתימות נשמרות.
- `src/components/GoodsReceiptDialog.jsx` — לולאת קבלת מלאי הופכת לקריאת RPC (§4).
- `src/pages/Inventory.jsx` — שכתוב ייבוא אקסל (§6).
- `src/components/bookLists/BookListForm.jsx` — מקור דפוס מיפוי-העמודות לחילוץ ל-`src/lib/excelImport.js` (§6).
- `vite.config.js`, `package.json` — הסרת צימוד בנייה (§7).
- `base44/entities/*.jsonc` (24 קבצים) — מקור אמת לכתיבת ה-DDL של Postgres (§1).

---

## יומן ביצוע

### 2026-07-09 — צעד מקדים: יצירת הסקיל `@run-step`
**סטטוס:** ✅ הצליח

נוצרו: `.claude/skills/run-step/SKILL.md` (סקיל פרויקטלי עם frontmatter תקין — name/description — המתאר את תהליך הרצת שלב, טיפול בכישלונות, ותיעוד ביומן זה) ו-`.claude/agents/README.md` (placeholder מתעד לתיקיית agents ריקה, מוכנה לשימוש עתידי). לא נדרשו תיקונים. מכאן ואילך, כל שלב מ-§9 יופעל ויתועד דרך `@run-step`.

### 2026-07-09 — קביעת עותק קנוני לקובץ התוכנית
**סטטוס:** ✅ הצליח

נוצרה תיקיית `.claude/plans/` בתוך הפרויקט והועתק אליה קובץ התוכנית (זהה בתוכנו לעותק ב-`~/.claude/plans/`). הוחלט: **עותק זה שבתוך הפרויקט הוא הקנוני מעכשיו** — הסקיל `run-step` עודכן (§"קובץ התוכנית") להצביע עליו ולכתוב אליו בלבד את יומן הביצוע וכל עדכון עתידי. העותק ב-`~/.claude/plans/` נשאר כסנאפשוט קפוא מרגע היצירה, ולא יעודכן יותר.

### 2026-07-09 — שלב 1: סכמה + RLS ב-Supabase
**סטטוס:** ⚠️ הצליח חלקית

נכתב קובץ מיגרציה מלא: `supabase/migrations/0001_init_schema.sql` (752 שורות). כולל:
- **25 טבלאות** (24 ישויות מ-`base44/entities/*.jsonc` + `profiles`) — תוקן פער קטן בתוכנית: §1 כתב "23 טבלאות" אך יש בפועל 24 קבצי jsonc ישויות (לא כולל User) + profiles, כפי שגם מצוין נכון ב"קבצים קריטיים למימוש" בתחתית התוכנית. נספרו/אומתו כל 25 ה-`create table` בקובץ.
- כל שדות ה-`id`/`created_date`/`updated_date` לפי המוסכמה בתוכנית.
- שדות מערך מקוננים (`items`/`transactions`/`books`/`movements`/וכו') כ-`jsonb not null default '[]'::jsonb`.
- `check` constraints על כל שדה enum שהוגדר במפורש ב-jsonc המקורי (סטטוסים, סוגי מימון וכו'), כולל ברירות המחדל התואמות.
- כל מפתחות ה-FK (nullable, `on delete set null` לנתוני-אב שמאורכבים ולא נמחקים; `on delete cascade` לטבלאות-בת של project שתלויות לגמרי בפרויקט האב — project_contacts/documents/domains/goals/members/milestones/tasks). שדות `person_id` פולימורפיים (schedules, project_members) הושארו במכוון בלי FK, כמתועד בתוכנית.
- טריגר `set_updated_date` על כל 24 טבלאות הישויות.
- **`profiles`**: טבלה + טריגר `handle_new_user` (SECURITY DEFINER, יוצר שורת profile אוטומטית עם role='user' בכל הרשמה) + פונקציית `is_admin()` + טריגר `protect_profile_role` שחוסם הסלמת הרשאות עצמית (מונע ממשתמש לא-admin לשנות את שדה ה-role של עצמו).
- **RLS**: מופעל על כל 25 הטבלאות. 21 טבלאות בסיס: select/insert/update/delete פתוח לכל authenticated (משקף את המצב הקיים היום, נאכף רק ב-UI). 3 טבלאות רגישות (budget_sources, budget_allocations, supplier_credits): select פתוח, insert/update/delete admin-בלבד דרך `is_admin()`. profiles: select פתוח לכולם, update מוגבל לשורה של המשתמש עצמו (הגנת role דרך הטריגר, לא מדיניות RLS נפרדת — Postgres לא תומך ב-RLS ברמת עמודה בודדת).
- נמצאה ותוקנה טעות: בטיוטה ראשונית של הקובץ נכנסו בטעות שתי שורות placeholder לא-תקינות (`create table ... _unused_placeholder_do_not_use () ;` ואז `drop table`) — הוסרו לפני השמירה הסופית.
- אומת: איזון סוגריים תקין (בדיקת סקריפט Node), ומספר תקין וזוגי של מפרידי `$$` (14 = 7 בלוקים).

**מה לא בוצע ולמה (הצלחה חלקית)**: הקובץ **לא הורץ בפועל** נגד מסד נתונים חי, כי **עדיין אין פרויקט Supabase קיים** (שלב 0 בתוכנית — יצירת חשבון/פרויקט ב-Supabase — טרם בוצע). זוהי פעולה שדורשת הרשמה/יצירת פרויקט דרך אתר Supabase בפועל, ואינה ניתנת לביצוע אוטומטי על ידי הסוכן ללא פרטי חשבון. **הפעולה הנדרשת מהמשתמשת**: להירשם ל-Supabase וליצור פרויקט חדש (Supabase.com → New Project), ואז להדביק את תוכן הקובץ ב-SQL Editor של הפרויקט (או לקשר עם Supabase CLI ולהריץ `supabase db push`). לאחר מכן ניתן להריץ `@run-step שלב 2`.

### 2026-07-09 — שלב 0 (חלקי): פרויקט Supabase נוצר + git init
**סטטוס:** ⚠️ הצליח חלקית

המשתמשת יצרה פרויקט Supabase בפועל (אזור Tokyo/ap-northeast-1), והריצה (לפי דיווחה) את `supabase/migrations/0001_init_schema.sql` דרך ה-SQL Editor. בנוסף בוצע `git init` בשורש הפרויקט (ריפו ריק, ללא commit עדיין — לא בוצע commit כי לא התבקש).

**נותר לשלב 0**: יצירת remote ב-GitHub (אין gh CLI מותקן/מאומת בסביבה — נדרשת פעולה ידנית: יצירת ריפו ב-github.com והוספתו כ-remote, או לחלופין דילוג על git ופריסה ל-Cloudflare Pages בדרך "Direct Upload" ללא git), ויצירת פרויקט Cloudflare Pages. קבלת Project URL + anon key מ-Supabase (Project Settings → API) נדרשת גם לשלב 2.

### 2026-07-09 — שלב 1: אימות סופי
**סטטוס:** ✅ הצליח

המשתמשת אישרה: 25 טבלאות מופיעות ב-Table Editor של Supabase. שלב 1 (סכמה + RLS) סגור לגמרי.

### 2026-07-09 — שלב 0: git + GitHub
**סטטוס:** ✅ הצליח

הענף המקומי שונה מ-`master` ל-`main`. נוסף remote `origin` → `https://github.com/rachelyrot/LibraryOS.git`. כל 186 קבצי הפרויקט נבדקו (`git status --short`, ווידוא ידני שאין קבצי `.env` בין הקבצים שנוספו) ונוספו ל-commit ראשוני ("Initial commit: LibraryOS migration off Base44 to Supabase"). נדחף בהצלחה ל-`origin/main`.

**נותר לשלב 0**: יצירת פרויקט Cloudflare Pages וחיבורו ל-repo. קבלת Project URL + anon key מ-Supabase (Project Settings → API) נדרשת לשלב 2.

### 2026-07-09 — שלב 0: Cloudflare (Workers/Pages) — דיפלוי ראשון
**סטטוס:** ✅ הצליח

המשתמשת חיברה את הריפו (`rachelyrot/LibraryOS`) ל-Cloudflare דרך "Continue with GitHub". הדיפלוי הראשון עבר בהצלחה (build תקין, `npm run build`, output `dist`). האתר החי: **https://libraryos.rh3224430.workers.dev**. הערה: Cloudflare השתמש בגרסה המאוחדת "Workers" (עם `wrangler.jsonc` שנוצר אוטומטית בסביבת ה-build המרוחקת, לא commit-מי מקומית) במקום "Pages" הקלאסי — מבחינה פונקציונלית זהה למתוכנן. **צפוי שהאתר לא יעבוד בפועל עדיין** (עדיין מדבר עם Base44, לא Supabase) — זה מצופה, ימתין לשלב 2.

### 2026-07-09 — פרטי Supabase לשלב 2
**סטטוס:** ✅ הצליח

אומת: לפרויקט Supabase הנוכחי (name: "LibraryOS", project ref: `idktdopfvycenheizqbf`, אזור Tokyo) **יש טבלאות קיימות** ב-Table Editor — כלומר זהו פרויקט תקין עם הסכמה מיושמת (גם אם ה-ref שונה מהצילום מסך הראשון בתחילת השיחה — כנראה בלבול/פרויקט שהוחלף בדרך, לא נחקר לעומק כי המשתמשת אישרה שהטבלאות קיימות בפרויקט הנוכחי, וזה הפרויקט היחיד שממנו נלקחו הפרטים בפועל).

נאספו:
- **Project URL**: `https://idktdopfvycenheizqbf.supabase.co`
- **Publishable key** (= "anon key", השם החדש ב-Supabase למפתח הבטוח לחשיפה בצד לקוח, מוגן ע"י RLS): `sb_publishable_WKpL0-5frbtjP4dXDrMRwQ_OUt1nhu7`

נוצר קובץ `.env.local` בשורש הפרויקט עם `VITE_SUPABASE_URL` ו-`VITE_SUPABASE_ANON_KEY` (אומת עם `git check-ignore` שהקובץ אכן מתעלם ע"י git, לא נוסף ל-commit). **secret key לא נאסף ולא נחשף** — לא נדרש בצד לקוח.

**נותר**: להוסיף את אותם שני משתני סביבה גם בהגדרות פרויקט Cloudflare (Settings → Environment Variables), כדי שהאתר החי ידע להתחבר ל-Supabase ברגע שקוד שלב 2 יעלה.

### 2026-07-09 — שלב 2: ליבת האימות
**סטטוס:** ✅ הצליח

בוצע לפי §2 ו-§3 בתוכנית:
- **`package.json`**: נוסף `@supabase/supabase-js`. הורץ `npm install` מקומית בהצלחה (643 חבילות; `node_modules` לא היה קיים כלל קודם בסביבה המקומית).
- **`src/api/base44Client.js`** — שוכתב במלואו: יצוא `supabase` (קליינט Supabase גולמי, לשימוש `AuthContext`) + יצוא `base44` השומר על אותה צורת אובייקט מדויקת (`base44.entities.<Name>.list/filter/get/create/update/delete/bulkCreate` על כל 24 הישויות דרך מיפוי `TABLE_MAP`, `base44.auth.me/logout`). `base44.integrations.Core.UploadFile`/`ExtractDataFromUploadedFile` הושארו כ-stub שזורק שגיאה ברורה ("יגיע בשלב מאוחר יותר") — לא מומש בכוונה, כי זה שלב 4/6 בתוכנית, לא שלב 2.
- **`src/lib/AuthContext.jsx`** — שוכתב במלואו: `supabase.auth.getSession()` + `onAuthStateChange`, בדיקת שורת `profiles` (מבחין בין `auth_required` ל-`user_not_registered` בדיוק לפי §2), `user` בקונטקסט בצורת `{ id, email, full_name, role }`. `src/lib/permissions.js` לא נגע כלל (כצפוי מהתוכנית).
- **`src/pages/Login.jsx`** — נוצר מאפס: מסך התחברות/הרשמה מקומי (email+password דרך `supabase.auth.signInWithPassword`/`signUp`), מוצג בעברית/RTL תואם לשאר האפליקציה.
- **`src/App.jsx`** — הוסר `isLoadingPublicSettings` ו-`navigateToLogin()` (מושגים ספציפיים ל-Base44 שאין להם מקבילה); מצב `auth_required` מרנדר עכשיו את `<Login/>` המקומי ישירות במקום להפנות לדף Base44 חיצוני.
- **`src/components/ProtectedRoute.jsx`** — נמחק (אומת קודם עם grep שאין לו שום import חי בקוד — היה קוד מת, לא היה מחובר בפועל ל-routes). לפי החלטת §9: "אחד מהשניים" — נבחר לשמר את מנגנון השערור הקיים (inline ב-`AuthenticatedApp`) ולמחוק את הכפול.

**אימות**: `npm run build` עבר בהצלחה (dist נוצר עם JS/CSS תקינים). `npm run lint` — 63 שגיאות, **כולן** בקבצים שלא נגעתי בהם בשלב הזה (pre-existing, למשל `unused-imports` ב-Dashboard.jsx/Settings.jsx/Credits.jsx וכו') — לא קשור לשינויים כאן. הרצתי שרת dev מקומי (`npm run dev`), אימתתי עם curl ש-4 הקבצים ששונו/נוצרו (`base44Client.js`, `AuthContext.jsx`, `Login.jsx`, `App.jsx`) מתקמפלים ע"י Vite ללא שגיאות (HTTP 200), ושמשתני הסביבה (`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`) נטענים נכון מ-`.env.local`. השרת נעצר בסיום הבדיקה.

**לא בוצע (מחוץ להיקף שלב 2, כמתוכנן)**: העלאת קבצים (§5, שלב 4), ייבוא אקסל (§6, שלב 5), RPC-ים לתקציב (§4, שלב 6) — עדיין stub/כמו קודם.

### 2026-07-09 — שלב 2: commit + push
**סטטוס:** ✅ הצליח

המשתמשת אישרה להעלות. `git add -A` (וידוא ידני שאין `.env`/`node_modules`/`dist` בין הקבצים), commit ("Wire up Supabase auth and data-access layer (migration step 2)"), ונדחף ל-`origin/main` (8 קבצים, כולל מחיקת `ProtectedRoute.jsx` ויצירת `Login.jsx`). זה אמור להפעיל דיפלוי אוטומטי חדש ב-Cloudflare (git-connected).

**נותר לבדיקה ידנית**: לוודא שהוגדרו משתני הסביבה `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` בהגדרות פרויקט Cloudflare, לחכות שהדיפלוי החדש יסתיים, ואז לנסות להירשם בפועל דרך מסך ההתחברות באתר החי ולוודא שנוצרת שורת `profiles` תואמת ב-Supabase (Table Editor). **הבדיקה הזו נדחתה זמנית** — המשתמשת ממתינה לפתיחת גישה ב-Netfree (סינון תוכן) לאתר החי, ולכן ביקשה להמשיך לשלב הבא בינתיים.

### 2026-07-09 — שלב 4: העלאת קבצים
**סטטוס:** ⚠️ הצליח חלקית

בוצע לפי §5:
- **`supabase/migrations/0002_storage.sql`** (חדש): יצירת bucket ציבורי בשם `library-files` (`insert into storage.buckets`), + שתי מדיניות RLS על `storage.objects` (select פתוח לכולם דרך ה-bucket הציבורי, insert ל-authenticated בלבד). אומת איזון סוגריים תקין.
- **`src/api/base44Client.js`**: `integrations.Core.UploadFile` מומש בפועל (הוחלף ה-stub) — `supabase.storage.from('library-files').upload(path, file)` + `getPublicUrl()`, מוחזר כ-`{ file_url }`.
- **סטייה קטנה ומכוונת מהתוכנית**: §5 הציע מוסכמת נתיב `<entity>/<uuid>-<שם-קובץ>` (תת-תיקייה לפי סוג ישות), אך בפועל **אף אחת מ-6 נקודות הקריאה לא מעבירה מידע על הישות** ל-`UploadFile` (רק `{ file }`) — שינוי כל נקודות הקריאה כדי להעביר הקשר כזה היה סותר את עקרון "מינימום שינויים בנקודות קריאה" (§3). לכן המימוש בפועל הוא נתיב שטוח `<uuid>-<שם-קובץ>` (עדיין ללא התנגשויות, בזכות ה-uuid) — תועד כאן כסטייה מודעת, לא טעות.
- אומת: כל 6 נקודות הקריאה (`Inventory.jsx`, `Quotes.jsx`, `CreateQuoteRequestDialog.jsx`, `QuoteRequestTab.jsx`, `DocumentsTab.jsx`, `ProjectDialog.jsx`) קוראות עם `{ file }` ומצפות ל-`file_url` — תואם במדויק, אין צורך בשינוי אף אחת מהן. `npm run build` עבר בהצלחה.

**מה לא בוצע (הצלחה חלקית)**: קובץ המיגרציה `0002_storage.sql` **לא הורץ בפועל** על הפרויקט ב-Supabase (כמו בשלב 1 — דורש פעולה ידנית של המשתמשת ב-SQL Editor). **גם לא נבדק בפועל שהעלאת קובץ אמיתית עובדת** (דורש גישה לאתר החי, שממתינה לנטפרי). **טרם הועלה/נדחף ל-GitHub** — ממתין לאישור.

### 2026-07-09 — שלב 4: מיגרציית ה-Storage הורצה
**סטטוס:** ✅ הצליח

המשתמשת הריצה את `supabase/migrations/0002_storage.sql` ב-SQL Editor — "Success. No rows returned." ה-bucket `library-files` והמדיניות RLS שלו נוצרו בפועל. שלב 4 סגור מבחינת התשתית והקוד. עדיין ממתין: בדיקת העלאת קובץ אמיתית באתר החי (חסום ע"י נטפרי, לא דחוף).

### 2026-07-09 — שלב 4: commit + push
**סטטוס:** ✅ הצליח

המשתמשת אישרה. `git add -A`, commit ("Add Supabase Storage file uploads (migration step 4)"), נדחף ל-`origin/main` (3 קבצים). המשתמשת ביקשה להמשיך ישר לשלב 5 בזמן שהיא ממתינה לפתיחת גישה ב-Netfree.

### 2026-07-09 — שלב 5: ייבוא אקסל למלאי
**סטטוס:** ✅ הצליח

בוצע לפי §6:
- **`src/lib/excelImport.js`** (חדש): חולצו ההלוגיקה הגנרית של זיהוי-עמודות מ-`BookListForm.jsx` — `cleanColumnName`, `detectKey`, `detectColumns`, `looksLikeHeaderRow`, `findHeaderRowIndex`, ופונקציית תזמור חדשה `readExcelRows(file, { columnMap, anchorField, headerSignals })` שמאחדת את כל תהליך הקריאה (כולל הסריקה החוזרת למציאת שורת הכותרות האמיתית כשיש שורת הערה לפני זה). כל הפונקציות כעת מקבלות `columnMap` כפרמטר מפורש (במקום קבוע ברמת המודול), כדי שיתאימו לכל קורא.
- **`src/components/bookLists/BookListForm.jsx`**: שוכתב לצרוך את המודול המשותף במקום להגדיר את אותה לוגיקה מקומית — התנהגות זהה לחלוטין (אומת ע"י קריאה קפדנית והשוואת התהליך שורה-שורה, לא ניתן לבדוק בדפדפן אמיתי בסביבה הזו). תוך כדי, נוקו שני imports מתים שהיו קיימים כבר לפני השינוי הזה (`Upload`, `base44`) — אומת עם `git show HEAD:...` שהיו מתים גם בגרסה הקודמת, לא נגרמו ע"י הריפקטור.
- **`src/pages/Inventory.jsx`**: `handleImport` נכתב מחדש לגמרי — הוסר לגמרי `base44.integrations.Core.UploadFile`+`ExtractDataFromUploadedFile` (אין יותר העלאת קובץ לשרת בכלל לצורך הייבוא — פרסור צד-לקוח ישיר). נוסף `INVENTORY_COLUMN_MAP` (name/category/subcategory/current_quantity/minimum_quantity/unit/isbn/author, תואם בדיוק לשדות שהיו מקודדים קודם ב-`json_schema`) ו-`parseInventoryRow`. הודעת השגיאה/הצלחה וטקסט הדיאלוג עודכנו לשקף ייבוא דטרמיניסטי (הוסרה ההתייחסות ל"אגרון"/AI).
- אתגר טכני שנתקלתי בו ותועד לתועלת עתידית: כלי ה-Edit נכשל שוב ושוב בהתאמת מחרוזות שמכילות את התווים הבלתי-נראים המקוריים (zero-width space וכו') ב-regex של `cleanColumnName` — נפתר ע"י שימוש בסקריפט Node (`fs.readFileSync`/`splice`/`writeFileSync`) לעריכה כירורגית לפי מספרי שורות, תוך אימות קודי התווים בפועל (`codePointAt`) כדי לוודא שהתוכן הסופי זהה סמנטית למקור.
- **אימות**: `npm run build` עבר בהצלחה אחרי כל שינוי (3 פעמים לאורך הדרך). `npm run lint` — אפס שגיאות בשלושת הקבצים שנגעתי בהם (`excelImport.js` חדש, נקי; `BookListForm.jsx` ו-`Inventory.jsx` — נקיים אחרי ניקוי ה-imports המתים).

**לא בוצע**: בדיקה חיה בדפדפן אמיתי (לא זמינה בסביבה זו) — מומלץ שהמשתמשת תבדוק ידנית את שני זרימות הייבוא (רשימת ספרים + מלאי) ברגע שהאתר החי נגיש.

### 2026-07-09 — שלב 5: commit + push
**סטטוס:** ✅ הצליח

המשתמשת אישרה. `git add -A`, commit ("Replace AI-based Excel import with deterministic column matching (migration step 5)"), נדחף ל-`origin/main` (4 קבצים).

### 2026-07-09 — שלב 6: RPC-ים לתקציב/מלאי
**סטטוס:** ✅ הצליח

בוצע לפי §4:
- **`supabase/migrations/0003_budget_inventory_rpc.sql`** (חדש): שלוש פונקציות `plpgsql`, כולן `security definer`:
  - `apply_order_budget_transition(order_id, new_status)` — פורט מלא ואטומי של `updateBudgetCategory`/`updateSupplierCredit` המקוריים מ-`budgetUpdater.js`. נועל את שורת ההזמנה (`for update`), בודק את דגל `budget_updated` **מחדש בתוך הטרנזקציה** (לא סומך על מה שהלקוח קרא קודם — סוגר את מרוץ התנאים שהגרסה הישנה לא יכלה לסגור), מטפל בכל ארבעת המצבים (approved/received_full/received_partial/cancelled) הן לקטגוריית תקציב והן לזיכוי ספק, כולל בניית רשומות `transactions` (jsonb) זהות לפורמט המקורי.
  - `recalc_budget_source(source_id)` — פורט ישיר של סכימת ה-`reduce` המקורית ל-SQL aggregates, נקרא מתוך הפונקציה הראשונה (לא מסבב-הלוך-ושוב נפרד מהלקוח).
  - `apply_goods_receipt(order_id, new_status, received_date, confirmed_by, received_items)` — מחליף את לולאת ה-N+1 הסדרתית ב-`GoodsReceiptDialog.jsx` בלולאת `jsonb_array_elements` אחת בתוך הפונקציה: upsert ל-`inventory_items` (התאמה לפי name+category, בדיוק כמו הלוגיקה המקורית), הוספת movement, וסימון ההזמנה כ-received — הכל בטרנזקציה אחת.
  - `grant execute` מפורש ל-`authenticated` על שלוש הפונקציות.
  - אומת תחביר: איזון סוגריים תקין (0), 6 מפרידי `$$` (3 זוגות = 3 פונקציות).
- **`src/lib/budgetUpdater.js`**: שוכתב — `handleBudgetOnStatusChange`/`recalcBudgetSource` הפכו לעטיפות דקות סביב `supabase.rpc(...)`, **חתימות הפונקציות זהות לחלוטין** (אומת ב-grep ששני קוראים — `Credits.jsx` ו-`OrderDetail.jsx` — ממשיכים לעבוד בלי שינוי). `validateBudgetSelection` **נשאר ללא שינוי** לגמרי (בדיקת UX מוקדמת בצד לקוח, כמתוכנן — ה-RPC הוא הבדיקה הסמכותית).
- **`src/components/GoodsReceiptDialog.jsx`**: `processReceipt` שוכתב — הלולאה הסדרתית (N+1 קריאות `InventoryItem.filter`/`create`/`update`) הוחלפה בקריאת RPC יחידה. הוסרה גם משתנה מתה שהייתה קיימת כבר לפני השינוי (`someReceived`, מחושבת אך לא נעשה בה שימוש בפועל).
- ניקוי אגבי: הוסרו שני imports מתים שהיו קיימים כבר לפני השינוי (`Label`, `Textarea`) — אומת עם `git show HEAD:...` שהיו מתים גם קודם.
- **אימות**: `npm run build` עבר בהצלחה. `npm run lint` — אפס שגיאות בכל הקבצים שנגעתי בהם.

**לא בוצע**: קובץ המיגרציה `0003_budget_inventory_rpc.sql` **לא הורץ בפועל** על הפרויקט ב-Supabase (כמו בשלבים 1/4 — דורש הרצה ידנית ב-SQL Editor). בדיקה חיה של זרימת אישור/קבלת הזמנה אמיתית תלויה גם בגישה לאתר החי (עדיין ממתין לנטפרי) וגם בהרצת המיגרציה הזו.

### 2026-07-09 — שלב 6: commit + push
**סטטוס:** ✅ הצליח

המשתמשת אישרה. `git add -A`, commit ("Make budget/credit and goods-receipt updates atomic (migration step 6)"), נדחף ל-`origin/main` (4 קבצים). **נותר**: להריץ את `0003_budget_inventory_rpc.sql` ב-SQL Editor של Supabase.

### 2026-07-09 — שלב 7: הסרת הצימוד ל-Base44 בבנייה
**סטטוס:** ✅ הצליח

בוצע לפי §7:
- **`package.json`**: הוסרו `@base44/sdk` ו-`@base44/vite-plugin`. שם החבילה שונה מ-`base44-app` ל-`libraryos` (ניקוי אגבי קטן, לא היה מוזכר במפורש בתוכנית אך תואם את הרוח).
- **`vite.config.js`**: הוסר ה-import וההרשמה של ה-plugin `base44(...)`. **התגלתה תלות נסתרת**: ה-plugin היה אחראי (בשקט, בלי תיעוד גלוי) על הגדרת ה-alias `@/*` → `./src/*` ב-Vite — הסרתו שברה את ה-build לגמרי (`Rollup failed to resolve import "@/App.jsx"`). תוקן בהוספת `resolve.alias` מפורש ב-`vite.config.js`, תואם למיפוי הקיים כבר ב-`jsconfig.json`. זו הייתה ההפתעה המרכזית של השלב הזה.
- **`src/lib/app-params.js`**: נמחק (אומת מראש עם grep שאין לו אף import חי בקוד).
- **`base44/` → `docs/legacy-base44-schema/`**: הועבר (לא נמחק) כתיעוד קפוא — כולל תיקון תקלה טכנית: `git mv`/`mv` נכשלו עם "Permission denied" (כנראה קובץ נעול ע"י תהליך/עורך פתוח); נפתר ע"י `cp -r` ואז `rm -rf` על המקור, ואומת שכל 25 קבצי הישויות (24 + User) הועתקו במלואם.
- **`CLAUDE.md`**: עודכן במלואו — סעיפי "What this is", "Commands" (משתני סביבה), "Data access", "Auth", "Budget/credit side-effects" כעת מתארים את ארכיטקטורת Supabase/Cloudflare הנוכחית במקום Base44. כל אזכור נותר של "base44" בקובץ נבדק ואומת שהוא מכוון (שם הקובץ `base44Client.js` שנשמר בכוונה, וההערה ההיסטורית על המעבר).
- **`.env.local`**: כבר מכיל את משתני Supabase מקודם (שלב 2) — לא נדרש שינוי.
- הורץ `npm install` מחדש — 21 חבילות הוסרו (Base44 SDK + תלויות משנה שלו). 623 חבילות נותרו.
- **אימות**: `npm run build` נכשל בהתחלה (הבעיה עם ה-alias שתוארה למעלה), תוקן ואז עבר בהצלחה. `npm run lint` — 59 שגיאות, כולן קיימות מראש בקבצים שלא נגעתי בהם (ירד מ-63 בשלב 2 בזכות הניקויים האגביים בשלבים 5-6). הרצתי שרת dev מקומי ווידאתי עם curl ש-`@/App.jsx` ו-`@/pages/Login.jsx` נטענים תקין (HTTP 200) — כלומר ה-alias שתוקן עובד גם ב-dev וגם ב-build.

### 2026-07-09 — שלב 7: commit + push
**סטטוס:** ✅ הצליח

המשתמשת אישרה (אחרי בקשת הבהרה על הודעה לא ברורה). `git add -A` — git זיהה נכון 26 rename מ-`base44/` ל-`docs/legacy-base44-schema/` (לא delete+add). commit ("Remove Base44 build coupling (migration step 7)"), נדחף ל-`origin/main` (33 קבצים). זה יפעיל דיפלוי Cloudflare חדש — כדאי לוודא שה-build המרוחק גם עובד עם תיקון ה-alias (אמור לעבוד, זו אותה קונפיגורציית vite בדיוק, אך טרם אומת בפועל שם).

### 2026-07-09 — שלב 8: קובץ _redirects לניתוב SPA
**סטטוס:** ⚠️ הצליח חלקית

בוצע לפי §8: נוצר `public/_redirects` עם `/*  /index.html  200` (fallback לניתוב צד-לקוח של react-router). אומת ב-build מקומי (`npm run build`) שהקובץ אכן מועתק ל-`dist/_redirects`. שאר §8 (build command `npm run build`, output directory `dist`, git+GitHub) כבר הושלמו בשלבים קודמים.

**פער שהתגלה בבדיקה**: **אין אישור מפורש** שמשתני הסביבה `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` אכן הוגדרו בהגדרות פרויקט Cloudflare (התבקש מהמשתמשת מוקדם יותר בשיחה, אך לא אושר בפירוש שבוצע בפועל). בלי זה, האתר החי לא יוכל להתחבר ל-Supabase כלל, גם אחרי כל שאר השלבים. **נדרש אימות מהמשתמשת** לפני שאפשר לראות בשלב 9.

**אושר בפועל**: המשתמשת ניגשה לאתר החי וקיבלה שגיאת קונסולה `Uncaught Error: supabaseUrl is required` — מאשר במדויק את הפער שזוהה: משתני הסביבה אינם מוגדרים ב-Cloudflare. (שגיאה נפרדת ולא-קשורה: `manifest.json` syntax error + משאב אחד חסום ע"י NetFree (סטטוס 418) — כנראה לא קריטי לתפקוד, לא ה-Supabase client עצמו). **הפעולה הנדרשת**: להוסיף את שני המשתנים ב-Cloudflare Settings → Variables and Secrets, ואז להריץ דיפלוי מחדש (שינוי משתני סביבה לא חל על build קיים — Vite "אופה" אותם לתוך הקוד בזמן build, לא נקרא בזמן ריצה).

**עדכון — המשתנים נוספו בהצלחה**: המשתמשת מצאה את המקום הנכון (לא "Variables and secrets" הכללי של ה-Worker runtime — זה חסום ל"Worker שיש לו רק static assets" — אלא תחת **Settings → Build → Variables and secrets**, שהם משתני build-time). הוסיפה את שני המשתנים שם בהצלחה (אושר בלוג ה-build: `Build variables: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY`).

**באג נוסף שהתגלה**: ניסיון לבנות מחדש (בעקבות push של `public/_redirects` משלב 8) **נכשל** בשלב ה-deploy עם השגיאה: `Invalid _redirects configuration: Line 1: Infinite loop detected in this rule...` [code: 100324]. הסיבה: הפלטפורמה החדשה של Cloudflare (Workers עם static assets, לא Pages הקלאסי) **כבר מטפלת בניתוב SPA אוטומטית** דרך `wrangler.jsonc` שנוצר אוטומטית (`"assets": {"not_found_handling": "single-page-application"}`) — קובץ `_redirects` ידני עם `/* → /index.html` מתנגש עם ההתנהגות המובנית ונחסם ע"י הפלטפורמה כ"לולאה אינסופית". **תוקן**: הוסר `public/_redirects` לגמרי (ותיקיית `public/` הריקה שנשארה) — §8 בתוכנית הניח בטעות שצריך קובץ `_redirects` בסגנון Pages הקלאסי; ההנחה לא התאימה למוצר בפועל ש-Cloudflare השתמשו בו (Workers, לא Pages). אומת מקומית: `npm run build` עובד תקין בלי הקובץ.

**שלב 9 (בדיקה חיה) התחיל בפועל**: המשתמשת גישה לאתר החי לאחר תיקון משתני הסביבה — מסך ההתחברות עלה תקין. הרשמה ראשונה נתקלה ב-429 (Too Many Requests) מ-Supabase Auth על שליחת מייל אימות — הוסבר כמגבלת קצב זמנית של שירות המייל המשותף של Supabase (לא קשור לקוד); המשתמשת בחרה להשאיר אימות מייל דלוק ולחכות/לנסות שוב מאוחר יותר, במקום לבטלו. ההרשמה בפועל הצליחה בסופו של דבר — אומת ב-Table Editor ששורת `profiles` נוצרה אוטומטית ע"י טריגר `handle_new_user` עם `full_name` נכון ו-`role='user'` (ברירת המחדל).

**באג נוסף שהתגלה ותוקן — `protect_profile_role` חוסם עדכוני SQL Editor לגיטימיים**: ניסיון לשדרג את המשתמשת הראשונה ל-`admin` דרך `update public.profiles set role='admin' where email=...` ב-SQL Editor הצליח ("Success") אך **לא שינה בפועל את הערך** — כי הטריגר `protect_profile_role` (משלב 1) קרא ל-`is_admin()` שבודק `auth.uid()`, וזה `null` כשמריצים SQL ישירות (אין הקשר JWT/session) — הטריגר פירש null כ"לא-אדמין" והחזיר את הערך הישן בשקט, בלי שגיאה גלויה. **תוקן**: `supabase/migrations/0004_fix_profile_role_trigger.sql` — הטריגר עודכן לאכוף את החסימה **רק** כש-`auth.uid() is not null` (כלומר רק בבקשות אמיתיות מהאתר, לא בחיבור ישיר/פריבילגי כמו SQL Editor). המשתמשת הרצה את התיקון + את עדכון ה-role מחדש ב-SQL Editor.

**ניקוי נוסף (לא היה בתוכנית, התגלה תוך כדי בדיקה)**: `index.html` הכיל שרידי Base44 — favicon מקושר ל-`https://base44.com/logo_v2.svg` (משאב חיצוני!), `<title>Base44 APP</title>`, והפניה ל-`/manifest.json` שלא קיים בפרויקט כלל (זה היה מקור שגיאת "Manifest: Syntax error" שחזרה על עצמה בקונסולה לאורך כל הבדיקות). תוקן: נוצר `public/favicon.svg` (אייקון ספר בגרדיאנט סגול-כחול, תואם לעיצוב הקיים ב-Layout.jsx/Login.jsx), הכותרת שונתה ל-"LibraryOS", והפניית ה-manifest השבורה הוסרה. אומת ב-build מקומי שהקובץ נכנס ל-`dist/favicon.svg` ושה-HTML תקין.

**בעיית דיפלוי חוזרת (לא תוכנית, נתגלתה ותוקנה)**: אחרי הסרת `public/_redirects` (רשומה למעלה), שני ניסיונות build עוקבים **המשיכו להיכשל עם אותה שגיאת `_redirects` "Infinite loop"** — למרות שהקובץ לא היה קיים יותר בריפו. הסיבה: מטמון ה-build של Cloudflare החזיק גרסה ישנה/תקועה של הנכסים מניסיון כושל קודם. **תוקן**: המשתמשת ניקתה את מטמון ה-build (Settings → Build → Build cache → Clear Cache), ונדחף commit ריק (`--allow-empty`) כדי להפעיל build נקי לגמרי. זה פתר את הבעיה.

**באג אמיתי באפליקציה שהתגלה בבדיקה חיה — 400 Bad Request ביצירת פרויקט**: לחיצה על "צור פרויקט" לא עשתה כלום (בפועל: `POST .../rest/v1/projects 400 Bad Request`, ללא הודעת שגיאה גלויה למשתמשת). **סיבת שורש**: טפסים ברחבי האפליקציה (כאן `ProjectDialog.jsx`) ממלאים ברירת מחדל של שדות אופציונליים שלא נבחרו (מפתחות זרים כמו `branch_id`/`budget_source_id`, שדות תאריך כמו `start_date`) כ-**מחרוזת ריקה `''`**, לא `null`. Base44 (הבק-אנד הישן) היה סובלני לזה; Postgres/PostgREST **דוחה** `''` עבור עמודות מסוג `uuid`/`date`/`numeric` עם שגיאת 400. זו לא בעיה ספציפית לפרויקטים — היא הייתה משפיעה על **כל** ישות עם שדה FK/תאריך אופציונלי בטופס שלה (כמעט כל הישויות). **תוקן במקום מרכזי אחד**: נוספה פונקציית `sanitizePayload()` ב-`src/api/base44Client.js`, שממירה כל `''` ל-`null` ברמת השדות העליונים (לא בתוך בלובי JSONB מקוננים כמו `items`/`books`/`transactions`, כדי לא לגעת בתוכן שלהם), ומופעלת אוטומטית בתוך `create`/`update`/`bulkCreate` של **כל** הישויות — תיקון גורף, לא רק ל-Project. אומת: `npm run build` עבר בהצלחה.

**בעיית מטמון build חוזרת בשנית — ותוקנה סופית**: אחרי push של תיקון ה-`sanitizePayload`, הבדיקה החוזרת נכשלה עם **אותה שגיאת 400 בדיוק**, ושם קובץ ה-JS באתר לא השתנה (`index-DqRNucxC.js`) למרות שהלוג הראה "Success! Build completed". אומת ישירות: build נקי מקומי (עם מחיקת `dist/` ו-`node_modules/.vite` תחילה) הפיק שם קובץ **שונה לגמרי** (`index-DC9QnPuF.js`) — הוכחה חד-משמעית שקלאודפלייר לא באמת בנה את הקוד העדכני, אלא הגיש גרסה תקועה במטמון, בדיוק כמו בעיית ה-`_redirects` הקודמת. הפעם, במקום רק לנקות את המטמון, המשתמשת **כיבתה את "Build cache" לגמרי** (Settings → Build → Disable) כדי למנוע הישנות. נדחף commit ריק נוסף כדי להפעיל build נקי לגמרי תחת התצורה החדשה.

**אושר**: אחרי כיבוי מטמון ה-build, יצירת פרויקט **עבדה בפועל** (400 נעלם). שגיאת 400 החוזרת אכן הייתה תוצאה של המטמון התקוע, לא כשל בתיקון `sanitizePayload` עצמו.

**באג נוסף שהתגלה בבדיקה חיה — דיאלוג לא נסגר אחרי שמירה מוצלחת**: אחרי יצירת פרויקט בהצלחה, החלונית (Dialog) נשארה פתוחה במקום להיסגר. **סיבת שורש**: `handleSave` ב-`src/pages/Projects.jsx` קרא ל-`toast.success`/`load()` אחרי יצירה/עדכון מוצלחים, אך מעולם לא קרא ל-`setDialogOpen(false)` — באג קיים-מראש באפליקציה (לא קשור למעבר מ-Base44), פשוט לא התגלה קודם כי זה הפעם הראשונה שהתכונה נבדקה בפועל מול בק-אנד חי. **תוקן**: נוספה קריאה ל-`setDialogOpen(false)` ב-`handleSave`.

**סריקה יזומה מצאה עוד 7 מופעים זהים של אותו באג** (סוכן חקירה ברקע): `AttendanceTab.jsx`, `TasksTab.jsx`, `MilestonesTab.jsx`, `ContactsTab.jsx`, `DomainTab.jsx`, `GoalsTab.jsx`, `PersonnelTab.jsx` — כולם עם אותה תבנית מדויקת (`setEditing(null); onLoad();` בלי `setDialogOpen(false)`). **כל 7 תוקנו** באותו אופן. הסוכן אימת גם שדפים/דיאלוגים אחרים (Suppliers, Staff branches/employees/volunteers/positions/schedule, Quotes, Orders, Inventory, Categories, Credits, Settings) **לא** סובלים מהבאג הזה — הם או סוגרים במפורש מהצד ה-parent, או שהדיאלוג עצמו סוגר את עצמו (`onOpenChange(false)` בתוך רכיב הדיאלוג). אומת: `npm run build` עבר בהצלחה אחרי כל 7 התיקונים.

**באג משמעותי נוסף שהתגלה בבדיקה חיה — "הכל מתרענן" בחזרה לטאב**: המשתמשת דיווחה שכל פעם שהיא עוברת לאתר/טאב אחר וחוזרת, האפליקציה "מתרעננת" ומאפסת את מה שהיא הייתה באמצע לעשות. **סיבת שורש**: `src/lib/AuthContext.jsx` קרא ל-`checkUserAuth()` (שמדליק `isLoadingAuth=true`, מציג מסך טעינה מלא-עמוד שממיר לחלוטין את עץ ה-`<Routes>`) בכל אירוע `onAuthStateChange` — וSupabase יורה אירועים כאלה (רענון טוקן וכו') **גם כשהטאב חוזר לפוקוס**, לא רק בהתחברות/התנתקות אמיתית. כל חזרה לטאב הפעילה מחדש את מסך הטעינה המלא, שמחליף את כל עץ הדפים (ולכן מאפס טפסים/מיקום גלילה/מצב רכיבים). זה באג אמיתי, לא קשור לנטפרי או לדפדפן. **תוקן**: `AuthContext.jsx` שוכתב כך שרק הבדיקה **הראשונית** (עם עליית הדף) מדליקה את `isLoadingAuth` — אירועי `onAuthStateChange` עוקבים (כולל רענון טוקן ברקע) מעדכנים את מצב המשתמש/הרשאה בשקט, בלי לגעת ב-`isLoadingAuth`/`authChecked`, ובלי להחליף את כל העץ. אומת: `npm run build` עבר בהצלחה. **אושר בפועל** — אחרי רענון קשיח (הבדיקה הראשונה הייתה על גרסה ישנה במטמון), המשתמשת אישרה שהתופעה נעלמה לגמרי.

### 2026-07-13 — שינוי פיצ'ר (בקשת משתמשת): מקורות תקציב חופשיים בפרויקטים
**סטטוס:** ✅ הצליח

בקשה: בטופס פרויקט, שדה "מקור תקציב" (שהיה תפריט נפתח יחיד לבחירת `BudgetSource` קיים מהמערכת הפורמלית) יהפוך לשדה טקסט חופשי, עם אפשרות להוסיף כמה מקורות תקציב (לא רק אחד).

בוצע:
- **`supabase/migrations/0005_project_budget_source_names.sql`**: נוספה עמודה `budget_source_names jsonb not null default '[]'::jsonb` לטבלת `projects`. העמודות הישנות `budget_source_id`/`budget_source_name` **לא נמחקו** (נשארות ללא שימוש — הימנעות ממחיקת עמודה הרסנית שאינה הכרחית).
- **`src/components/projects/ProjectDialog.jsx`**: הוסר ה-`Select` שבחר `BudgetSource` קיים; הוחלף ברשימת שדות טקסט חופשיים (הוספה/הסרה של שורות) הנשמרים כמערך ב-`budget_source_names`. הוסרה תלות ב-prop `budgetSources` שכבר לא נדרש.
- **`src/components/projects/BudgetTab.jsx`**: תצוגת "מקור תקציב" (יחיד) הוחלפה בתצוגת "מקורות תקציב" (רשימה, מחוברת בפסיקים).
- **ניקוי אגבי**: `src/pages/Projects.jsx` ו-`src/pages/ProjectDetail.jsx` — הוסרה טעינת `BudgetSource.list()` ו-state `budgetSources` שהיו משמשים רק להעברה ל-`ProjectDialog` (ולא לשום דבר אחר) — אומת ב-grep לפני ההסרה.
- **אימות**: `npm run build` עבר בהצלחה. `npm run lint` — 2 שגיאות בקבצים שנגעתי בהם (`BudgetTab.jsx`: `FileText` לא בשימוש; `ProjectDetail.jsx`: `Link` לא בשימוש) — שתיהן קיימות מראש (אומת עם `git show HEAD:...`), לא נגרמו ע"י השינוי הזה.

**הבהרה**: זה שינוי נפרד מהמערכת הפורמלית לניהול תקציב (BudgetSource/BudgetAllocation, המשמשת להזמנות רכש) — לא נגעתי בה. זה שדה תיעודי-חופשי ברמת הפרויקט בלבד.

### 2026-07-14 — פתרון סופי ל"הרדמת" Supabase: UptimeRobot במקום GitHub Actions
**סטטוס:** ✅ הצליח

בבדיקה חוזרת התברר שקובץ ה-workflow ב-GitHub Actions שתוכנן ב-§8 **מעולם לא נוצר בפועל** (רק תואר בתוכנית). המשתמשת שיתפה חוויה של קולגה עם בעיה דומה (Render+Supabase חינמיים) שנפתרה ב-**UptimeRobot** — כלי ניטור חיצוני חינמי. הוקם ניטור HTTP(s) ב-UptimeRobot שפונה ישירות לנקודת קצה ב-Supabase REST API (`/rest/v1/profiles?select=id&limit=1&apikey=...`) — לא לאתר החי, כי Cloudflare מגיש רק HTML/JS סטטי ובלי דפדפן שמריץ את ה-JS הפנייה בפועל ל-Supabase לא הייתה קורית. נבדק בפועל: הניטור פעיל ("Up"), נבדק כל 5 דקות, 100% uptime. זה גם פותר את בעיית ה-pause וגם נותן ניטור/התראות אמיתיים בחינם — שיפור על הרעיון המקורי. עודכן §8 ו-§10 בהתאם. אין קוד לתחזק בריפו לפתרון הזה (מוגדר כולו בממשק UptimeRobot).

---

## §11 — פיצ'ר חדש (בקשת משתמשת): מודול "פרויקטים" בסגנון גיליון/Smartsheet במקום טפסים

### הקשר
המשתמשת ביקשה שמודול "ניהול פרויקטים" (בלבד — לא שאר האפליקציה) יעבור מדפוס "כפתור → דיאלוג עם טופס שדות → שמירה" לדפוס גיליון: לחיצה ישירה על תא בטבלה, הקלדה, שמירה אוטומטית — בסגנון Smartsheet/ClickUp. הוחלט (Q&A ישיר):
- **היקף**: מודול הפרויקטים בלבד.
- **ספרייה**: `react-data-grid` (MIT, ~גרסת 7.x beta — הגרסה היציבה היחידה הפעילה נכון להיום) — נבחרה על פני בנייה עצמאית כי היא נותנת ניווט מקלדת/עריכת-תא/העתק-הדבק "בחינם", בלי לבנות הכל ידנית.
- **תחומים (Domains)**: טבלת גיליון שטוחה (מוותרים על הקיפול ההיררכי הוויזואלי, `parent_domain_id` נשאר עמודה לעריכה).
- **עריכת פרויקט**: כפתור "עריכה" בעמוד `/projects/:id` **מוסר** — עריכת שדות פרויקט תתבצע רק דרך טבלת הגיליון הראשית ב-`/projects`.
- **GoalsTab/PersonnelTab** (`project_goals`/`project_members`): **נשארים מחוץ להיקף** — אומת ש**אינם מחוברים בכלל** ל-Tabs בפועל ב-`ProjectDetail.jsx` (קוד לא-נגיש, לא שווה להמיר UI שאף אחד לא רואה).
- **DocumentsTab**: **כן מומר** לגיליון (עקביות עם שאר הטאבים), עם העלאת קובץ כ-popover קטן במקום הפאנל הנוכחי.

### ארכיטקטורה (מתוכנן ע"י Plan agent, מאומת חלקית ידנית)
- **תלות חדשה**: `react-data-grid` ב-`package.json` + import גיליון סגנון (`react-data-grid/lib/styles.css`) פעם אחת ב-`src/index.css`, **לפני** דירקטיבות ה-`@tailwind`. מיפוי משתני CSS של הספרייה (`--rdg-*`) למשתני העיצוב הקיימים של האפליקציה (`--background`, `--foreground`, `--border` וכו', כבר בפורמט HSL triple — אומת ב-`src/index.css`). אין מצב כהה חי באפליקציה כרגע (אומת) — תמיד `className="rdg-light"`, לא בונים תמיכת dark-mode לא-בשימוש.
- **מודול משותף חדש** `src/components/projects/grid/`:
  - `columnHelpers.js` — פונקציות בונות-עמודה גנריות: `textColumn`, `numberColumn`, `dateColumn`, `selectColumn` (enum, קורא מה-`*_LABELS`/`*_COLORS` הקיימים ב-`src/lib/projectUtils.js`), `booleanColumn`, `fkPickerColumn` (כותב זוג id+name **באותה קריאת `onRowChange`**, תומך גם ב-variant `noNameColumn` ל-`project_contacts.task_id` שאין לו עמודת-שם מקבילה בסכמה — משיג תצוגה בעזרת lookup חי).
  - `ProjectDataGrid.jsx` — עטיפה סביב `<DataGrid>`: `readOnly` בוליאני יחיד שהופך את כל העמודות ל-non-editable ומסתיר כפתורי הוספה/מחיקה (נגזר מבדיקות ה-`can*` הקיימות ב-`src/lib/permissions.js`, לא נבנות בדיקות הרשאה חדשות).
  - `popoverCellEditors.jsx` — לשדות ה-jsonb (`file_urls` על משימות, `related_task_ids` על אבני דרך, `budget_source_names`/`budget_approval_file_url` על פרויקט) — לא נכנסים לתא טקסט, אלא נפתחים כ-`Popover` קטן (shadcn, לא `Dialog`) — עדיין "בלי טופס מודלי גדול".
- **שמירה**: כל commit של תא (`onRowsChange`) קורא מיידית ל-`base44.entities.X.update(row.id, { [key]: value })` (שדה בודד, לא כל השורה — נמנע דריסת עריכות מקבילות). **אין** `onLoad()`/רענון מלא אחרי כל עריכת תא (היה גורם להבהוב תוך כדי הקלדה) — רק אחרי הוספה/מחיקה של שורה. כישלון → toast.error + שחזור הערך המקומי. react-data-grid מבצע commit ב-blur/Enter, לא per-keystroke — אין צורך ב-debounce.
- **הוספת שורה**: כפתור טולבר "+" (permission-gated, כמו הדפוס הקיים) שיוצר מיידית רשומה עם ברירת-מחדל placeholder (למשל `name: 'תחום חדש'`) דרך `.create()` — לא "שורת טיוטה" מקומית — נמנע מ-state נוסף של "האם זה נשמר כבר".
- **מחיקת שורה**: אייקון פח לכל שורה + `confirm()` דפדפן, בדיוק כמו היום (לא bulk-select).
- **הרשאות**: `readOnly` ברמת כל גיליון (למשל `!canCreateTasks(user)`), חוץ מעמודת הסטטוס בטבלת המשימות שנשארת ניתנת לעריכה גם ל-`user` רגיל (`canUpdateTaskStatus` רופף יותר מ-`canCreateTasks` — אומת בקוד).

### קבצים שיושפעו
- **חדשים**: `src/components/projects/grid/columnHelpers.js`, `ProjectDataGrid.jsx`, `popoverCellEditors.jsx`.
- **מומרים לגיליון**: `src/pages/Projects.jsx`, `src/components/projects/{DomainTab,TasksTab,MilestonesTab,ContactsTab,DocumentsTab}.jsx`.
- **מוסר כפתור עריכה** (לא מומר): `src/pages/ProjectDetail.jsx`.
- **נמחקים בסוף** (אחרי אימות grep שאין עוד import): `ProjectDialog.jsx`, `DomainDialog.jsx`, `TaskDialog.jsx`, `MilestoneDialog.jsx`, `ContactDialog.jsx`.
- **ללא שינוי**: `OverviewTab.jsx`, `ReportsTab.jsx` (קריאה-בלבד, אין טפסים), `BudgetTab.jsx` (שייך למערכת התקציב הפורמלית הנפרדת — לא נוגעים), `ImportTasksDialog.jsx`/ייצוא אקסל (פיצ'ר נפרד מהמרת דיאלוג→גיליון).

### אימות מתוכנן (ידני, אין סוויטת בדיקות בריפו)
לכל גיליון: יצירה+רענון-דף לאימות התמדה; עריכת כל סוג תא (טקסט/מספר/תאריך/enum/בוליאני); עריכת FK-picker + אימות ששני השדות (id+name) נכתבים; פתיחת ה-popover לשדות jsonb; מחיקת שורה; בדיקת הרשאות כ-role נמוך יותר (סטטוס משימה נשאר ניתן לעריכה, שאר השדות לא); `npm run build`/`npm run lint` אחרי כל מחיקת דיאלוג.
