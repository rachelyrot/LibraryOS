<div align="center">

# 📚 LibraryOS

### מערכת ניהול רכש · מלאי · תקציב · כוח אדם — לספריית בני ברק

<p>
  <img alt="React" src="https://img.shields.io/badge/React-18.2-61DAFB?logo=react&logoColor=white&labelColor=20232a">
  <img alt="Vite" src="https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white&labelColor=20232a">
  <img alt="Supabase" src="https://img.shields.io/badge/Supabase-Postgres%20%2B%20Auth%20%2B%20Storage-3ECF8E?logo=supabase&logoColor=white&labelColor=20232a">
  <img alt="Cloudflare" src="https://img.shields.io/badge/Cloudflare-Workers%20%2F%20Static%20Assets-F38020?logo=cloudflare&logoColor=white&labelColor=20232a">
  <img alt="Tailwind" src="https://img.shields.io/badge/Tailwind-3.4-06B6D4?logo=tailwindcss&logoColor=white&labelColor=20232a">
  <img alt="RTL" src="https://img.shields.io/badge/UI-Hebrew%20%2F%20RTL-6f42c1?labelColor=20232a">
  <img alt="License" src="https://img.shields.io/badge/license-internal-lightgrey?labelColor=20232a">
</p>

**SPA עצמאית לחלוטין** — ללא שרת מותאם אישית מעבר לפונקציות Postgres.
כל הלוגיקה העסקית הרגישה (תקציב, זיכויים, קבלת סחורה) רצה כטרנזקציה אטומית אחת בבסיס הנתונים, לא בקוד לקוח.

</div>

---

## 🗂️ תוכן עניינים

