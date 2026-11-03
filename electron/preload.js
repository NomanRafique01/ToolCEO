/**
 * electron/preload.js
 *
 * Exposes a minimal, safe API surface to the renderer via contextBridge.
 * All IPC channels are allowlisted here — the renderer cannot access Node directly.
 */

'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('toolceo', {
  // ── File saving ──────────────────────────────────────────────────────────────
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),

  saveToDownloads: (filename, base64Data) =>
    ipcRenderer.invoke('save-to-downloads', filename, base64Data),

  saveFileAs: (filename, base64Data, conversionMeta) =>
    ipcRenderer.invoke('save-file-dialog', filename, base64Data, conversionMeta),

  selectDirectory: (options) =>
    ipcRenderer.invoke('select-directory-dialog', options),

  openPath: (filePath) =>
    ipcRenderer.invoke('shell:openPath', filePath),

  openExternal: (url) =>
    ipcRenderer.invoke('shell:openExternal', url),

  showItemInFolder: (filePath) =>
    ipcRenderer.invoke('shell:showItemInFolder', filePath),

  // ── Vault file: read a local .tceo file into a JS File object ────────────────
  // Returns { ok, buffer, name, size } or { ok: false, error }
  readLocalFile: (filePath) =>
    ipcRenderer.invoke('read-local-file', filePath),

  readClipboardFile: () =>
    ipcRenderer.invoke('read-clipboard-file'),

  // ── Vault file: subscribe to vault-file-open events from main process ────────
  // callback: (filePath: string) => void
  // Returns an unsubscribe function.
  onVaultFileOpen: (callback) => {
    const handler = (_event, { filePath }) => callback(filePath);
    ipcRenderer.on('vault-file-open', handler);
    return () => ipcRenderer.removeListener('vault-file-open', handler);
  },
});

