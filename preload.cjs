const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('launcher', {
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  pickGameApplication: () => ipcRenderer.invoke('pick-game-application'),
  launchGame: executable => ipcRenderer.invoke('launch-game', executable),
  launchDS4Windows: () => ipcRenderer.invoke('launch-ds4windows'),
  openExternal: url => ipcRenderer.invoke('open-external',url),
  checkUpdates: () => ipcRenderer.invoke('check-updates'),
  getVersion: () => ipcRenderer.invoke('app-version'),
  getSocialState: () => ipcRenderer.invoke('social-state'),
  setDiscordActivity: enabled => ipcRenderer.invoke('set-discord-activity',enabled),
  connectSocial: () => ipcRenderer.invoke('connect-social'),
  refreshSocialFriends: () => ipcRenderer.invoke('refresh-social-friends'),
  onSocialEvent: callback => ipcRenderer.on('social-event',(_,data)=>callback(data)),
  installUpdate: () => ipcRenderer.send('install-update'),
  onUpdateStatus: callback => ipcRenderer.on('update-status',(_,data)=>callback(data)),
});



