# מדריך התקנה לאנדרואיד - Rog Terminal

## אפשרות 1: התקנה כ-PWA (הכי קל ומהיר)

PWA (Progressive Web App) מאפשר להתקין את האפליקציה ישירות מהדפדפן, בלי צורך ב-Android Studio או בניית APK.

### שלבים:

1. **פתח את Chrome** בטלפון האנדרואיד שלך
2. **גלוש לאתר:** [https://rog-terminal.fly.dev](https://rog-terminal.fly.dev)
3. **המתן לטעינת הדף** - תופיע הודעה "הוסף למסך הבית" (Add to Home Screen)
4. אם ההודעה לא מופיעה:
   - לחץ על **⋮** (שלוש נקודות) בפינה העליונה של Chrome
   - בחר **"הוסף למסך הבית"** או **"Install app"**
5. **אשר את ההתקנה** - האפליקציה תופיע כאייקון במסך הבית
6. **פתח את האפליקציה** מהמסך הבית - היא תיראה ותתנהג כמו אפליקציה רגילה

### יתרונות PWA:
- ✅ התקנה מיידית, בלי חנות אפליקציות
- ✅ עדכונים אוטומטיים
- ✅ תמיכה בעבודה אופליין (Service Worker)
- ✅ התראות push
- ✅ תופסת מעט מקום

---

## אפשרות 2: בניית APK עם Capacitor (למפתחים)

אם אתה רוצה לבנות אפליקציה מקומית (native) עם APK, תצטרך להתקין כמה כלים במחשב.

### דרישות מוקדמות:

- **Node.js** גרסה 18 ומעלה
- **npm** (מגיע עם Node.js)
- **Android Studio** עם Android SDK
- **Java JDK 17** ומעלה

### שלב 1: התקנת Android Studio

1. הורד את [Android Studio](https://developer.android.com/studio)
2. התקן וודא שמותקנים:
   - Android SDK (API 33 ומעלה)
   - Android SDK Build-Tools
   - Android Emulator (אופציונלי)

### שלב 2: שכפול הפרויקט

```bash
git clone https://github.com/dorrogtech/rog-terminal.git
cd rog-terminal
```

### שלב 3: התקנת תלויות והכנת הפרונטאנד

```bash
cd frontend
npm install
npm run build
```

### שלב 4: הוספת פלטפורמת אנדרואיד

```bash
npx cap add android
npx cap sync
```

### שלב 5: פתיחה ב-Android Studio

```bash
npx cap open android
```

הפקודה תפתח את הפרויקט ב-Android Studio.

### שלב 6: בניית APK

ב-Android Studio:

1. המתן לסיום ה-Gradle Sync
2. עבור ל: **Build** → **Build Bundle(s) / APK(s)** → **Build APK(s)**
3. קובץ ה-APK ייווצר בנתיב:
   ```
   frontend/android/app/build/outputs/apk/debug/app-debug.apk
   ```
4. העבר את קובץ ה-APK לטלפון והתקן אותו

### שלב 6 (חלופי): הרצה ישירה על מכשיר

1. חבר את טלפון האנדרואיד למחשב בכבל USB
2. הפעל **USB Debugging** בטלפון:
   - הגדרות → אודות הטלפון → לחץ 7 פעמים על "Build Number"
   - חזור להגדרות → אפשרויות מפתח → הפעל "USB Debugging"
3. ב-Android Studio לחץ על **Run** (▶️) - האפליקציה תותקן ישירות על הטלפון

---

## שלב 7: הגדרת הבקאנד (אם אתה מריץ שרת מקומי)

אם אתה רוצה להריץ שרת מקומי במקום להשתמש בשרת החי:

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

השרת ירוץ על `http://localhost:3000`.

> **שים לב:** אם אתה מריץ שרת מקומי, תצטרך לעדכן את כתובת ה-API בפרונטאנד כך שתצביע לכתובת ה-IP המקומית של המחשב שלך (לא `localhost`, כי הטלפון לא יכול לגשת ל-localhost של המחשב).

---

## פתרון בעיות

### האפליקציה לא נפתחת
- ודא שאפשרת התקנה ממקורות לא ידועים: הגדרות → אבטחה → מקורות לא ידועים

### לא מצליח להתחבר לשרת
- ודא שהטלפון והמחשב באותה רשת Wi-Fi (אם אתה משתמש בשרת מקומי)
- בדוק שה-Firewall לא חוסם את הפורט

### PWA לא מציע התקנה
- ודא שאתה משתמש ב-Chrome (לא כל דפדפן תומך ב-PWA)
- נסה לרענן את הדף
- ודא שאתה גולש ב-HTTPS

---

## קישורים שימושיים

- **אתר חי:** [https://rog-terminal.fly.dev](https://rog-terminal.fly.dev)
- **קוד מקור:** [https://github.com/dorrogtech/rog-terminal](https://github.com/dorrogtech/rog-terminal)
- **Capacitor Docs:** [https://capacitorjs.com/docs/android](https://capacitorjs.com/docs/android)
