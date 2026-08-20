const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path    = require('path');
const fs      = require('fs');
const { spawn } = require('child_process');

let backendProcess = null;

function startBackend() {
  const backendDir = path.join(__dirname, '..', 'backend');

  // Try 'python' first, fall back to 'python3'
  const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';

  backendProcess = spawn(
    pythonCmd,
    ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', '8000'],
    { cwd: backendDir, stdio: 'ignore' }
  );

  backendProcess.on('error', (err) => {
    console.error('Failed to start backend:', err.message);
  });
}

function waitForBackend(url, retries, delay, callback) {
  const http = require('http');
  http.get(url, () => callback()).on('error', () => {
    if (retries <= 0) { callback(); return; }
    setTimeout(() => waitForBackend(url, retries - 1, delay, callback), delay);
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 750,
    minWidth: 1000,
    minHeight: 650,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, 'ui', 'index.html'));
}

app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');

app.whenReady().then(() => {
  // ── Save file to Downloads folder ──────────────────────────────────────────
  ipcMain.handle('save-to-downloads', (_event, filename, base64Data) => {
    const downloadsDir = app.getPath('downloads');
    const filePath = path.join(downloadsDir, filename);
    const buffer = Buffer.from(base64Data, 'base64');
    fs.writeFileSync(filePath, buffer);
    return filePath;
  });

  ipcMain.handle('save-file-dialog', async (_event, filename, base64Data) => {
    const downloadsDir = app.getPath('downloads');
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Save file',
      defaultPath: path.join(downloadsDir, filename),
      buttonLabel: 'Save',
    });
    if (canceled || !filePath) return null;
    const buffer = Buffer.from(base64Data, 'base64');
    fs.writeFileSync(filePath, buffer);
    return filePath;
  });

  // ── Start Python backend, then open window ─────────────────────────────────
  startBackend();
  waitForBackend('http://127.0.0.1:8000/health', 20, 500, () => {
    createWindow();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
  }
});
