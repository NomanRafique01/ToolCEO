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

  saveFileAs: (filename, base64Data) =>
    ipcRenderer.invoke('save-file-dialog', filename, base64Data),

  // ── Vault file: read a local .tceo file into a JS File object ────────────────
  // Returns { ok, buffer, name, size } or { ok: false, error }
  readLocalFile: (filePath) =>
    ipcRenderer.invoke('read-local-file', filePath),

  // ── Vault file: subscribe to vault-file-open events from main process ────────
  // callback: (filePath: string) => void
  // Returns an unsubscribe function.
  onVaultFileOpen: (callback) => {
    const handler = (_event, { filePath }) => callback(filePath);
    ipcRenderer.on('vault-file-open', handler);
    return () => ipcRenderer.removeListener('vault-file-open', handler);
  },
});
