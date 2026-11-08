const { app, BrowserWindow, shell, ipcMain, dialog, safeStorage } = require('electron');
const { autoUpdater } = require('electron-updater');
const { startServer } = require('./server.cjs');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const readline = require('node:readline');
let server, win, socialBridge, isQuitting=false;
let socialState={status:'signedOut',friends:[]};
let socialAuthFile;
function publishSocial(data){
  if(data.type==='friends')socialState={status:'ready',friends:Array.isArray(data.friends)?data.friends:[]};
  else if(data.type==='status')socialState={...socialState,status:data.status};
  else if(data.type==='error')socialState={...socialState,status:'error',message:data.message||'Discord Social SDK error'};
  win?.webContents.send('social-event',data);
}
function report(status, detail='') { win?.webContents.send('update-status',{status,detail}); }
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.on('checking-for-update',()=>report('checking','Checking for launcher updates…'));
autoUpdater.on('update-available',info=>report('downloading',`Version ${info.version} is available. Downloading in the background…`));
autoUpdater.on('update-not-available',()=>report('current','You’re on the latest version.'));
autoUpdater.on('download-progress',p=>report('downloading',`Downloading update · ${Math.round(p.percent)}%`));
autoUpdater.on('update-downloaded',info=>report('ready',`Version ${info.version} is downloaded and ready to install.`));
autoUpdater.on('error',e=>report('error',e.message || 'Update check failed.'));
app.whenReady().then(async () => {
  const authFile=path.join(app.getPath('userData'),'discord-session.dat');
  socialAuthFile=path.join(app.getPath('userData'),'discord-social-session.dat');
  const storage={
    load(){try{if(!safeStorage.isEncryptionAvailable())return null;return JSON.parse(safeStorage.decryptString(Buffer.from(fs.readFileSync(authFile,'utf8'),'base64')))}catch{return null}},
    save(value){if(!safeStorage.isEncryptionAvailable())throw new Error('Windows secure storage is unavailable');fs.mkdirSync(path.dirname(authFile),{recursive:true});const temp=authFile+'.tmp';fs.writeFileSync(temp,safeStorage.encryptString(JSON.stringify(value)).toString('base64'));fs.renameSync(temp,authFile)},
    clear(){try{fs.rmSync(authFile,{force:true})}catch{}}
  };
  server = await startServer(4317,storage);
  win = new BrowserWindow({ width: 1440, height: 900, minWidth: 1050, minHeight: 720, backgroundColor: '#080b18', title: 'NEXA VERSE LAUNCHER', icon:path.join(__dirname,'nexa-icon.ico'), autoHideMenuBar: true,
    webPreferences: { preload: require('node:path').join(__dirname,'preload.cjs'), nodeIntegration: false, contextIsolation: true, partition:'persist:nexa-verse-launcher' } });
  ipcMain.handle('pick-folder', async () => { const result=await dialog.showOpenDialog(win,{properties:['openDirectory']}); return result.canceled ? null : result.filePaths[0]; });
  ipcMain.handle('launch-ds4windows', async () => {
    const result=await dialog.showOpenDialog(win,{title:'Select DS4Windows.exe',properties:['openFile'],filters:[{name:'DS4Windows',extensions:['exe']}]});
    if(result.canceled||!result.filePaths[0])return {canceled:true};
    const executable=path.resolve(result.filePaths[0]);
    if(path.basename(executable).toLowerCase()!=='ds4windows.exe')return {ok:false,error:'Select the DS4Windows.exe application.'};
    return await new Promise(resolve=>{
      const child=spawn(executable,[],{cwd:path.dirname(executable),detached:true,stdio:'ignore',windowsHide:false});
      child.once('spawn',()=>{child.unref();resolve({ok:true})});
      child.once('error',error=>resolve({ok:false,error:`Could not start DS4Windows: ${error.message}`}));
    });
  });
  ipcMain.handle('social-state',()=>socialState);
  ipcMain.handle('connect-social',()=>{
    if(!socialBridge||socialBridge.killed)return {ok:false,error:'The Discord Social SDK could not start in this build.'};
    socialState={...socialState,status:'authorizing'};socialBridge.stdin.write('AUTH\n');return {ok:true};
  });
  ipcMain.handle('refresh-social-friends',()=>{
    if(!socialBridge||socialBridge.killed)return {ok:false,error:'The Discord Social SDK is not running.'};
    socialBridge.stdin.write('REFRESH_FRIENDS\n');return {ok:true};
  });
  ipcMain.handle('open-external', async (_, value) => { const url=new URL(value); if(url.protocol!=='https:'||url.hostname!=='discord.com')throw new Error('Only Discord authorization links can be opened.'); return shell.openExternal(url.toString()); });
  ipcMain.handle('check-updates', async () => { if(!app.isPackaged)return {status:'dev',detail:'Updates are checked in the installed launcher build.'}; try { await autoUpdater.checkForUpdates(); return {status:'checking',detail:'Checking for launcher updates…'} } catch(e){return {status:'error',detail:e.message}} });
  ipcMain.on('install-update',()=>autoUpdater.quitAndInstall());
  ipcMain.on('window-action',(_,action)=>{ if(action==='minimize')win.minimize(); if(action==='maximize')win.isMaximized()?win.unmaximize():win.maximize(); if(action==='close')win.close(); });
  const socialExe=app.isPackaged?path.join(process.resourcesPath,'native','social-bridge.exe'):path.join(__dirname,'native','social-bridge.exe');
  if(fs.existsSync(socialExe)){
    socialBridge=spawn(socialExe,[],{cwd:path.dirname(socialExe),windowsHide:true,stdio:['pipe','pipe','pipe']});
    const lines=readline.createInterface({input:socialBridge.stdout,crlfDelay:Infinity});
    lines.on('line',line=>{try{const data=JSON.parse(line);if(data.type==='token'){
      if(safeStorage.isEncryptionAvailable()){
        fs.mkdirSync(path.dirname(socialAuthFile),{recursive:true});
        const saved={accessToken:data.accessToken,refreshToken:data.refreshToken,expiresAt:Date.now()+(Number(data.expiresIn)||604800)*1000};
        const temp=socialAuthFile+'.tmp';fs.writeFileSync(temp,safeStorage.encryptString(JSON.stringify(saved)).toString('base64'));fs.renameSync(temp,socialAuthFile);
      }
      publishSocial({type:'status',status:'connecting'});
    }else publishSocial(data)}catch(error){console.warn('Discord Social SDK output could not be read:',error.message)}});
    socialBridge.stderr.on('data',chunk=>console.warn(String(chunk).trim()));
    socialBridge.on('error',error=>publishSocial({type:'error',message:`Could not start Discord Social SDK: ${error.message}`}));
    socialBridge.on('exit',code=>{if(!isQuitting&&code!==0)publishSocial({type:'error',message:'Discord Social SDK stopped unexpectedly.'})});
    try{
      if(safeStorage.isEncryptionAvailable()&&fs.existsSync(socialAuthFile)){
        const saved=JSON.parse(safeStorage.decryptString(Buffer.from(fs.readFileSync(socialAuthFile,'utf8'),'base64')));
        if(saved.refreshToken){socialState={status:'connecting',friends:[]};socialBridge.stdin.write(`REFRESH\t${saved.refreshToken}\n`)}
        else if(saved.accessToken){socialState={status:'connecting',friends:[]};socialBridge.stdin.write(`CONNECT\t${saved.accessToken}\n`)}
      }
    }catch(error){console.warn('Saved Discord Social SDK session could not be loaded:',error.message)}
  }else{
    publishSocial({type:'error',message:'Discord Social SDK runtime is missing from this launcher build.'});
  }
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.loadURL('http://127.0.0.1:4317');
  if(app.isPackaged) setTimeout(()=>autoUpdater.checkForUpdates().catch(e=>report('error',e.message)),2500);
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => {isQuitting=true;server?.close();try{socialBridge?.stdin.write('QUIT\n')}catch{}});
