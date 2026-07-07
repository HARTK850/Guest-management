/**
 * main.js - נקודת כניסה ראשית של Electron
 * ניהול אירוח לשבת - עוזר קולי
 */

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');

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
  win.loadFile(path.join(__dirname, '..', 'public', 'index.html'));

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
