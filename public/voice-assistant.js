/**
 * voice-assistant.js
 * מנוע האשף הקולי המלא - ניהול אירוח לשבת
 * -----------------------------------------------
 * עקרונות:
 *  - כל שאלה מוגדרת כאובייקט בטבלת WIZARD_FLOWS
 *  - מנוע המצב (VoiceWizard) מנהל את כל הלוגיקה
 *  - Web Speech API בלבד - ללא שרת ו-API חיצוני
 *  - SpeechSynthesis להקראה
 *  - קבצי MP3 מוגדרים לפי שם קבוצה+קובץ
 */

'use strict';

// ============================================================
// 1. הגדרות מרכזיות
// ============================================================

/** מיפוי פקודות קוליות לפעולות - מסיר מהתוצאה הנשמרת */
const VOICE_COMMANDS = {
  finish: ['סיימתי', 'זהו', 'המשך', 'הבא', 'שמור'],
  goBack: ['חזור', 'חזרה'],
  skip: ['דלג', 'דלוג'],
  cancel: ['בטל', 'ביטול'],
  restart: ['חזור להתחלה', 'התחל מחדש', 'מחדש'],
  stop: ['עצור', 'הפסק'],
  redo: ['תקן', 'שוב', 'חזור על'],
};

/** כל מילות הפקודה כרשימה שטוחה לסינון */
const ALL_COMMAND_WORDS = Object.values(VOICE_COMMANDS).flat();

/** נתיב לקבצי אודיו */
const AUDIO_BASE = './audio/';

/** ------
 * הגדרת זרימות האשף (Wizard Flows)
 * כל שלב מכיל:
 *   id          - מזהה ייחודי
 *   audioFile   - קובץ שמע שישמע לפני ההקלטה
 *   fieldKey    - המפתח שישמר בתוצאה הסופית
 *   isRequired  - האם ניתן לדלג?
 *   parser      - פונקציה שממירה קלט גולמי לערך שמיש
 *   validate    - פונקציה שבודקת תקינות (אופציונלי)
 * ------ */

/**
 * זרימת הוספת שבת חדשה
 * @type {Array<WizardStep>}
 */
const FLOW_ADD_SHABBAT = [
  {
    id: 'hebrewDate',
    audioFile: 'ask_hebrew_date.mp3',
    fieldKey: 'hebrewDate',
    isRequired: true,
    hint: 'לדוגמה: כ"ב תמוז תשפ"ה',
    parser: (raw) => raw.trim(),
  },
  {
    id: 'parsha',
    audioFile: 'ask_parsha.mp3',
    fieldKey: 'parsha',
    isRequired: false,
    hint: 'לדוגמה: פרשת בלק, שבת חנוכה',
    parser: (raw) => raw.trim() || 'פרשת השבוע',
  },
];

/**
 * זרימת הוספת אורח
 * @type {Array<WizardStep>}
 */
const FLOW_ADD_GUEST = [
  {
    id: 'guestName',
    audioFile: 'ask_guest_name.mp3',
    fieldKey: 'name',
    isRequired: true,
    hint: 'לדוגמה: משפחת כהן',
    parser: (raw) => raw.trim(),
  },
  {
    id: 'guestCount',
    audioFile: 'ask_guest_count.mp3',
    fieldKey: 'count',
    isRequired: false,
    hint: 'לדוגמה: ארבע, חמש, שתיים',
    parser: parseHebrewNumber,
    defaultValue: 1,
  },
];

/**
 * זרימת הוספת משימה
 * @type {Array<WizardStep>}
 */
const FLOW_ADD_TASK = [
  {
    id: 'taskText',
    audioFile: 'ask_task.mp3',
    fieldKey: 'task',
    isRequired: true,
    hint: 'לדוגמה: לקנות חלות, להזמין שמן',
    parser: (raw) => raw.trim(),
  },
];

/**
 * זרימת הוספת הערות
 * @type {Array<WizardStep>}
 */
const FLOW_ADD_NOTES = [
  {
    id: 'notesText',
    audioFile: 'ask_notes.mp3',
    fieldKey: 'notes',
    isRequired: false,
    hint: 'אמור כל הערה שתרצה לשמור',
    parser: (raw) => raw.trim(),
    defaultValue: '',
  },
];

/**
 * זרימת הוספת איש קשר לבנק
 * @type {Array<WizardStep>}
 */
const FLOW_ADD_CONTACT = [
  {
    id: 'contactName',
    audioFile: 'ask_contact_name.mp3',
    fieldKey: 'name',
    isRequired: true,
    hint: 'לדוגמה: משפחת לוי',
    parser: (raw) => raw.trim(),
  },
  {
    id: 'contactCount',
    audioFile: 'ask_contact_count.mp3',
    fieldKey: 'count',
    isRequired: false,
    hint: 'ברירת מחדל: אחד',
    parser: parseHebrewNumber,
    defaultValue: 1,
  },
];

