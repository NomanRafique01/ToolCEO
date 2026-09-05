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
  // Status read/write
  readModulesJson:  ()                    => ipcRenderer.invoke('read-modules-json'),
  writeModulesJson: (moduleId, status)    => ipcRenderer.invoke('write-modules-json', moduleId, status),
  getBuildInfo:     ()                    => ipcRenderer.invoke('get-build-info'),

  // Download lifecycle
  startModuleDownload:     ({ moduleId, downloadUrl }) => ipcRenderer.invoke('start-module-download', { moduleId, downloadUrl }),
  cancelModuleDownload:    ()                           => ipcRenderer.invoke('cancel-module-download'),
  resumeModuleDownload:    ()                           => ipcRenderer.invoke('resume-module-download'),
  getActiveModuleDownload: ()                           => ipcRenderer.invoke('get-active-module-download'),

  // Progress / status events (renderer subscribes to these)
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
  getFileIcon:         (filePath) => ipcRenderer.invoke('shell:getFileIcon', filePath),
});
