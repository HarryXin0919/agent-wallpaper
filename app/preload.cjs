// What crosses into the page: the timeline data, the on/off switches, icon positions, the wallpaper image and the settings.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('wall', {
  onData: (fn) => ipcRenderer.on('data', (_e, d) => fn(d)),
  onState: (fn) => ipcRenderer.on('state', (_e, s) => fn(s)),
  onIcons: (fn) => ipcRenderer.on('icons', (_e, i) => fn(i)),
  onWallpaper: (fn) => ipcRenderer.on('wallpaper', (_e, w) => fn(w)),
  hello: () => ipcRenderer.invoke('hello'),
  targets: (list) => ipcRenderer.send('targets', list),
  onHover: (fn) => ipcRenderer.on('hover', (_e, id) => fn(id)),
  onClearDone: (fn) => ipcRenderer.on('clearDone', () => fn()),
  onUsage: (fn) => ipcRenderer.on('usage', (_e, u) => fn(u)),
  dismiss: (ids) => ipcRenderer.send('dismiss', ids),
  onView: (fn) => ipcRenderer.on('view', (_e, v) => fn(v)),
  onAll: (fn) => ipcRenderer.on('all', (_e, h) => fn(h)),
  // the peek view only: open a session, or close the view
  peekOpen: (id) => ipcRenderer.send('peek:open', id),
  peekClose: () => ipcRenderer.send('peek:close'),
});
