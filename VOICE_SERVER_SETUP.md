# הגדרת שרת התימלול הקולי

## תיקון הבעיה

בעבר השימוש ב-Web Speech API ישירות גרם לשגיאות רשת. כעת השרת מתבצע בשרת Python עם Google Speech-to-Text API.

## דרישות מערכת

- Python 3.7 ומעלה
- pip (מנהל החבילות של Python)
- מיקרופון מחובר למחשב
- Chrome, Firefox, Edge או דפדפן חדיש אחר

## התקנה

### 1. התקנת התלויות

```bash
pip install -r requirements.txt
```

### 2. הפעלת השרת

```bash
python3 voice_server.py
```

השרת יפעל על `http://localhost:5000`

### 3. פתיחת האתר

פתח את `public/index.html` בדפדפן שלך או הפעל שרת ב-`public`:

```bash
cd public
python3 -m http.server 8000
```

ופתח את `http://localhost:8000` בדפדפן.

## ארכיטקטורה

```
┌─────────────────────────────────────────────┐
│         דפדפן (Browser)                    │
│  ┌──────────────────────────────────────┐  │
│  │  index.html + voice-assistant.js      │  │
│  │  - ממשק המשתמש                       │  │
│  │  - MediaRecorder API להקלטה          │  │
│  │  - קריאה ל-HTTP POST לשרת            │  │
│  └──────────────────────────────────────┘  │
└────────────────┬──────────────────────────┘
                 │ HTTP POST
        /api/transcribe (Base64 audio)
                 │
┌────────────────▼──────────────────────────┐
│      שרת Python Flask                      │
│  ┌──────────────────────────────────────┐  │
│  │  voice_server.py                      │  │
│  │  - קבלת הקובץ                       │  │
│  │  - Google Speech-to-Text API         │  │
│  │  - תימלול בעברית                    │  │
│  │  - החזרת JSON עם התוצאה             │  │
│  └──────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

## קבצים שעודכנו

### 1. **voice_server.py** (חדש)
- שרת Flask להקראת קול
- נקודות עיגול:
  - `GET /health` - בדיקת בריאות
  - `POST /api/transcribe` - תימלול FormData
  - `POST /api/transcribe-base64` - תימלול Base64

### 2. **public/voice-assistant.js** (עודכן)
שונו:
- `_initRecognition()` - מ-Web Speech API ל-MediaRecorder
- `_startListening()` - הקלטת אודיו מקומית ושליחה לשרת
- `_handleTranscriptResult()` - קבלת התוצאה מהשרת
- **הוסרו**:
  - `_handleResult()` - שגרת ה-Web Speech API הישנה

### 3. **public/index.html** (עודכן)
- הוסף configuration להגדרת כתובת השרת
- עדכון עמוד Help עם הנחיות לשרת Python
- הוסף טיפים וTroubleshooting לבעיות קוליות

### 4. **requirements.txt** (חדש)
- Flask 3.0.0
- Flask-CORS 4.0.0
- SpeechRecognition 3.10.0
- PyAudio 0.2.13
- pydub 0.25.1

## שגיאות נפוצות וליקויים

### "שגיאת רשת" בעוזר הקולי

**סיבה**: השרת לא פועל או כתובת השרת שגויה.

**פתרון**:
```bash
# בדוק שהשרת פועל
python3 voice_server.py

# בדוק ב-Browser Console (F12 → Console)
console.log(window.VOICE_SERVER_URL)
```

### "לא הבנתי את הקול"

**סיבה**: הקול לא ברור מספיק או לא דובר בעברית.

**פתרון**: דבר בקול חזק וברור בעברית.

### PyAudio יחזור שגיאות

**סיבה**: PyAudio דורש מספריות מערכת.

**פתרון (macOS)**:
```bash
brew install portaudio
pip install PyAudio
```

**פתרון (Ubuntu)**:
```bash
sudo apt-get install portaudio19-dev
pip install PyAudio
```

**פתרון (Windows)**:
- הורד מ: https://github.com/intrepid-dev/PyAudio/releases
- או: `pip install pipwin && pipwin install pyaudio`

## גיסור CORS

בייצור, צריך להוסיף CORS headers כדי לאפשר בקשות מדומיין אחר:

```python
# כבר קיים ב-voice_server.py
from flask_cors import CORS
CORS(app)
```

## בדיקת בריאות

```bash
curl http://localhost:5000/health
# תגובה:
# {"status": "ok", "service": "voice-recognition"}
```

## בדיקת תימלול

```bash
# העלה קובץ אודיו
curl -X POST -F "audio=@your_audio_file.wav" \
  http://localhost:5000/api/transcribe

# תגובה צפויה:
# {"status": "success", "transcript": "הטקסט שזוהה", "language": "he-IL"}
```

## הערות ביטחון

- השרת מקבל קבצי אודיו בלבד
- תמונת הקול מחוקה לאחר עיבוד
- אין שמירה של הקול בשרת
- סף גודל קובץ: 25MB (ברירת מחדל Flask)

## ביצועים

- זמן תימלול ממוצע: 2-5 שניות בהתאם לאורך הקול
- רוחב פס: ~100KB-1MB בהתאם לאודיו
- מקביליות: Flask ברירת מחדל - שרת אחד

לפיתוח concurrent, השתמש:
```bash
gunicorn -w 4 -b 0.0.0.0:5000 voice_server:app
```

---

**עדכון אחרון**: 8 ביולי 2026
**גרסה**: 2.0 (עם שרת Python)
