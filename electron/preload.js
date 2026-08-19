const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('toolceo', {
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
});