// ============================================================
// 2. פונקציות עזר
// ============================================================

/**
 * המרת מספרים בעברית לספרות
 * @param {string} text - קלט גולמי
 * @returns {number}
 */
function parseHebrewNumber(text) {
  const map = {
    'אחד': 1, 'אחת': 1, 'אחד עשר': 11, 'אחת עשרה': 11,
    'שניים': 2, 'שתיים': 2, 'שני': 2, 'שתי': 2, 'שניים עשר': 12, 'שתים עשרה': 12,
    'שלושה': 3, 'שלוש': 3, 'שלושה עשר': 13, 'שלוש עשרה': 13,
    'ארבעה': 4, 'ארבע': 4, 'ארבעה עשר': 14, 'ארבע עשרה': 14,
    'חמישה': 5, 'חמש': 5, 'חמישה עשר': 15, 'חמש עשרה': 15,
    'שישה': 6, 'שש': 6, 'שישה עשר': 16, 'שש עשרה': 16,
    'שבעה': 7, 'שבע': 7, 'שבעה עשר': 17, 'שבע עשרה': 17,
    'שמונה': 8, 'שמונה עשר': 18, 'שמונה עשרה': 18,
    'תשעה': 9, 'תשע': 9, 'תשעה עשר': 19, 'תשע עשרה': 19,
    'עשרה': 10, 'עשר': 10, 'עשרים': 20,
  };

  const trimmed = text.trim().toLowerCase();
  if (map[trimmed] !== undefined) return map[trimmed];

  // ניסיון לפרש ספרה
  const num = parseInt(trimmed, 10);
  if (!isNaN(num) && num > 0) return num;

  return 1; // ברירת מחדל
}

/**
 * הסרת מילות פקודה מהקלט הגולמי
 * @param {string} text
 * @returns {string}
 */
function stripCommandWords(text) {
  let result = text;
  ALL_COMMAND_WORDS.forEach((word) => {
    // הסר את המילה רק אם היא מופיעה בסוף המשפט (כי שם המשתמש רגיל לסיים בפקודה)
    const endRegex = new RegExp(`\\s*${word}\\s*$`, 'i');
    result = result.replace(endRegex, '');
  });
  return result.trim();
}

/**
 * זיהוי פקודה בתוצאת התמלול
 * @param {string} text
 * @returns {string|null} - מפתח הפקודה או null
 */
function detectCommand(text) {
  const lower = text.trim().toLowerCase();
  for (const [cmdKey, words] of Object.entries(VOICE_COMMANDS)) {
    if (words.some((w) => lower === w || lower.endsWith(' ' + w) || lower.startsWith(w + ' '))) {
      return cmdKey;
    }
  }
  return null;
}

// ============================================================
// 3. מחלקת VoiceWizard - מנוע האשף הקולי
// ============================================================

class VoiceWizard {
  constructor() {
    /** @type {SpeechRecognition|null} */
    this._recognition = null;

    /** @type {SpeechSynthesisUtterance|null} */
    this._utterance = null;

    /** מצב האשף הנוכחי */
    this._state = 'idle'; // 'idle' | 'playing' | 'listening' | 'confirming' | 'speaking'

    /** הזרימה הפעילה כרגע */
    this._currentFlow = null;

    /** אינדקס השלב הנוכחי בזרימה */
    this._stepIndex = 0;

    /** תוצאות שנאספו עד כה בזרימה הנוכחית */
    this._collected = {};

    /** callback שיקרא בסיום הזרימה בהצלחה */
    this._onComplete = null;

    /** callback שיקרא בביטול */
    this._onCancel = null;

    /** metadata נוסף שמועבר לזרימה (למשל id של שבת) */
    this._meta = {};

    this._initRecognition();
    this._initUI();
  }

  // ----------------------------------------------------------
  // 3a. אתחול שרת תימלול Python
  // ----------------------------------------------------------

  _initRecognition() {
    // בדיקה שהדפדפן תומך ב-getUserMedia עבור הקלטה
    const hasMediaRecorder = !!(
      navigator.mediaDevices &&
      navigator.mediaDevices.getUserMedia &&
      typeof MediaRecorder !== 'undefined'
    );

    if (!hasMediaRecorder) {
      console.warn('[VoiceWizard] MediaRecorder אינו נתמך בסביבה זו');
      this._recognitionSupported = false;
      return;
    }

    this._recognitionSupported = true;
    this._mediaRecorder = null;
    this._audioChunks = [];
    
    // כתובת השרת - דיפולט: localhost:5000 (ניתן להעביר environment variable)
    this._voiceServerUrl = window.VOICE_SERVER_URL || 'http://localhost:5000';
  }

  // ----------------------------------------------------------
  // 3b. יצירת ממשק המשתמש (UI) של האשף
  // ----------------------------------------------------------