- [מה זה](#-מה-זה)
- [יכולות עיקריות](#-יכולות-עיקריות)
- [ארכיטקטורה במבט-על](#️-ארכיטקטורה-במבט-על)
- [שני תהליכי רכש נפרדים](#-שני-תהליכי-רכש-נפרדים-לא-לערבב)
- [תפקידים והרשאות](#-תפקידים-והרשאות)
- [התחלה מהירה](#-התחלה-מהירה)
- [פקודות זמינות](#-פקודות-זמינות)
- [מבנה הפרויקט](#-מבנה-הפרויקט)
- [עקרונות ליבה](#-עקרונות-ליבה-אל-תשברו-את-אלה)
- [פריסה](#-פריסה)

---

## 🧭 מה זה

**LibraryOS** מנהלת את כל מחזור החיים התפעולי של ספרייה עירונית:
הזמנות רכש, הצעות מחיר, ייבוא רשימות ספרים, ניהול מלאי, מקורות תקציב והקצאות, זיכויי ספקים, נוכחות וסידור עבודה של צוות, וניהול פרויקטים ארגוניים — הכול תחת ממשק עברי מלא (RTL), מהיר, ונטול שרת ייעודי.

הפרויקט הוגר במקור על גבי **Base44**, ועבר הגירה מלאה לסטאק עצמאי: **Supabase** (Postgres + Auth + Storage) בצד השרת, ו-**Cloudflare** (Workers עם static assets) באחסון ה-UI.

## ✨ יכולות עיקריות

| תחום | מה זה עושה |
|---|---|
| 🛒 **רכש והזמנות** | יצירה → הגשה → אישור → קבלת סחורה, עם מעקב סטטוס מלא |
| 💰 **תקציב** | מקורות תקציב → הקצאות לפי קטגוריה, שריון/ניצול אטומי בזמן אמת |
| 🧾 **זיכויי ספקים** | ניהול יתרות זיכוי מול ספקים כאלטרנטיבה למקור תקציב |
| 📦 **מלאי** | עדכון מלאי אך ורק בקבלת סחורה בפועל — לא בהזמנה ולא באישור |
| 📖 **רכש ספרים** | רשימות ספרים מספקים → הצעות מחיר ייעודיות → הזמנת רכש |
| 🧑‍💼 **כוח אדם** | עובדות, תקנים מאושרים, סניפים, נוכחות, סידור עבודה |
| 🏗️ **פרויקטים** | תקציב פר-מקור, משימות, אבני דרך, אנשי קשר, מסמכים — הכול ב-grid ניתן לעריכה |
| 📊 **דשבורדים** | כרטיסי סיכום מתחלפים, drilldown לרשימה מסוננת, גרפי עוגה קטגוריאליים |

## 🏛️ ארכיטקטורה במבט-על

```
┌─────────────────────────────┐        ┌──────────────────────────┐
│   React 18 SPA (Vite 6)     │        │        Supabase          │
│   Cloudflare Workers/Assets │◄──────►│  Postgres + Auth + Storage│
│                              │  REST  │  RLS policies            │
│  src/api/base44Client.js    │  RPC   │  plpgsql transactions     │
│  (Base44-shaped shim)       │        │  (supabase/migrations/*.sql)│
└─────────────────────────────┘        └──────────────────────────┘
```

כל קריאה/כתיבה עוברת דרך `src/api/base44Client.js` — עטיפה דקה סביב `@supabase/supabase-js` השומרת על **אותה צורת אובייקט** שהאפליקציה נכתבה מולה במקור (`base44.entities.X.list/filter/get/create/update/delete`), כך שכ-50 נקודות קריאה בכל האפליקציה לא נדרשו לשינוי בעת מעבר הבק-אנד.

פעולות רגישות (שינוי סטטוס הזמנה, קבלת סחורה) לא מבוצעות כרצף קריאות מהלקוח — הן קוראות לפונקציית `plpgsql` אחת (`supabase.rpc(...)`) שמבצעת **read-modify-write אטומי** עם `for update` row locking, עם דגלי guard (`budget_updated`, `inventory_updated`) הנבדקים *בתוך* הטרנזקציה — לא נסמכים על מה שהלקוח חושב שהוא יודע.

## 🔀 שני תהליכי רכש נפרדים — לא לערבב

```
ספרים:        SupplierBookList ──► BookQuoteRequest ──► PurchaseOrder
ציוד/שירותים: QuoteRequest ─────────────────────────────► PurchaseOrder
```

ההפרדה הזו **מכוונת** — ספרים לעולם לא עוברים דרך `QuoteRequest`, וציוד/שירותים לעולם לא דרך `SupplierBookList`. דגלים כמו `order_created`/`linked_order_id` מונעים יצירת הזמנה כפולה מאותו מקור.

## 🔐 תפקידים והרשאות

| תפקיד | מה מותר |
|---|---|
| `admin` | סופר-משתמש טכני, כולל שינוי `role` של משתמשים ב-Supabase Studio |
| `remote_manager` | אישור/דחייה של הזמנות, נראות פיננסית מלאה |
| `local_manager` | יצירת הזמנות, קבלת סחורה, ניהול מלאי — ללא אישור פיננסי |
| `user` | טיוטות בלבד, ללא נתונים פיננסיים רגישים |

כל פעולה רגישה מוגנת **בשתי שכבות**: ב-UI (הסתרה/נטרול) *וגם* בנקודת הקריאה בפועל ל-`base44.entities.X.update/create` (דרך הפונקציות ב-[`src/lib/permissions.js`](src/lib/permissions.js)) — הגנת UI לבדה לא מספיקה.

## 🚀 התחלה מהירה

```bash
git clone <repo-url>
cd bnei-brak-library
npm install
```

צרו `.env.local`:

```env
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=<anon/publishable key>
```

> 🔓 מפתח ה-anon בטוח לחשיפה בצד לקוח בעיצוב — **RLS policies, לא סודיות המפתח**, הם מה שמגן בפועל על הנתונים.

```bash
npm run dev
```

## 🛠️ פקודות זמינות

| פקודה | מה היא עושה |
|---|---|
| `npm run dev` | שרת פיתוח (Vite) |
| `npm run build` | בילד לפרודקשן |
| `npm run preview` | תצוגה מקדימה של בילד הפרודקשן |
| `npm run lint` | ESLint (`--quiet`) |
| `npm run lint:fix` | ESLint עם תיקון אוטומטי |
| `npm run typecheck` | בדיקת טיפוסים (`tsc`, `checkJs`, לא פרויקט TS מלא) |

אין כרגע test runner מוגדר בריפו — אין להניח קיום Jest/Vitest.

## 📁 מבנה הפרויקט

```
src/
├─ api/base44Client.js      # שכבת גישה יחידה ל-Supabase (Base44-shaped shim)
├─ lib/
│  ├─ AuthContext.jsx       # session + profiles gate
│  ├─ permissions.js        # can*(user, ...) — כל בדיקת הרשאה עוברת כאן
│  └─ budgetUpdater.js      # עטיפות RPC לתקציב/זיכוי
├─ pages/                   # דפים שטוחים, נתיבים מוגדרים ב-App.jsx
├─ components/
│  ├─ budget/ staff/ projects/ bookLists/ bookProcurement/ quotes/ ...
│  └─ ui/                   # shadcn/ui — vendored, לא לערוך ידנית
└─ docs/SystemSpecification.md   # מקור האמת לתהליכי עבודה והרשאות (עברית)

supabase/migrations/*.sql   # סכמת האמת החיה — DDL, RLS, RPC
docs/legacy-base44-schema/  # סכמת Base44 המקורית, קפואה, לתיעוד היסטורי בלבד
```

## 📐 עקרונות ליבה (אל תשברו את אלה)

- 🔒 **הרשאות בשתי שכבות** — UI וגם נקודת המוטציה בפועל.
- ⚛️ **RPC אטומי, לא רצף קריאות** — כל שינוי סטטוס שמשפיע על תקציב/מלאי חייב לעבור דרך פונקציית Postgres יחידה עם row locking.
- 📦 **מלאי מתעדכן רק בקבלת סחורה בפועל** — לא ביצירת הזמנה, לא באישור.
- 🚫 **ספרים ↔ ציוד לא מתערבבים** — שני תהליכי רכש נפרדים, במתכוון.
- 🗄️ **מיגרציה חדשה, לא עריכה** — אין לערוך ידנית מיגרציה שכבר הוחלה; מוסיפים קובץ ממוספר חדש.
- 🌐 **הכול RTL ובעברית** — טקסט UI חדש נשאר עברי, עקבי לשאר האפליקציה.

## ☁️ פריסה

Frontend רץ על **Cloudflare** (Workers + static assets). ה-build command הוא `npm run build`, ה-output הוא `dist/`. אין תלות בשרת מותאם אישית — כל הלוגיקה השרתית היא Postgres (`plpgsql`) ב-Supabase.

---

<div align="center">

נבנה עם ☕, RTL, ותשומת לב יתרה לאטומיות של טרנזקציות תקציב.

</div>
