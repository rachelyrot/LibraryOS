---
name: new-migration
description: Scaffolds a new numbered Supabase SQL migration file for LibraryOS, following this repo's conventions (never edit an already-applied migration, snake_case tables, existing RLS/RPC patterns), and reminds the user it must be run manually in the Supabase SQL Editor. Use when the user asks to add/change a table column, add an RLS policy, add an RPC function, or otherwise change the DB schema — e.g. "תוסיף שדה חדש לטבלה", "צריך מיגרציה חדשה", "add a migration for X".
---

# new-migration — יצירת מיגרציית Supabase חדשה

בפרויקט הזה **אין** `supabase db push` אוטומטי — כל מיגרציה נוצרת כקובץ חדש ב-`supabase/migrations/`, והמשתמשת מריצה אותה ידנית ב-Supabase SQL Editor. **לעולם אין לערוך קובץ מיגרציה קיים שכבר עשוי להיות מוחל על בסיס נתונים אמיתי** — תמיד קובץ חדש, ממוספר בסדר עולה.

## איך להריץ

1. **מצא את המספר הבא**: `ls supabase/migrations/*.sql`, קח את המספר הגבוה ביותר בתחילת שם הקובץ (למשל `0008_...`), המספר הבא הוא `0009` וכו' (4 ספרות, padded).
2. **בחר שם קובץ תיאורי** ב-snake_case לפי מה שהמשתמשת ביקשה, לדוגמה `0009_add_employee_notes.sql`.
3. **כתוב את ה-SQL** לפי הצורך, תוך שמירה על המוסכמות הקיימות בפרויקט (ראה `supabase/migrations/0001_init_schema.sql` להשראה):
   - טבלאות/עמודות חדשות ב-snake_case.
   - שדות FK: `uuid references <table>(id)`, בד"כ `nullable`, `on delete set null` (לא מוחקים נתוני-אב).
   - שדות מערך רב-ערכי: `jsonb not null default '[]'::jsonb` (המוסכמה הקיימת, ראה `approved_positions.category`).
   - אם נדרשת מדיניות RLS חדשה — עקוב אחרי הדפוס הקיים ב-`0001_init_schema.sql` (`select_authenticated`/`insert_admin_only` וכו', דרך `public.is_admin()`).
   - אם נדרשת פונקציית RPC אטומית (למשל effect על תקציב/מלאי) — היא **חייבת** לנעול שורות (`for update`) ולבדוק דגלי guard (כמו `budget_updated`/`inventory_updated`) *בתוך* הטרנזקציה, לא להסתמך על מה שהלקוח שלח. ראה `0003_budget_inventory_rpc.sql` כדוגמה.
4. **אל תריץ את המיגרציה בעצמך** ואל תניחי שהיא כבר הוחלה — היא רק קובץ בקוד עד שהמשתמשת מריצה אותה.
5. **בסיום**, ספרי למשתמשת בבירור:
   - שם הקובץ שנוצר.
   - שהיא צריכה להעתיק את תוכנו ולהריץ ב-Supabase Studio → SQL Editor.
   - אם השינוי דורש גם שינוי קוד צד-לקוח (שדה חדש בטופס/עמודה בטבלה) — ציין זאת כצעד נפרד.

## הערות

- אם לא בטוחה מה בדיוק המשתמשת רוצה בסכמה (למשל סוג עמודה, ברירת מחדל) — שאלי לפני כתיבת ה-SQL, לא לנחש שינוי בלתי הפיך בסכמה.
- טבלת המיפוי `PascalCase` (שם ישות) → `snake_case` (שם טבלה) נמצאת ב-`TABLE_MAP` בראש `src/api/base44Client.js` — אם נוספת טבלה חדשה, יש לעדכן גם אותה.