  _initUI() {
    // מניעת כפילות אם כבר אותחל
    if (document.getElementById('voice-wizard-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'voice-wizard-overlay';
    overlay.innerHTML = `
      <div id="voice-wizard-panel" role="dialog" aria-label="אשף קולי" aria-modal="true">

        <!-- כותרת -->
        <div id="vw-header">
          <span id="vw-title">עוזר קולי</span>
          <button id="vw-close-btn" aria-label="סגור אשף" title="סגור (Esc)">✕</button>
        </div>

        <!-- אזור הודעה ראשית -->
        <div id="vw-message-area">
          <p id="vw-message"></p>
        </div>

        <!-- אזור הרמז -->
        <div id="vw-hint-area">
          <span id="vw-hint"></span>
        </div>

        <!-- אנימציית הקלטה -->
        <div id="vw-recording-area" aria-hidden="true">
          <div id="vw-mic-icon">
            <i class="fa-solid fa-microphone"></i>
          </div>
          <div id="vw-waves">
            <span></span><span></span><span></span><span></span><span></span>
          </div>
          <div id="vw-status-label"></div>
        </div>

        <!-- תוצאת תמלול -->
        <div id="vw-transcript-area">
          <div id="vw-transcript-label">הבנתי שאמרת:</div>
          <div id="vw-transcript-text"></div>
        </div>

        <!-- פקדים -->
        <div id="vw-controls">
          <button id="vw-redo-btn"  class="vw-btn vw-btn-secondary" title="הקלט שוב">
            <i class="fa-solid fa-rotate-right"></i> הקלט שוב
          </button>
          <button id="vw-skip-btn"  class="vw-btn vw-btn-secondary" title="דלג על שאלה זו">
            <i class="fa-solid fa-forward"></i> דלג
          </button>
          <button id="vw-back-btn"  class="vw-btn vw-btn-secondary" title="חזור לשאלה הקודמת">
            <i class="fa-solid fa-arrow-right"></i> חזור
          </button>
          <button id="vw-cancel-btn" class="vw-btn vw-btn-danger" title="בטל את כל התהליך">
            <i class="fa-solid fa-xmark"></i> בטל
          </button>
        </div>

        <!-- מד-התקדמות -->
        <div id="vw-progress-bar-wrap">
          <div id="vw-progress-bar"></div>
        </div>
        <div id="vw-progress-text"></div>

      </div>
    `;

    document.body.appendChild(overlay);

    // הוספת סגנונות
    this._injectStyles();

    // חיבור אירועי לחצנים
    document.getElementById('vw-close-btn').addEventListener('click', () => this.cancel());
    document.getElementById('vw-cancel-btn').addEventListener('click', () => this.cancel());
    document.getElementById('vw-redo-btn').addEventListener('click', () => this._redoStep());
    document.getElementById('vw-skip-btn').addEventListener('click', () => this._skipStep());
    document.getElementById('vw-back-btn').addEventListener('click', () => this._goBack());

    // סגירה ב-Esc
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this._state !== 'idle') this.cancel();
    });
  }

  _injectStyles() {
    if (document.getElementById('voice-wizard-styles')) return;

    const style = document.createElement('style');
    style.id = 'voice-wizard-styles';
    style.textContent = `
      /* ============================================
         עיצוב האשף הקולי
         ============================================ */

      #voice-wizard-overlay {
        position: fixed; inset: 0;
        background: rgba(15, 23, 42, 0.65);
        display: none;
        align-items: center;
        justify-content: center;
        z-index: 9999;
        backdrop-filter: blur(4px);
        animation: vw-fade-in 0.2s ease;
      }
      #voice-wizard-overlay.vw-open { display: flex; }

      @keyframes vw-fade-in { from { opacity: 0; } to { opacity: 1; } }

      #voice-wizard-panel {
        background: #ffffff;
        border-radius: 20px;
        padding: 32px 28px 24px;
        width: min(520px, 95vw);
        box-shadow: 0 25px 60px rgba(0,0,0,0.3);
        direction: rtl;
        font-family: 'Assistant', sans-serif;
        position: relative;
        animation: vw-slide-up 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
      }
      @keyframes vw-slide-up {
        from { opacity: 0; transform: translateY(30px) scale(0.97); }
        to   { opacity: 1; transform: translateY(0)   scale(1); }
      }

      #vw-header {
        display: flex; justify-content: space-between; align-items: center;
        margin-bottom: 20px;
      }
      #vw-title {
        font-family: 'Rubik', sans-serif;
        font-size: 1.3rem; font-weight: 700;
        color: var(--primary, #0f766e);
        display: flex; align-items: center; gap: 8px;
      }
      #vw-title::before {
        content: '';
        display: inline-block;
        width: 10px; height: 10px;
        border-radius: 50%;
        background: var(--primary, #0f766e);
        animation: vw-pulse-dot 2s infinite;
      }
      @keyframes vw-pulse-dot {
        0%, 100% { opacity: 1; transform: scale(1); }
        50%       { opacity: 0.4; transform: scale(1.4); }
      }

      #vw-close-btn {
        background: #f1f5f9; border: none; border-radius: 8px;
        width: 32px; height: 32px; cursor: pointer;
        font-size: 1rem; color: #64748b;
        transition: background 0.2s, color 0.2s;
      }
      #vw-close-btn:hover { background: #fee2e2; color: #ef4444; }

      #vw-message-area {
        background: #f0fdfa;
        border: 1px solid #99f6e4;
        border-radius: 12px;
        padding: 16px 18px;
        margin-bottom: 12px;
        min-height: 60px;
      }
      #vw-message {
        font-size: 1.15rem; font-weight: 600;
        color: #134e4a; margin: 0; line-height: 1.6;
      }

      #vw-hint-area {
        font-size: 0.88rem; color: #64748b;
        margin-bottom: 20px; min-height: 20px;
      }

      /* === אנימציית הקלטה === */
      #vw-recording-area {
        display: flex; flex-direction: column;
        align-items: center; gap: 10px;
        margin-bottom: 18px; min-height: 80px;
      }

      #vw-mic-icon {
        width: 64px; height: 64px; border-radius: 50%;
        background: #e2e8f0;
        display: flex; align-items: center; justify-content: center;
        font-size: 1.8rem; color: #94a3b8;
        transition: background 0.3s, color 0.3s, transform 0.3s;
      }
      #vw-mic-icon.listening {
        background: var(--primary, #0f766e);
        color: white;
        animation: vw-mic-pulse 1.2s infinite;
      }
      #vw-mic-icon.speaking {
        background: #f59e0b; color: white;
      }
      #vw-mic-icon.playing {
        background: #3b82f6; color: white;
      }
      @keyframes vw-mic-pulse {
        0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(15,118,110,0.4); }
        50%       { transform: scale(1.07); box-shadow: 0 0 0 12px rgba(15,118,110,0); }
      }

      #vw-waves {
        display: flex; align-items: center; gap: 4px; height: 30px;
      }
      #vw-waves span {
        display: block; width: 5px; border-radius: 3px;
        background: #cbd5e1; height: 6px;
        transition: background 0.3s;
      }
      #vw-waves.active span {
        background: var(--primary, #0f766e);
        animation: vw-wave 1s ease-in-out infinite;
      }
      #vw-waves.active span:nth-child(1) { animation-delay: 0s; }
      #vw-waves.active span:nth-child(2) { animation-delay: 0.1s; }
      #vw-waves.active span:nth-child(3) { animation-delay: 0.2s; }
      #vw-waves.active span:nth-child(4) { animation-delay: 0.3s; }
      #vw-waves.active span:nth-child(5) { animation-delay: 0.4s; }
      @keyframes vw-wave {
        0%, 100% { height: 6px; }
        50%       { height: 24px; }
      }

      #vw-status-label {
        font-size: 0.9rem; font-weight: 600;
        color: #64748b; text-align: center;
      }
      #vw-status-label.listening { color: var(--primary, #0f766e); }
      #vw-status-label.speaking  { color: #f59e0b; }

      /* === תמלול === */
      #vw-transcript-area {
        background: #f8fafc; border: 1px solid #e2e8f0;
        border-radius: 10px; padding: 12px 16px;
        margin-bottom: 18px; min-height: 52px;
        display: none;
      }
      #vw-transcript-area.vw-visible { display: block; }
      #vw-transcript-label { font-size: 0.82rem; color: #94a3b8; margin-bottom: 4px; }
      #vw-transcript-text {
        font-size: 1.05rem; font-weight: 600; color: #1e293b; line-height: 1.5;
      }

      /* === כפתורים === */
      #vw-controls {
        display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px;
      }
      .vw-btn {
        border: none; border-radius: 8px; padding: 8px 14px;
        font-size: 0.88rem; font-weight: 600; cursor: pointer;
        display: flex; align-items: center; gap: 6px; transition: 0.2s;
        font-family: 'Assistant', sans-serif;
      }
      .vw-btn-secondary { background: #f1f5f9; color: #334155; }
      .vw-btn-secondary:hover { background: #e2e8f0; }
      .vw-btn-danger { background: #fee2e2; color: #b91c1c; }
      .vw-btn-danger:hover { background: #fecaca; }

      /* === מד התקדמות === */
      #vw-progress-bar-wrap {
        background: #f1f5f9; border-radius: 6px; height: 6px; overflow: hidden;
        margin-bottom: 6px;
      }
      #vw-progress-bar {
        height: 100%; background: var(--primary, #0f766e);
        border-radius: 6px; transition: width 0.4s ease;
        width: 0%;
      }
      #vw-progress-text { font-size: 0.8rem; color: #94a3b8; text-align: center; }

      /* === כפתור הפעלת האשף בדשבורד === */
      .voice-wizard-trigger {
        display: inline-flex; align-items: center; gap: 8px;
        background: var(--primary, #0f766e); color: white;
        border: none; border-radius: 10px; padding: 10px 20px;
        font-size: 0.95rem; font-weight: 700; cursor: pointer;
        font-family: 'Assistant', sans-serif;
        transition: background 0.2s, transform 0.15s;
        box-shadow: 0 2px 8px rgba(15,118,110,0.3);
      }
      .voice-wizard-trigger:hover { background: var(--primary-hover, #115e59); transform: translateY(-1px); }
      .voice-wizard-trigger i { font-size: 1.1rem; }
    `;
    document.head.appendChild(style);
  }

  // ----------------------------------------------------------
  // 3c. ממשק ציבורי - הפעלת זרימות
  // ----------------------------------------------------------

  /**
   * מפעיל זרימה לפי שם
   * @param {string} flowName - שם הזרימה ('addShabbat'|'addGuest'|'addTask'|'addNotes'|'addContact')
   * @param {object} meta - מידע נוסף (למשל: shabbatId)
   * @param {Function} onComplete - callback(result)
   * @param {Function} [onCancel]  - callback()
   */
  start(flowName, meta = {}, onComplete, onCancel = null) {
    if (this._state !== 'idle') {
      console.warn('[VoiceWizard] אשף פעיל כבר.');
      return;
    }

    const flows = {
      addShabbat: FLOW_ADD_SHABBAT,
      addGuest:   FLOW_ADD_GUEST,
      addTask:    FLOW_ADD_TASK,
      addNotes:   FLOW_ADD_NOTES,
      addContact: FLOW_ADD_CONTACT,
    };

    this._currentFlow = flows[flowName];
    if (!this._currentFlow) {
      console.error('[VoiceWizard] זרימה לא מוכרת:', flowName);
      return;
    }

    this._stepIndex = 0;
    this._collected = {};
    this._meta = meta;
    this._onComplete = onComplete;
    this._onCancel = onCancel;

    this._openOverlay();
    this._runStep();
  }

  /** ביטול האשף */
  cancel() {
    this._stopListening();
    this._stopSpeech();
    this._closeOverlay();
    if (this._onCancel) this._onCancel();
    this._resetState();
  }

  // ----------------------------------------------------------
  // 3d. זרימת שלבים פנימית
  // ----------------------------------------------------------

  _runStep() {
    if (!this._currentFlow) return;

    if (this._stepIndex >= this._currentFlow.length) {
      // כל השלבים הושלמו
      this._finishFlow();
      return;
    }

    const step = this._currentFlow[this._stepIndex];
    this._updateProgress();
    this._updateHint(step.hint || '');

    // נגן קובץ שמע ואחריו התחל הקלטה
    this._playAudio(step.audioFile, () => {
      this._playBeep(() => {
        this._startListening();
      });
    });
  }

  _finishFlow() {
    this._setState('idle');
    this._closeOverlay();
    if (this._onComplete) this._onComplete({ ...this._collected }, this._meta);
    this._resetState();
  }

  _redoStep() {
    this._stopListening();
    this._stopSpeech();
    this._clearTranscript();
    this._runStep();
  }

  _skipStep() {
    if (!this._currentFlow) return;
    const step = this._currentFlow[this._stepIndex];

    if (step.isRequired) {
      this._setMessage('שאלה זו היא חובה, לא ניתן לדלג.');
      return;
    }

    // שמור ערך ברירת מחדל
    if (step.defaultValue !== undefined) {
      this._collected[step.fieldKey] = step.defaultValue;
    }

    this._stepIndex++;
    this._clearTranscript();
    this._runStep();
  }

  _goBack() {
    if (this._stepIndex === 0) {
      this._setMessage('אין שלב קודם להחזיר.');
      return;
    }

    this._stopListening();
    this._stopSpeech();
    this._stepIndex--;
    this._clearTranscript();
    this._runStep();
  }

  // ----------------------------------------------------------
  // 3e. מנוע ההקלטה
  // ----------------------------------------------------------

  async _startListening() {
  if (!this._recognitionSupported) {
  this._handleNoMicrophone();
  return;
  }
  
  this._setState('listening');
  this._setStatusLabel('מקשיב...', 'listening');
  this._setMicState('listening');
  this._setWavesActive(true);
  this._setMessage('דבר עכשיו...');
  
  try {
  // קבלת הרשאה למיקרופון
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  
  // יצירת MediaRecorder
  this._mediaRecorder = new MediaRecorder(stream);
  this._audioChunks = [];
  
  this._mediaRecorder.ondataavailable = (event) => {
    this._audioChunks.push(event.data);
  };
  
  this._mediaRecorder.onstop = async () => {
    // העברה לשרת Python לתימלול
    await this._sendAudioToServer();
    // עצירת כל הזרמים
    stream.getTracks().forEach(track => track.stop());
  };
  
  // התחלת הקלטה
  this._mediaRecorder.start();
  
  // עצירה אוטומטית אחרי 10 שניות
  this._recordingTimeout = setTimeout(() => {
    if (this._mediaRecorder && this._mediaRecorder.state !== 'inactive') {
    this._mediaRecorder.stop();
    }
  }, 10000);
  
  } catch (err) {
  console.error('[VoiceWizard] שגיאה בהקלטה:', err);
  if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
    this._handleNoMicrophone();
  } else {
    this._handleError({ error: 'start-failed' });
  }
  }
  }
  
  async _sendAudioToServer() {
  try {
    this._setStatusLabel('שולח לשרת תימלול...', 'processing');
    this._setMessage('עיבוד הקול...');
    
    // יצירת Blob מהנתונים
    const audioBlob = new Blob(this._audioChunks, { type: 'audio/webm' });
    
    // שליחה לשרת Python
    const formData = new FormData();
    formData.append('audio', audioBlob, 'audio.webm');
    
    const response = await fetch(`${this._voiceServerUrl}/api/transcribe`, {
      method: 'POST',
      body: formData
    });
    
    const result = await response.json();
    
    if (result.status === 'success') {
      // טימלול הצליח - טיפול בתוצאה
      this._handleTranscriptResult(result.transcript);
    } else {
      // שגיאה מהשרת
      this._handleError({ error: result.error || 'unknown' });
    }
  } catch (err) {
    console.error('[VoiceWizard] שגיאה בשליחה לשרת:', err);
    this._handleError({ error: 'network' });
  }
  }
  
  _handleTranscriptResult(rawTranscript) {
  const command = detectCommand(rawTranscript);
  
  if (command) {
    this._executeCommand(command, rawTranscript);
    return;
  }
  
  if (!this._currentFlow || this._stepIndex >= this._currentFlow.length) {
    this._setMessage('לא בתרימה פעילה.');
    return;
  }
  
  const step = this._currentFlow[this._stepIndex];
  this._setTranscript(rawTranscript);
  
  try {
    const parsed = step.parser(rawTranscript);
    
    if (step.validate && !step.validate(parsed)) {
      this._setMessage('ערך לא תקין. נסה שוב.');
      setTimeout(() => this._redoStep(), 1500);
      return;
    }
    
    this._collected[step.fieldKey] = parsed;
    
    this._setState('confirming');
    this._setStatusLabel('מחכה לאישור...', 'confirming');
    this._setMicState('idle');
    this._setWavesActive(false);
    
    setTimeout(() => this._nextStep(), 2000);
  } catch (err) {
    console.error('[VoiceWizard] שגיאת עיבוד:', err);
    this._setMessage('שגיאה בעיבוד. נסה שוב.');
    setTimeout(() => this._redoStep(), 1500);
  }
  }
  
  _stopListening() {
  if (this._mediaRecorder && this._mediaRecorder.state !== 'inactive') {
    this._mediaRecorder.stop();
  }
  if (this._recordingTimeout) {
    clearTimeout(this._recordingTimeout);
  }
  this._setMicState('idle');
  this._setWavesActive(false);
  this._setStatusLabel('');
  }



  _handleError(event) {
    const errCode = event.error || 'unknown';

    this._setMicState('idle');
    this._setWavesActive(false);

    if (errCode === 'no-speech') {
      this._setMessage('לא זוהה קול. נסה שוב.');
      setTimeout(() => this._redoStep(), 1500);
    } else if (errCode === 'not-allowed' || errCode === 'permission-denied') {
      this._handleNoMicrophone();
    } else if (errCode === 'network') {
      this._setMessage('בעיית רשת. נסה שוב.');
      setTimeout(() => this._redoStep(), 2000);
    } else {
      this._setMessage(`שגיאת זיהוי (${errCode}). נסה שוב.`);
      setTimeout(() => this._redoStep(), 2000);
    }
  }

  _handleRecognitionEnd() {
    // אם מצב עדיין 'listening' (לא הגיע תוצאה) - כנראה לא זוהה קול
    if (this._state === 'listening') {
      this._setMicState('idle');
      this._setWavesActive(false);
      this._setStatusLabel('');
    }
  }

  _handleNoMicrophone() {
    this._setMicState('idle');
    this._setWavesActive(false);
    this._setMessage(
      'לא ניתן לגשת למיקרופון. אנא אפשר הרשאת מיקרופון בהגדרות Windows ונסה שוב.'
    );
  }

  // ----------------------------------------------------------
  // 3f. פקודות קוליות
  // ----------------------------------------------------------

  _executeCommand(cmdKey, rawText) {
    switch (cmdKey) {
      case 'finish':
        // "סיימתי" - שמור תשובה חלקית אם יש ותמשיך
        const partialText = stripCommandWords(rawText);
        if (partialText) {
          const step = this._currentFlow[this._stepIndex];
          const parsedValue = step.parser ? step.parser(partialText) : partialText;
          this._collected[step.fieldKey] = parsedValue;
          this._showTranscript(partialText);
        }
        this._stepIndex++;
        this._clearTranscript();
        this._runStep();
        break;

      case 'goBack':
        this._goBack();
        break;

      case 'skip':
        this._skipStep();
        break;

      case 'cancel':
        this.cancel();
        break;

      case 'restart':
        this._stepIndex = 0;
        this._collected = {};
        this._clearTranscript();
        this._runStep();
        break;

      case 'stop':
        this._stopListening();
        this._setMessage('ההקלטה הופסקה. לחץ "הקלט שוב" להמשך.');
        break;

      case 'redo':
        this._redoStep();
        break;

      default:
        break;
    }
  }

  // ----------------------------------------------------------
  // 3g. מנוע הקראה (SpeechSynthesis)
  // ----------------------------------------------------------

  _speak(text, onEnd = null) {
    this._stopSpeech();
    this._setState('speaking');
    this._setMicState('speaking');
    this._setStatusLabel('מקריא...', 'speaking');

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'he-IL';
    utterance.rate = 0.95;
    utterance.pitch = 1;
    utterance.volume = 1;

    utterance.onend = () => {
      this._setMicState('idle');
      this._setStatusLabel('');
      if (onEnd) onEnd();
    };

    utterance.onerror = () => {
      this._setMicState('idle');
      if (onEnd) onEnd();
    };

    this._utterance = utterance;
    window.speechSynthesis.speak(utterance);
  }

  _stopSpeech() {
    window.speechSynthesis.cancel();
    this._utterance = null;
  }

  // ----------------------------------------------------------
  // 3h. ניגון קבצי שמע
  // ----------------------------------------------------------

  /**
   * מנגן קובץ MP3 ממסלול ./audio/ ומפעיל callback בסיום
   * @param {string} filename
   * @param {Function} [onEnd]
   */
  _playAudio(filename, onEnd = null) {
    if (!filename) { if (onEnd) onEnd(); return; }

    this._setState('playing');
    this._setMicState('playing');
    this._setStatusLabel('מנגן...');

    const audio = new Audio(`${AUDIO_BASE}${filename}`);

    audio.onended = () => {
      this._setMicState('idle');
      this._setStatusLabel('');
      if (onEnd) onEnd();
    };

    audio.onerror = () => {
      // אם הקובץ לא קיים - המשך ללא שגיאה
      console.warn(`[VoiceWizard] קובץ שמע לא נמצא: ${filename}`);
      this._setMicState('idle');
      this._setStatusLabel('');
      if (onEnd) onEnd();
    };

    audio.play().catch(() => {
      if (onEnd) onEnd();
    });
  }

  /** Beep קצר לפני התחלת הקלטה */
  _playBeep(onEnd = null) {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.2);

      osc.onended = () => {
        ctx.close();
        if (onEnd) onEnd();
      };
    } catch (_) {
      if (onEnd) onEnd();
    }
  }

  // ----------------------------------------------------------
  // 3i. עדכוני UI
  // ----------------------------------------------------------

  _openOverlay() {
    document.getElementById('voice-wizard-overlay').classList.add('vw-open');
  }

  _closeOverlay() {
    document.getElementById('voice-wizard-overlay').classList.remove('vw-open');
  }

  _setState(state) {
    this._state = state;
  }

  _resetState() {
    this._state = 'idle';
    this._currentFlow = null;
    this._stepIndex = 0;
    this._collected = {};
    this._meta = {};
    this._onComplete = null;
    this._onCancel = null;
  }

  _setMessage(text) {
    const el = document.getElementById('vw-message');
    if (el) el.textContent = text;
  }

  _updateHint(text) {
    const el = document.getElementById('vw-hint');
    if (el) el.textContent = text ? `רמז: ${text}` : '';
  }

  _setMicState(state) {
    const mic = document.getElementById('vw-mic-icon');
    if (!mic) return;
    mic.className = '';
    if (state !== 'idle') mic.classList.add(state);
  }

  _setWavesActive(active) {
    const waves = document.getElementById('vw-waves');
    if (!waves) return;
    waves.classList.toggle('active', active);
  }

  _setStatusLabel(text, cls = '') {
    const el = document.getElementById('vw-status-label');
    if (!el) return;
    el.textContent = text;
    el.className = cls;
  }

  _setTranscript(text) {
    this._showTranscript(text);
  }

  _showTranscript(text) {
    const area = document.getElementById('vw-transcript-area');
    const textEl = document.getElementById('vw-transcript-text');
    if (area && textEl) {
      textEl.textContent = text;
      area.classList.add('vw-visible');
    }
  }

  _clearTranscript() {
    const area = document.getElementById('vw-transcript-area');
    const textEl = document.getElementById('vw-transcript-text');
    if (area) area.classList.remove('vw-visible');
    if (textEl) textEl.textContent = '';
  }

  _updateProgress() {
    if (!this._currentFlow) return;
    const total = this._currentFlow.length;
    const current = this._stepIndex + 1;
    const pct = ((this._stepIndex) / total) * 100;

    const bar = document.getElementById('vw-progress-bar');
    const txt = document.getElementById('vw-progress-text');
    if (bar) bar.style.width = `${pct}%`;
    if (txt) txt.textContent = `שלב ${current} מתוך ${total}`;
  }
}

