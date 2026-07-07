/**
 * preload.js - גשר בטוח בין Electron ל-Renderer
 * חושף רק את ה-API הנדרש דרך contextBridge
 */

const { contextBridge, ipcRenderer } = require('electron');

// חשיפה מינימלית ובטוחה לדף ה-HTML
contextBridge.exposeInMainWorld('electronAPI', {
  // גרסת האפליקציה (לתצוגה ב-UI)
  appVersion: process.env.npm_package_version || '1.0.0',
  // פלטפורמה (לשימוש עתידי)
  platform: process.platform,
  // אינדיקטור: רץ בתוך Electron
  isElectron: true,
});
