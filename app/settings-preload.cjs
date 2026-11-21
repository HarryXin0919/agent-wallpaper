// What the settings window may do: read and change the settings, pick a folder, send a test notification, updates.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('cfg', {
  get: () => ipcRenderer.invoke('cfg:get'),
  set: (patch) => ipcRenderer.invoke('cfg:set', patch),
  pickFolder: () => ipcRenderer.invoke('cfg:pickFolder'),
  importFont: (slot) => ipcRenderer.invoke('cfg:importFont', slot),
  removeFont: (id) => ipcRenderer.invoke('cfg:removeFont', id),
  testNotify: () => ipcRenderer.invoke('cfg:testNotify'),
  testPush: () => ipcRenderer.invoke('cfg:testPush'),
  verifyPush: (code) => ipcRenderer.invoke('cfg:verifyPush', code),
  update: () => ipcRenderer.invoke('cfg:update'),
  checkUpdate: () => ipcRenderer.invoke('cfg:checkUpdate'),
  installUpdate: () => ipcRenderer.invoke('cfg:installUpdate'),
  openReleases: () => ipcRenderer.invoke('cfg:openReleases'),
  onUpdate: (fn) => ipcRenderer.on('update', (_e, u) => fn(u)),
});
