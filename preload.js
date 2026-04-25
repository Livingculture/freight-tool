const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('freightApi', {
  request: request => ipcRenderer.invoke('freight:request', request)
});
