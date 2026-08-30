-- LibraryOS -- קישור ספק לקטגוריית תקציב (budget_allocations).
--
-- Why:
-- קטגוריות התקציב ("ספרים", "פעולות תרבות"...) נוצרו עד היום עם שם וסכום בלבד,
-- בלי שום אינדיקציה לאיזה ספק הכסף מיועד. בפועל חלק מהקטגוריות במחלקה מוקצות
-- מראש לספק ספציפי (למשל הקצאה שנתית לספק ספרים קבוע), והמידע הזה נשמר עד עכשיו
-- רק בשדה ה-notes החופשי או בכלל לא — כך שאי אפשר היה לראות בכרטיס הקטגוריה
-- למי הכסף מיועד, ואי אפשר לסנן/להצליב מול הזמנות של אותו ספק.
--
-- Shape:
-- מוסיף שני שדות nullable בדפוס הדנורמליזציה שכבר קיים בכל שאר הטבלאות שמצביעות
-- על ספק (purchase_orders, quote_requests, supplier_credits, inventory_items):
-- supplier_id ל-FK, ולצידו supplier_name כ-snapshot של השם, כדי שהתצוגה לא
-- תחייב join וכדי שהשם יישמר גם אם הספק יאורכב (status) בהמשך.
--
-- שני השדות nullable בכוונה: רוב הקטגוריות אינן משויכות לספק, וכל הקטגוריות
-- הקיימות חייבות להישאר תקינות בלי backfill. אין כאן drop של שום עמודה — התוספת
-- אדיטיבית בלבד, בהתאם למוסכמת המיגרציות של הפרויקט.
--
-- FK בדפוס הקיים: on delete set null — נתוני-אב (ספקים) מאורכבים דרך status ולא
-- נמחקים, ואם בכל זאת ספק נמחק, הקטגוריה והתקציב שלה חייבים לשרוד; supplier_name
-- יישאר כתיעוד היסטורי של השיוך.

alter table public.budget_allocations
  add column if not exists supplier_id uuid,
  add column if not exists supplier_name text;

alter table public.budget_allocations
  add constraint budget_allocations_supplier_id_fkey
  foreign key (supplier_id) references public.suppliers(id) on delete set null;

-- אין צורך במדיניות RLS חדשה: הן מוגדרות ברמת הטבלה ב-0001_init_schema.sql
-- (select_authenticated / insert_admin_only / update_admin_only / delete_admin_only)
-- וחלות אוטומטית גם על העמודות החדשות.
