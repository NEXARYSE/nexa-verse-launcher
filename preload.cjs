const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('launcher', {
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  openExternal: url => ipcRenderer.invoke('open-external',url),
  checkUpdates: () => ipcRenderer.invoke('check-updates'),
  getSocialState: () => ipcRenderer.invoke('social-state'),
  connectSocial: () => ipcRenderer.invoke('connect-social'),
  refreshSocialFriends: () => ipcRenderer.invoke('refresh-social-friends'),
  onSocialEvent: callback => ipcRenderer.on('social-event',(_,data)=>callback(data)),
  installUpdate: () => ipcRenderer.send('install-update'),
  onUpdateStatus: callback => ipcRenderer.on('update-status',(_,data)=>callback(data)),
  windowAction: action => ipcRenderer.send('window-action', action)
});