// ─── Module management API ────────────────────────────────────────────────────
contextBridge.exposeInMainWorld('electronAPI', {
  appVersion: process.env.npm_package_version || require('../package.json').version,

  // ── Application updates ───────────────────────────────────────────────────
  updater: {
    checkForUpdates: (options) => ipcRenderer.invoke('updater:check-for-updates', options),
    startDownload: () => ipcRenderer.invoke('updater:start-download'),
    quitAndInstall: () => ipcRenderer.invoke('updater:quit-and-install'),
    getStatus: () => ipcRenderer.invoke('updater:get-status'),
    onUpdateAvailable: (cb) => {
      const handler = (_e, payload) => cb(payload);
      ipcRenderer.on('updater:update-available', handler);
      return () => ipcRenderer.removeListener('updater:update-available', handler);
    },
    onUpdateNotAvailable: (cb) => {
      const handler = (_e, payload) => cb(payload);
      ipcRenderer.on('updater:update-not-available', handler);
      return () => ipcRenderer.removeListener('updater:update-not-available', handler);
    },
    onDownloadProgress: (cb) => {
      const handler = (_e, payload) => cb(payload);
      ipcRenderer.on('updater:download-progress', handler);
      return () => ipcRenderer.removeListener('updater:download-progress', handler);
    },
    onUpdateDownloaded: (cb) => {
      const handler = (_e, payload) => cb(payload);
      ipcRenderer.on('updater:update-downloaded', handler);
      return () => ipcRenderer.removeListener('updater:update-downloaded', handler);
    },
    onError: (cb) => {
      const handler = (_e, payload) => cb(payload);
      ipcRenderer.on('updater:error', handler);
      return () => ipcRenderer.removeListener('updater:error', handler);
    },
  },

  // Status read/write
  readModulesJson:  ()                    => ipcRenderer.invoke('read-modules-json'),
  writeModulesJson: (moduleId, status)    => ipcRenderer.invoke('write-modules-json', moduleId, status),
  getBuildInfo:     ()                    => ipcRenderer.invoke('get-build-info'),

  // Download lifecycle
  startModuleDownload:      ({ moduleId, downloadUrl }) => ipcRenderer.invoke('start-module-download', { moduleId, downloadUrl }),
  cancelModuleDownload:     ()                           => ipcRenderer.invoke('cancel-module-download'),
  resumeModuleDownload:     ()                           => ipcRenderer.invoke('resume-module-download'),
  getActiveModuleDownload:  ()                           => ipcRenderer.invoke('get-active-module-download'),

  // Install lifecycle (Step 2 of 2)
  startModuleInstall:       ({ moduleId })               => ipcRenderer.invoke('start-module-install', { moduleId }),
  cancelModuleInstall:      ()                           => ipcRenderer.invoke('cancel-module-install'),

  // Download events (renderer subscribes to these)
  onModuleDownloadProgress: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on('module-download-progress', handler);
    return () => ipcRenderer.removeListener('module-download-progress', handler);
  },
  onModuleDownloadComplete: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on('module-download-complete', handler);
    return () => ipcRenderer.removeListener('module-download-complete', handler);
  },
  onModuleDownloadError: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on('module-download-error', handler);
    return () => ipcRenderer.removeListener('module-download-error', handler);
  },
  onModuleDownloadCancelled: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on('module-download-cancelled', handler);
    return () => ipcRenderer.removeListener('module-download-cancelled', handler);
  },

  // Install events (renderer subscribes to these)
  onModuleInstallProgress: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on('module-install-progress', handler);
    return () => ipcRenderer.removeListener('module-install-progress', handler);
  },
  onModuleInstallComplete: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on('module-install-complete', handler);
    return () => ipcRenderer.removeListener('module-install-complete', handler);
  },
  onModuleInstallError: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on('module-install-error', handler);
    return () => ipcRenderer.removeListener('module-install-error', handler);
  },
  onModuleInstallCancelled: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on('module-install-cancelled', handler);
    return () => ipcRenderer.removeListener('module-install-cancelled', handler);
  },

  // ── Database & History API ───────────────────────────────────────────────────
  addConversion:       (data)     => ipcRenderer.invoke('db:add-conversion', data),
  getAllConversions:   ()         => ipcRenderer.invoke('db:get-all-conversions'),
  deleteConversion:    (id)       => ipcRenderer.invoke('db:delete-conversion', id),
  clearAll:            ()         => ipcRenderer.invoke('db:clear-all'),
  clearAllConversions: ()         => ipcRenderer.invoke('db:clear-all'),
  checkFileExists:     (filePath) => ipcRenderer.invoke('db:check-file-exists', filePath),

  // Conversion events
  onConversionRecorded: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on('conversion-recorded', handler);
    return () => ipcRenderer.removeListener('conversion-recorded', handler);
  },
  onConversionCleared: (cb) => {
    const handler = () => cb();
    ipcRenderer.on('conversion-history-cleared', handler);
    return () => ipcRenderer.removeListener('conversion-history-cleared', handler);
  },
  onConversionDeleted: (cb) => {
    const handler = (_e, id) => cb(id);
    ipcRenderer.on('conversion-deleted', handler);
    return () => ipcRenderer.removeListener('conversion-deleted', handler);
  },

  // ── OS / Shell helpers ───────────────────────────────────────────────────────
  showItemInFolder:    (filePath) => ipcRenderer.invoke('shell:showItemInFolder', filePath),
  openPath:            (filePath) => ipcRenderer.invoke('shell:openPath', filePath),
  openExternal:        (url)      => ipcRenderer.invoke('shell:openExternal', url),
  getFileIcon:         (filePath) => ipcRenderer.invoke('shell:getFileIcon', filePath),
  selectDirectory:     (options) => ipcRenderer.invoke('select-directory-dialog', options),
});

contextBridge.exposeInMainWorld('toolceoConfig', {
  backendPort: 8765,
  backendUrl: 'http://127.0.0.1:8765',
});
