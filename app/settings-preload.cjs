// What the settings window may do: read and change the settings, pick a folder, send a test notification.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('cfg', {
  get: () => ipcRenderer.invoke('cfg:get'),
  set: (patch) => ipcRenderer.invoke('cfg:set', patch),
  pickFolder: () => ipcRenderer.invoke('cfg:pickFolder'),
  testNotify: () => ipcRenderer.invoke('cfg:testNotify'),
});
