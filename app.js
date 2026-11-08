let linked=false,member=null,user=null,folder=localStorage.getItem('nv_game_folder')||'';
const $=s=>document.querySelector(s),play=$('#playBtn');
let statusRefresh=null;
let socialState={status:'signedOut',friends:[]};
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2600)}
function update(){play.disabled=!linked||member!==true;$('#accountSetting').textContent=linked?`Connected as ${user?.displayName||user?.username||'Discord user'}${member===false?' • Join Nexa Verse to unlock':member===null?' • Membership check unavailable':''}`:'Not connected';$('#accountBtn').textContent=linked?'Disconnect':'Connect Discord';const display=folder||'Not linked';$('#game-folder').textContent=display.length>25?'…'+display.slice(-23):display;$('#game-folder-display').textContent=folder||'No folder linked';$('#gameFolderSetting').textContent=folder||'Link your installed PC game directory.';$('#profile-name').textContent=user?.displayName||user?.username||'Discord not linked';$('#profile-handle').textContent=linked?`Discord · @${user?.username||'connected'} · ${member===true?'Nexa Verse member':member===false?'Not in Nexa Verse':'Checking server status'}`:'Account status · Not connected';$('#profile-status').textContent=linked?member===true?'Connected':member===false?'Join server':'Retrying':'Offline';const avatar=$('#profile-avatar');avatar.replaceChildren();if(user?.avatar&&/^https:\/\/cdn\.discordapp\.com\//.test(user.avatar)){const img=document.createElement('img');img.src=user.avatar;img.alt='Discord avatar';avatar.append(img)}else avatar.textContent='◉';const gate=$('#gate'),connect=$('#connect'),check=$('#checkMembership');if(linked&&member===true){gate.classList.add('hidden')}else{gate.classList.remove('hidden');if(linked){$('#gate-title').textContent=member===false?'Join the Nexa Verse server':'Discord is still linked';$('#gate-message').textContent=member===false?'Your Discord account is saved. Join the Nexa Verse Discord server, then check membership to unlock the launcher.':'Your Discord account is saved. Discord could not verify server membership right now. Retry the check; you do not need to link again.';connect.classList.add('hidden');check.classList.remove('hidden')}else{$('#gate-title').textContent='Link your Discord';$('#gate-message').textContent='Link your Discord account and join the Nexa Verse server. Both are required to access the launcher.';connect.classList.remove('hidden');check.classList.add('hidden')}}}
async function refresh(force=false){if(statusRefresh){await statusRefresh;if(!force)return;return refresh(true)}statusRefresh=(async()=>{const previouslyVerified=linked&&member===true;try{const response=await fetch(`/api/status${force?'?force=1':''}`,{cache:'no-store'}),s=await response.json();linked=s.linked===true;if(!linked){member=null;user=null;localStorage.removeItem('nv_verified_discord_user')}else{user=s.user||user;if(s.member===true){member=true;if(user?.id)localStorage.setItem('nv_verified_discord_user',user.id)}else if(s.member===false){member=false;localStorage.removeItem('nv_verified_discord_user')}else if(previouslyVerified||(user?.id&&localStorage.getItem('nv_verified_discord_user')===user.id))member=true;else member=null}if(!s.configured)$('#auth-note').textContent='OAuth setup required • See README.md to configure Discord';update()}catch{if(linked)update()}})();try{await statusRefresh}finally{statusRefresh=null}}
$('#connect').onclick=async()=>{try{const r=await fetch('/api/auth/start',{method:'POST'}),j=await r.json();if(!r.ok||!j.url)return toast(j.error||'Could not start Discord linking.');if(window.launcher)await window.launcher.openExternal(j.url);else location.href=j.url}catch{toast('Could not start Discord linking.')}};$('#checkMembership').onclick=async()=>{const b=$('#checkMembership');b.disabled=true;b.textContent='Checking…';await refresh(true);b.disabled=false;b.textContent='Check membership';if(member===true)toast('Nexa Verse membership verified');else if(member===false)toast('Join the Nexa Verse Discord server first');else toast('Membership check unavailable; your Discord stays linked')};$('#dismiss').onclick=()=>toast(linked?'Your Discord link is saved.':'Link Discord and join the server to unlock Play.');
$('#accountBtn').onclick=async()=>{if(!linked){$('#connect').click();return}await fetch('/auth/logout',{method:'POST'});linked=false;member=null;user=null;localStorage.removeItem('nv_verified_discord_user');update();toast('Discord disconnected')};
const discordActivityButton=$('#discordActivityBtn');
let discordActivityEnabled=localStorage.getItem('nv_discord_activity')!=='false';
function renderDiscordActivity(){if(!discordActivityButton)return;discordActivityButton.textContent=discordActivityEnabled?'Turn off':'Turn on';$('#discordActivityInfo').textContent=discordActivityEnabled?'Enabled · Shows Nexa Verse Launcher in Discord while the Discord desktop app is open.':'Disabled · Your Discord profile will not show launcher activity.'}
window.launcher?.setDiscordActivity(discordActivityEnabled);
renderDiscordActivity();
discordActivityButton?.addEventListener('click',async()=>{discordActivityEnabled=!discordActivityEnabled;localStorage.setItem('nv_discord_activity',String(discordActivityEnabled));const result=await window.launcher?.setDiscordActivity(discordActivityEnabled);renderDiscordActivity();toast(discordActivityEnabled?(result?.ok?'Discord activity enabled':'Discord activity enabled; open Discord desktop to display it'):'Discord activity disabled')});
play.onclick=async()=>{if(!linked)return;const j=await(await fetch('/api/play')).json();toast(j.message||j.error)};
async function chooseGameFolder(){if(!window.launcher){toast('Use the desktop launcher to link your PC game folder.');return}const picked=await window.launcher.pickFolder();if(picked){folder=picked;localStorage.setItem('nv_game_folder',folder);update();toast('GTA VI folder linked')}}
$('#folderBtn').onclick=chooseGameFolder;$('#playFolderBtn').onclick=chooseGameFolder;
const nameInput=$('#playerName');nameInput.value=localStorage.getItem('nv_player_name')||'';
$('#saveName').onclick=()=>{const v=nameInput.value.trim();if(!v)return toast('Enter a player name first.');localStorage.setItem('nv_player_name',v);toast(`Player name saved: ${v}`)};
$('#updateBtn').onclick=async()=>{if(!window.launcher)return toast('Automatic updates are available in the installed launcher.');const r=await window.launcher.checkUpdates();$('#updateInfo').textContent=r.detail||r.status};
window.launcher?.onUpdateStatus(s=>{$('#updateInfo').textContent=s.detail;if(s.status==='ready'){const b=$('#updateBtn');b.textContent='Restart to update';b.onclick=()=>window.launcher.installUpdate()}if(s.status==='current')toast(s.detail)});
document.querySelectorAll('.nav').forEach(b=>b.onclick=()=>{document.querySelectorAll('.nav').forEach(n=>n.classList.remove('active'));document.querySelectorAll('.page').forEach(p=>p.classList.remove('active-page'));b.classList.add('active');$('#'+b.dataset.page).classList.add('active-page')});
document.querySelectorAll('.window-controls button').forEach((b,i)=>b.onclick=()=>window.launcher?.windowAction(['minimize','maximize','close'][i]));
async function refreshLauncherPresence(){const badge=$('#connectedCount');if(!badge)return;if(!linked||member!==true){badge.textContent='0';badge.title='Link Discord and verify Nexa Verse membership to be counted';return}try{const r=await fetch('/api/presence',{method:'POST',cache:'no-store'}),data=await r.json();badge.textContent=String(Number.isFinite(data.connected)?data.connected:0);badge.title=data.scope==='network'?'Players with active Nexa Verse launcher sessions across all devices':'Active sessions on this launcher copy; shared counting service is not configured'}catch{badge.textContent='—';badge.title='Launcher presence service is unavailable'}}
refresh();setInterval(refresh,15000);refreshLauncherPresence();setInterval(refreshLauncherPresence,20000);
function refreshController(){const pads=Array.from(navigator.getGamepads?.()||[]).filter(p=>p&&p.connected);const panel=$('#controller-name'),status=$('#controller-status'),icon=$('#controller-icon-image');if(!pads.length){panel.textContent='No controller detected';status.textContent='Use mouse and keyboard or launch DS4Windows for PlayStation pads';icon.src='/controller-mouse.webp';icon.alt='Mouse and keyboard';return}const pad=pads[0],id=pad.id||'Gamepad',isScuf=/(scuf|\bdgm20\b|usb[\s_-]*microphone)/i.test(id),isPs5=/(dualsense|playstation 5|ps5|vendor:\s*054c\s+product:\s*(0ce6|0df2))/i.test(id),isPs4=/(dualshock|playstation|sony|wireless controller|vendor:\s*054c)/i.test(id),isXbox=/(xbox|microsoft|vendor:\s*045e)/i.test(id);panel.textContent=isScuf?'SCUF Controller':id.split('(Vendor:')[0].trim().slice(0,42)||'Game controller';status.textContent=`Connected · Player ${pad.index+1}${pads.length>1?` · ${pads.length} controllers`:''}`;if(isScuf){icon.src='/controller-scuf.png';icon.alt='SCUF controller'}else if(isPs5){icon.src='/controller-ps5.png';icon.alt='PlayStation 5 DualSense controller'}else if(isPs4){icon.src='/controller-ps4.png';icon.alt='PlayStation 4 DualShock controller'}else if(isXbox){icon.src='/controller-xbox.png';icon.alt='Xbox controller'}else{icon.src='/controller-generic.svg';icon.alt='Game controller'}}
window.addEventListener('gamepadconnected',refreshController);window.addEventListener('gamepaddisconnected',refreshController);setInterval(refreshController,1200);refreshController();

$('#ds4WindowsBtn')?.addEventListener('click',async()=>{if(!window.launcher?.launchDS4Windows)return toast('DS4Windows launching is available in the Windows app.');const result=await window.launcher.launchDS4Windows();if(result?.canceled)return;toast(result?.ok?'DS4Windows opened. Connect your controller, then check the controller card.':result?.error||'Could not open DS4Windows.')});

function applySocialState(next){
  if(next?.type==='friends')next={status:'ready',friends:next.friends||[]};
  else if(next?.type==='status')next={status:next.status,friends:socialState.friends};
  else if(next?.type==='error')next={status:'error',message:next.message,friends:socialState.friends};
  socialState={...socialState,...(next||{})};
  const panel=$('#socialPanel'),cards=$('#socialCards'),button=$('#socialConnect');
  if(!panel||!cards||!button)return;
  const ready=socialState.status==='ready',friends=Array.isArray(socialState.friends)?socialState.friends:[];
  panel.classList.remove('hidden');panel.classList.toggle('social-ready',ready);
  cards.replaceChildren();
  if(ready&&friends.length===0){$('#socialTitle').textContent='No friends to show yet';$('#socialMessage').textContent='Your Discord account is connected. Friends will appear here when Discord shares their status with this app.';button.textContent='Refresh friends'}
  else if(ready){$('#socialTitle').textContent='Discord friends connected';$('#socialMessage').textContent='Your list is up to date.';button.textContent='Refresh friends'}
  else if(socialState.status==='authorizing'){$('#socialTitle').textContent='Waiting for Discord';$('#socialMessage').textContent='Approve Nexa Verse Social Features in the Discord window to load your friends.';button.textContent='Waiting for approval…'}
  else if(socialState.status==='connecting'){$('#socialTitle').textContent='Connecting to Discord';$('#socialMessage').textContent='The Discord Social SDK is connecting securely.';button.textContent='Connecting…'}
  else if(socialState.status==='error'){$('#socialTitle').textContent='Discord Social SDK needs attention';$('#socialMessage').textContent=socialState.message||'Could not connect to Discord Social Features.';button.textContent='Try again'}
  else{$('#socialTitle').textContent='Connect Discord friends';$('#socialMessage').textContent='Authorize Discord Social Features to load your real friends and their activity in Nexa Verse.';button.textContent='Connect Discord friends'}
  button.disabled=socialState.status==='authorizing'||socialState.status==='connecting';
  for(const friend of friends){
    const card=document.createElement('article');card.className='social-friend';
    const avatar=document.createElement('div');avatar.className='social-avatar';
    if(friend.avatar&&/^https:\/\/cdn\.discordapp\.com\//.test(friend.avatar)){const image=document.createElement('img');image.src=friend.avatar;image.alt='';avatar.append(image)}else avatar.textContent=(friend.name||'?').slice(0,1).toUpperCase();
    const info=document.createElement('div');info.className='social-friend-info';
    const name=document.createElement('b');name.textContent=friend.name||friend.username||'Discord friend';
    const handle=document.createElement('small');handle.textContent=friend.username?`@${friend.username}`:'Discord friend';
    const activity=document.createElement('span');activity.className='social-activity';activity.textContent=[friend.activity,friend.details,friend.state].filter(Boolean).join(' · ')||'No current activity';
    info.append(name,handle,activity);
    const state=document.createElement('span');state.className='social-presence';state.dataset.status=(friend.status||'offline').toLowerCase().replaceAll(' ','-');state.textContent=friend.status||'Offline';
    card.append(avatar,info,state);cards.append(card);
  }
}
$('#socialConnect').onclick=async()=>{
  if(!linked||member!==true){toast('Link Discord and join the Nexa Verse server first.');return}
  if(socialState.status==='ready'){
    await window.launcher?.refreshSocialFriends();
    return;
  }
  const result=await window.launcher?.connectSocial();
  if(!result?.ok)applySocialState({status:'error',message:result?.error||'The Discord Social SDK could not start.'});
};
window.launcher?.onSocialEvent(applySocialState);
window.launcher?.getSocialState().then(applySocialState).catch(()=>{});

// Play the user-provided tracks through YouTube's visible embedded player.
const soundtrack=[{id:'aonTwBM1AZM',name:'GTA 6 - Official Main Theme Music'},{id:'QAwX1Tuv5Fw',name:'But I Think It’s a Dream — Captain & Tennille'}];
const musicPanel=$('#musicPlayerPanel'),musicToggle=$('#musicToggle'),musicClose=$('#musicClose'),musicStatus=$('#musicStatus'),musicVolume=$('#musicVolume'),musicVolumeValue=$('#musicVolumeValue'),musicError=$('#musicError');
const currentTrackName=$('#currentTrackName'),dockTrackName=$('#dockTrackName');
let ytPlayer=null,ytApiLoading=false,ytPlayerReady=false,currentTrackIndex=0,skipPending=false;
const savedVolumeRaw=localStorage.getItem('nv_music_volume'),savedVolume=savedVolumeRaw===null?35:Number(savedVolumeRaw);
if(Number.isFinite(savedVolume)&&savedVolume>=0&&savedVolume<=100){musicVolume.value=String(savedVolume);musicVolumeValue.textContent=`${savedVolume}%`}
function showTrack(){const name=soundtrack[currentTrackIndex].name;currentTrackName.textContent=name;dockTrackName.textContent=name;currentTrackName.title=name;dockTrackName.title=name}
function setMusicOpen(open){musicPanel.classList.toggle('hidden',!open);musicClose.classList.toggle('hidden',!open);musicToggle.textContent=open?'Hide player':'Open player';musicToggle.setAttribute('aria-label',open?'Hide music player':'Open music player');if(open&&!ytPlayer&&!ytApiLoading)loadYouTubePlayer();if(!open&&ytPlayer&&ytPlayer.getPlayerState?.()===1){ytPlayer.pauseVideo();musicStatus.textContent='Paused';}}
function loadYouTubePlayer(){ytApiLoading=true;musicStatus.textContent='Loading YouTube player…';const api=document.createElement('script');api.src='https://www.youtube.com/iframe_api';api.onerror=()=>{ytApiLoading=false;musicStatus.textContent='Could not load player';musicError.textContent='YouTube is unavailable. Check your connection and reopen the player.';musicError.classList.remove('hidden')};document.head.append(api);window.onYouTubeIframeAPIReady=()=>{ytApiLoading=false;if(!document.getElementById('youtubePlayer'))return;ytPlayer=new YT.Player('youtubePlayer',{width:'480',height:'270',videoId:soundtrack[currentTrackIndex].id,playerVars:{playsinline:1,controls:1,enablejsapi:1,origin:location.origin,rel:0},events:{onReady:event=>{ytPlayerReady=true;event.target.setVolume(Number(musicVolume.value));musicStatus.textContent='Ready · press play in the YouTube player';if(skipPending){skipPending=false;event.target.loadVideoById(soundtrack[currentTrackIndex].id);}},onStateChange:event=>{if(event.data===1){const id=event.target.getVideoData()?.video_id,index=soundtrack.findIndex(track=>track.id===id);if(index>=0){currentTrackIndex=index;showTrack()}musicStatus.textContent='Now playing'}else if(event.data===2)musicStatus.textContent='Paused';else if(event.data===0){if(currentTrackIndex<soundtrack.length-1){currentTrackIndex++;showTrack();event.target.loadVideoById(soundtrack[currentTrackIndex].id)}else musicStatus.textContent='Playlist ended'}},onError:()=>{musicStatus.textContent='Track unavailable';musicError.textContent='This video cannot play here. Try opening it on YouTube.';musicError.classList.remove('hidden')}}})}}
musicToggle.onclick=()=>setMusicOpen(musicPanel.classList.contains('hidden'));
musicClose.onclick=()=>setMusicOpen(false);
$('#musicSkip').onclick=()=>{currentTrackIndex=(currentTrackIndex+1)%soundtrack.length;showTrack();musicError.classList.add('hidden');setMusicOpen(true);if(ytPlayerReady)ytPlayer.loadVideoById(soundtrack[currentTrackIndex].id);else skipPending=true};
musicVolume.oninput=()=>{const value=Number(musicVolume.value);musicVolumeValue.textContent=`${value}%`;localStorage.setItem('nv_music_volume',String(value));if(ytPlayerReady)ytPlayer.setVolume(value)};
showTrack();

