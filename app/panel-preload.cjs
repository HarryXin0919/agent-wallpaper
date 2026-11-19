// What the pop-up panel may do: read the tasks, quotas and settings, open a session, ask for the peek view or the
// settings, and say how tall it is.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('panel', {
  hello: () => ipcRenderer.invoke('panel:hello'),
  onAll: (fn) => ipcRenderer.on('panel:all', (_e, h) => fn(h)),
  onData: (fn) => ipcRenderer.on('data', (_e, d) => fn(d)),
  onUsage: (fn) => ipcRenderer.on('usage', (_e, u) => fn(u)),
  onView: (fn) => ipcRenderer.on('view', (_e, v) => fn(v)),
  open: (id) => ipcRenderer.send('panel:open', id),
  act: (what) => ipcRenderer.send('panel:act', what),
  size: (h) => ipcRenderer.send('panel:size', h),
});
