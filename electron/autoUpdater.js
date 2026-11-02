/**
 * Owns the application update lifecycle and keeps Electron-specific updater
 * details out of the main-process bootstrap.
 */
'use strict';

const { app } = require('electron');
const { autoUpdater } = require('electron-updater');

const DEV_UPDATER_FLAG = 'TOOLCEO_ENABLE_UPDATER';
const MOCK_VERSION_FLAG = 'TOOLCEO_UPDATER_MOCK_VERSION';

let mainWindow = null;
let initialized = false;
let checkTimer = null;
let status = {
  state: 'idle',
  version: null,
  releaseDate: null,
  releaseNotes: null,
  progress: null,
  error: null,
};

function canUseUpdater() {
  return Boolean(app.isPackaged || process.env[MOCK_VERSION_FLAG] || process.env[DEV_UPDATER_FLAG] === 'true');
}

function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function serializableReleaseNotes(releaseNotes) {
  if (Array.isArray(releaseNotes)) {
    return releaseNotes.map((note) => ({
      version: note.version,
      note: note.note,
    }));
  }
  return releaseNotes || null;
}

function setStatus(next) {
  status = { ...status, ...next };
  return getStatus();
}

function getStatus() {
  return { ...status, updaterEnabled: Boolean(canUseUpdater()) };
}

function handleError(error) {
  const message = error && error.message ? error.message : String(error || 'Unknown update error');
  setStatus({ state: 'error', error: message });
  send('updater:error', { message });
}

function initialize(window) {
  mainWindow = window;
  if (initialized) return getStatus();

  initialized = true;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    setStatus({ state: 'checking', error: null });
  });

  autoUpdater.on('update-available', (info) => {
    const update = {
      version: info.version || null,
      releaseDate: info.releaseDate || null,
      releaseNotes: serializableReleaseNotes(info.releaseNotes),
    };
    setStatus({ state: 'available', ...update, progress: null, error: null });
    send('updater:update-available', update);
  });

  autoUpdater.on('update-not-available', (info) => {
    setStatus({ state: 'up-to-date', version: info.version || null, progress: null, error: null });
    send('updater:update-not-available', { version: info.version || null });
  });

  autoUpdater.on('download-progress', (progress) => {
    const update = {
      percent: progress.percent || 0,
      bytesPerSecond: progress.bytesPerSecond || 0,
      transferred: progress.transferred || 0,
      total: progress.total || 0,
    };
    setStatus({ state: 'downloading', progress: update, error: null });
    send('updater:download-progress', update);
  });

  autoUpdater.on('update-downloaded', (info) => {
    const update = { version: info.version || status.version || null };
    setStatus({ state: 'ready_to_install', ...update, progress: null, error: null });
    send('updater:update-downloaded', update);
  });

  autoUpdater.on('error', handleError);
  return getStatus();
}

async function checkForUpdates() {
  if (!canUseUpdater()) {
    return setStatus({ state: 'disabled', error: null });
  }

  const mockVersion = process.env[MOCK_VERSION_FLAG];
  if (mockVersion) {
    const update = { version: mockVersion, releaseDate: null, releaseNotes: null };
    setStatus({ state: 'available', ...update, progress: null, error: null });
    send('updater:update-available', update);
    return getStatus();
  }

  try {
    setStatus({ state: 'checking', error: null });
    await autoUpdater.checkForUpdates();
  } catch (error) {
    handleError(error);
  }
  return getStatus();
}

async function startDownload() {
  if (!canUseUpdater()) return setStatus({ state: 'disabled', error: null });
  if (status.state !== 'available') return getStatus();

  const mockVersion = process.env[MOCK_VERSION_FLAG];
  if (mockVersion) {
    const total = 10 * 1024 * 1024;
    const start = { percent: 0, bytesPerSecond: 2 * 1024 * 1024, transferred: 0, total };
    setStatus({ state: 'downloading', progress: start, error: null });
    send('updater:download-progress', start);
    await new Promise((resolve) => setTimeout(resolve, 180));
    const midway = { percent: 65, bytesPerSecond: 2 * 1024 * 1024, transferred: Math.round(total * 0.65), total };
    setStatus({ state: 'downloading', progress: midway });
    send('updater:download-progress', midway);
    await new Promise((resolve) => setTimeout(resolve, 180));
    const complete = { percent: 100, bytesPerSecond: 2 * 1024 * 1024, transferred: total, total };
    send('updater:download-progress', complete);
    setStatus({ state: 'ready_to_install', version: mockVersion, progress: null, error: null });
    send('updater:update-downloaded', { version: mockVersion });
    return getStatus();
  }

  try {
    setStatus({ state: 'downloading', error: null });
    await autoUpdater.downloadUpdate();
  } catch (error) {
    handleError(error);
  }
  return getStatus();
}

function quitAndInstall() {
  if (status.state !== 'ready_to_install') return getStatus();
  autoUpdater.quitAndInstall(false, true);
  return getStatus();
}

function scheduleInitialCheck(delayMs = 6000) {
  if (checkTimer) clearTimeout(checkTimer);
  checkTimer = setTimeout(() => {
    checkTimer = null;
    void checkForUpdates();
  }, delayMs);
}

module.exports = {
  checkForUpdates,
  getStatus,
  initialize,
  quitAndInstall,
  scheduleInitialCheck,
  startDownload,
};
