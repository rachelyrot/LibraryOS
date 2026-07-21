---
name: parallel-task
description: Spins up an isolated git worktree + branch for one independent task, so several tasks can be developed in parallel and merged into main separately later. Mirrors the workflow already used in this project (copy .env.local, npm install in the new worktree, own branch per task). Use when the user wants to start a new, independent task/bug/feature alongside existing work — e.g. "תפתחי ענף חדש למשימה X", "אני רוצה להריץ עוד משימה במקביל", "new worktree for Y".
---

# parallel-task — worktree + ענף מבודד למשימה חדשה

הפרויקט הזה עובד עם **worktree נפרד + ענף נפרד לכל משימה מקבילה**, שמתמזגים ל-`main` בסיום כל אחד בנפרד. זה מונע התנגשות בין כמה משימות שרצות בו-זמנית באותה שיחה/מכונה.

## איך להריץ

1. **ודאי שם משימה/ענף** — אם לא ניתן, בקשי שם קצר וברור (למשל `fix/expense-save`, `feature/staff-sync`).
2. **צרי את ה-worktree**, מחוץ לתיקיית הריפו הראשית, אבל לצידה:
   ```
   git worktree add -b <branch-name> ../<repo-folder-name>-<task-slug> main
   ```
3. **העתיקי `.env.local`** מהריפו הראשי לתיקיית ה-worktree החדשה (הקובץ ב-gitignore, לא מגיע עם ה-worktree אוטומטית).
4. **הריצי `npm install`** בתוך ה-worktree החדש (מומלץ ברקע — יכול לקחת זמן, ואין צורך לחכות לו לפני שממשיכים לתכנן את המשימה עצמה).
5. **דווחי** בקצרה: נתיב ה-worktree, שם הענף, שההתקנה רצה ברקע.

## בסיום המשימה (איך למזג בחזרה)

1. ודאי `npm run build` + `npx eslint <קבצים ששונו> --quiet` עוברים נקי **בתוך ה-worktree**, לפני מיזוג.
2. חיזרי לריפו הראשי (`main`), בצעי `git merge --no-ff <branch-name>`.
3. הריצי build+lint שוב **על main** אחרי המיזוג (לא להסתמך רק על הבדיקה שנעשתה ב-worktree).
4. אשרי עם המשתמשת לפני `git push origin main`.
5. אם המיגרציה/הענף כבר לא נחוצים — הציעי להסיר את ה-worktree (`git worktree remove <path>`) ולמחוק את הענף המקומי אחרי המיזוג, כדי לא להשאיר worktrees יתומים תלויים (יש כבר כמה כאלה מהיסטוריית הפרויקט — שווה להזכיר אם מצטברים).

## הערות

- כל worktree הוא עותק מלא של קבצי הפרויקט על דיסק (כולל `node_modules` נפרד לאחר `npm install`) — על דיסק כמעט מלא, זה שיקול אמיתי; אם המקום מוגבל, שווה להסיר worktrees ישנים שכבר מוזגו לפני יצירת חדשים.
- אל תמזגי ותדחפי (`push`) בלי אישור מפורש מהמשתמשת בכל פעם, גם אם אושר בעבר על ענף אחר.
