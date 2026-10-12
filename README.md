# מעבדת מיקרוביט – טכנודע

אתר הקורס: דף תלמיד, דף מדריך ומאגר שיעורים. 28 מפגשים:
- **חלק א׳ (1–16):** micro:bit, מתוך [Make it: code it](https://microbit.org/projects/make-it-code-it/)
- **חלק ב׳ (17–28):** הרובוט Tiny:bit, מתוך [Yahboom Tiny-bit](https://github.com/YahboomTechnology/Tiny-bit)

## איך משנים את סדר השיעורים
עורכים את הקובץ **`data/schedule.yml`** (אפשר ישירות באתר של GitHub, עם כפתור העיפרון ✏️).

```yaml
  - num: 5
    part: microbit
    title: "מטלטלים ומגרילים"
    lessons: [dice, graphical-dice]
```
- כדי להחליף שיעור, מחליפים את המזהה ב-`lessons`. המזהים נמצאים ב-`data/lessons.yml`.
- שיעור שלא משובץ באף מפגש מופיע אוטומטית ב"מאגר שיעורים נוסף" בדף המדריך.
- אם מזהה כתוב לא נכון, תופיע באתר הודעת אזהרה כתומה.
- הרווחים בתחילת השורה חשובים – שמרו על אותה הזחה.

## איך מוסיפים שיעור חדש
מעתיקים שיעור קיים בתוך `data/lessons.yml`, משנים את ה-`id`, וממלאים את השדות (ההסבר המלא נמצא בראש הקובץ).
בתוך טקסט אפשר לכתוב `**מודגש**`, ושם בלוק בתוך `[[...]]`.

## איך התלמיד/המדריך עובדים עם האתר
1. בוחרים **מפגש** (אפשר לקפוץ מהמספרים בראש הדף) ← לוחצים על **שיעור**.
2. בדף השיעור: מיקום (המפגשים › מפגש › שיעור), השיעורים של אותו מפגש, ולמעלה הכפתורים
   **פתיחת הקוד ב-MakeCode** ו-**הורדת קובץ hex**.
3. למטה: **סיימתי את השיעור** (נשמר בדפדפן של התלמיד) ומעבר לשיעור הקודם/הבא.
4. **חיפוש** בראש דף התלמיד ודף המדריך – לפי שם, מושג או מילת מפתח.

## MakeCode וקבצי hex
בקובץ `data/lessons.yml`, תחת `links`:
- `makecode` – קישור שיתוף שפותח את הקוד המוכן (ב-MakeCode: **Share ← Copy**), למשל
  `https://makecode.microbit.org/#pub:_dkrYv67Ui9jW`. בלי קישור כזה הכפתור פותח את MakeCode ריק.
- `hex` – קישור לקובץ hex. בשיעורים מ-microbit.org הקישור נבנה אוטומטית
  (`https://downloads.microbit.org/downloads/<שם-השיעור>-makecode.hex`).
  בשיעורי Tiny:bit הקישורים הם לקבצים ב-GitHub של Yahboom.

## חומרי מדריך
הקובץ `data/teacher.yml` מכיל את **מערכי השיעור של טכנודע** (מתוך microbit.pdf והתיקיות ב-Drive)
ואת **הקישורים השימושיים**. כל מערך מקושר לשיעורים באתר דרך `lessons`, ומופיע:
בלשונית "מערכי שיעור טכנודע", על כרטיס המפגש, ובדף השיעור (תצוגת מדריך).

## צפייה במחשב
צריך שרת מקומי, כי פתיחה ישירה של הקובץ לא טוענת את הנתונים. למשל:
- ב-VS Code: התוסף **Live Server** ← Open with Live Server
- או, אם מותקן Python: `python -m http.server 8000` ואז http://localhost:8000

## פרסום ב-GitHub Pages
1. יוצרים ריפו חדש ב-GitHub ודוחפים אליו את התיקייה:
   ```
   git remote add origin https://github.com/<user>/<repo>.git
   git push -u origin main
   ```
2. ב-GitHub: **Settings ← Pages ← Source: Deploy from a branch ← main / (root)**.
3. אחרי דקה-שתיים האתר זמין בכתובת `https://<user>.github.io/<repo>/`.

> שימו לב: דף המדריך (`guide.html`) לא מקושר מדף התלמידים, אבל הוא ציבורי – כל מי שיודע את הכתובת יכול להיכנס.

## מבנה
```
index.html      דף בית – בחירה בין תלמיד למדריך
student.html    28 המפגשים לתלמידים
guide.html      המפגשים + מערכי שיעור + קישורים + מאגר שיעורים
lesson.html     דף שיעור (lesson.html?id=heart&view=student|guide)
data/           schedule.yml (סדר) + lessons.yml (תוכן) + teacher.yml (מערכי שיעור וקישורים)
assets/         לוגו, עיצוב וקוד
```
