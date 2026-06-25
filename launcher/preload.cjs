const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('elyon', {
  status: () => ipcRenderer.invoke('status'),
  openFolder: () => ipcRenderer.invoke('open-folder'),
  openBrowser: () => ipcRenderer.invoke('open-browser'),
  gitPull: () => ipcRenderer.invoke('git-pull'),
  npmInstall: () => ipcRenderer.invoke('npm-install'),
  startDev: () => ipcRenderer.invoke('start-dev'),
  stopDev: () => ipcRenderer.invoke('stop-dev'),
  onLog: (callback) => ipcRenderer.on('log', (_event, value) => callback(value)),
  onServerStopped: (callback) => ipcRenderer.on('server-stopped', callback),
});