// ============================================================
// 4. אינטגרציה עם App - חיבור לפונקציות הקיימות
// ============================================================

/**
 * מאתחל את האשף הקולי ומחבר אותו ל-app
 * נקרא לאחר ש-App נוצר
 */
function initVoiceAssistant() {
  // המתן ל-App
  if (typeof app === 'undefined') {
    setTimeout(initVoiceAssistant, 100);
    return;
  }

  /** מופע יחיד של האשף */
  window.voiceWizard = new VoiceWizard();

  // --- הוספת שבת קולית ---
  app.addShabbatByVoice = function () {
    voiceWizard.start(
      'addShabbat',
      {},
      (result) => {
        if (!result.hebrewDate) { alert('לא סופק תאריך.'); return; }
        // שמור את התאריך העברי ישירות כ-string (לא תאריך לועזי)
        this.data.unshift({
          id: this.generateId(),
          date: result.hebrewDate,        // תאריך עברי כמחרוזת
          parsha: result.parsha || 'פרשת השבוע',
          guests: [],
          tasks: [],
          generalNotes: '',
        });
        this.save();
        this.renderDashboard();
      }
    );
  };

  // --- הוספת אורח קולית ---
  app.addGuestByVoice = function (sId) {
    voiceWizard.start(
      'addGuest',
      { shabbatId: sId },
      (result, meta) => {
        if (!result.name) return;
        const s = this.data.find((x) => x.id === meta.shabbatId);
        if (!s) return;

        s.guests.push({ id: this.generateId(), name: result.name, count: result.count || 1, tags: [] });

        // עדכון בנק אורחים
        const existsInBank = this.contacts.some((c) => c.name === result.name);
        if (this.settings.autoAddToBank && !existsInBank) {
          this.contacts.push({ id: this.generateId(), name: result.name, count: result.count || 1, lastSeen: s.date });
          this.contacts.sort((a, b) => a.name.localeCompare(b.name));
        } else if (existsInBank) {
          const c = this.contacts.find((c) => c.name === result.name);
          if (s.date > (c.lastSeen || '')) c.lastSeen = s.date;
        }

        this.save();
        this.renderDashboard();
      }
    );
  };

  // --- הוספת משימה קולית ---
  app.addTaskByVoice = function (sId) {
    voiceWizard.start(
      'addTask',
      { shabbatId: sId },
      (result, meta) => {
        if (!result.task) return;
        const s = this.data.find((x) => x.id === meta.shabbatId);
        if (!s) return;
        s.tasks.push(result.task);
        this.save();
        this.renderDashboard();
      }
    );
  };

  // --- עריכת הערות קולית ---
  app.editNotesByVoice = function (sId) {
    voiceWizard.start(
      'addNotes',
      { shabbatId: sId },
      (result, meta) => {
        const s = this.data.find((x) => x.id === meta.shabbatId);
        if (!s) return;
        s.generalNotes = result.notes || '';
        this.save();
        this.renderDashboard();
      }
    );
  };

  // --- הוספת איש קשר קולית ---
  app.addContactByVoice = function () {
    voiceWizard.start(
      'addContact',
      {},
      (result) => {
        if (!result.name) return;
        const exists = this.contacts.some((c) => c.name === result.name);
        if (exists) { alert('אורח זה כבר קיים בבנק.'); return; }
        this.contacts.push({ id: this.generateId(), name: result.name, count: result.count || 1, lastSeen: null });
        this.contacts.sort((a, b) => a.name.localeCompare(b.name));
        this.save();
        this.renderContacts();
      }
    );
  };

  // --- שינוי פרשה קולית ---
  app.editParshaByVoice = function (sId) {
    voiceWizard.start(
      'addShabbat',
      { shabbatId: sId },
      (result, meta) => {
        const s = this.data.find((x) => x.id === meta.shabbatId);
        if (!s) return;
        if (result.hebrewDate) s.date = result.hebrewDate;
        if (result.parsha)     s.parsha = result.parsha;
        this.save();
        this.renderDashboard();
      }
    );
  };

  console.log('[VoiceAssistant] אשף קולי הותקן בהצלחה.');
}

// הפעלה אוטומטית לאחר טעינת המסמך
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initVoiceAssistant);
} else {
  initVoiceAssistant();
}
