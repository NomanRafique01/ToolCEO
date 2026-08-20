const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('toolceo', {
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  saveToDownloads: (filename, base64Data) =>
    ipcRenderer.invoke('save-to-downloads', filename, base64Data),
  saveFileAs: (filename, base64Data) =>
    ipcRenderer.invoke('save-file-dialog', filename, base64Data),
});
