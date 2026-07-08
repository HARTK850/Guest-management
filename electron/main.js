/**
 * main.js - נקודת כניסה ראשית של Electron
 * ניהול אירוח לשבת - עוזר קולי
 */

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');

// ===== יצירת חלון ראשי =====
function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'ניהול אירוח לשבת',
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      // הרשאה לשימוש ב-Web Speech API
      webSecurity: true,
    },
    backgroundColor: '#f8fafc',
    show: false, // נציג רק אחרי שהדף נטען
  });

  // טעינת קובץ ה-HTML הראשי
  const indexPath = app.isPackaged
  ? path.join(process.resourcesPath, 'public', 'index.html')
  : path.join(__dirname, '..', 'public', 'index.html');

win.loadFile(indexPath);

  // הצג את החלון רק לאחר שסיים לטעון (מניעת מסך לבן)
  win.once('ready-to-show', () => {
    win.show();
  });

  // פתיחת קישורים חיצוניים בדפדפן ולא ב-Electron
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// ===== אירועי מחזור חיים =====
app.whenReady().then(() => {
  createWindow();

  // macOS: פתח מחדש בלחיצה על האייקון בדוק
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// סגור את האפליקציה כאשר כל החלונות סגורים (Windows / Linux)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ===== IPC: תמלול שמע דרך Python =====
ipcMain.handle('transcribe-audio', async (_event, wavBuffer) => {
  return new Promise((resolve) => {
    // כתוב את ה-WAV לקובץ זמני
    const tmpFile = path.join(os.tmpdir(), `vw_${Date.now()}.wav`);
    fs.writeFileSync(tmpFile, Buffer.from(wavBuffer));

    // מצא את נתיב הפייתון
    const scriptPath = app.isPackaged
      ? path.join(process.resourcesPath, 'electron', 'transcribe.py')
      : path.join(__dirname, 'transcribe.py');

    // הפעל python / python3
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    const proc = spawn(pythonCmd, [scriptPath, tmpFile]);

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    proc.on('close', () => {
      // מחק קובץ זמני
      try { fs.unlinkSync(tmpFile); } catch (_) {}

      try {
        const result = JSON.parse(stdout.trim());
        resolve(result);
      } catch (_) {
        resolve({ ok: false, error: stderr || 'parse_error' });
      }
    });

    proc.on('error', (err) => {
      try { fs.unlinkSync(tmpFile); } catch (_) {}
      resolve({ ok: false, error: `python_not_found: ${err.message}` });
    });

    // timeout של 15 שניות
    setTimeout(() => {
      proc.kill();
      try { fs.unlinkSync(tmpFile); } catch (_) {}
      resolve({ ok: false, error: 'timeout' });
    }, 15000);
  });
});

// ===== IPC: הרשאת מיקרופון =====
// Electron דורש הרשאה מפורשת ל-getUserMedia
app.on('web-contents-created', (event, contents) => {
  contents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    // אשר אוטומטית הרשאות מיקרופון ומדיה
    if (['microphone', 'media'].includes(permission)) {
      callback(true);
    } else {
      callback(false);
    }
  });
});
