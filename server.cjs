const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const crypto = require('node:crypto');
const { URL } = require('node:url');
const ROOT = __dirname;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID || '1568756074692083925';
const GUILD_ID = process.env.DISCORD_GUILD_ID || '1563364055543185470';
let ROLE_NAMES={};
try { ROLE_NAMES=JSON.parse(process.env.DISCORD_ROLE_NAMES_JSON||'{}'); } catch {}
let ROLE_METADATA={};
try { ROLE_METADATA=JSON.parse(process.env.DISCORD_ROLE_METADATA_JSON||'{}'); } catch {}
const ROLE_METADATA_URL=process.env.DISCORD_ROLE_METADATA_URL||'';
let PRESENCE_SERVICE_URL=process.env.NV_PRESENCE_SERVICE_URL||'';
if(!PRESENCE_SERVICE_URL){try{PRESENCE_SERVICE_URL=JSON.parse(fs.readFileSync(path.join(__dirname,'presence-service.json'),'utf8')).url||''}catch{}}
let roleMetadataFetchedAt=0,roleMetadataLoad=null;
const sessions = new Map(), pending = new Map(), activeLaunchers = new Map(), tokenRefreshes = new WeakMap();
const mime = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.avif':'image/avif', '.webp':'image/webp', '.mp3':'audio/mpeg' };
function cookies(req) { return Object.fromEntries((req.headers.cookie || '').split(';').map(x => x.trim().split('=').map(decodeURIComponent)).filter(x => x.length === 2)); }
function send(res, code, body, type='application/json; charset=utf-8', headers={}) { res.writeHead(code, { 'Content-Type': type, 'Cache-Control':'no-store', ...headers }); res.end(body); }
function page(message, invite) {
  const safeMessage = String(message).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const safeInvite = invite && /^https:\/\/(discord\.gg|discord\.com)\//i.test(invite) ? `<a href="${invite}" target="_blank" rel="noopener">Join Nexa Verse</a>` : '';
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>body{background:#090c18;color:#edf0fa;font:16px system-ui;display:grid;place-items:center;min-height:90vh}.card{text-align:center;max-width:480px;padding:36px;border:1px solid #ffffff28;border-radius:18px;background:#15182a}a{display:inline-block;margin-top:18px;padding:12px 18px;border-radius:9px;background:#5865f2;color:white;text-decoration:none;font-weight:700}.hint{color:#abb1c6;font-size:13px;overflow-wrap:anywhere}</style><main class="card"><h2>Nexa Verse access</h2><p>${safeMessage}</p>${safeInvite}<br><a href="/">Return to launcher</a></main>`;
}
function verifier() { return crypto.randomBytes(32).toString('base64url'); }
function challenge(value) { return crypto.createHash('sha256').update(value).digest('base64url'); }
async function refreshIfNeeded(session, persist, force=false) {
  const existing=tokenRefreshes.get(session);
  if(existing)return existing;
  if (!force && Date.now() < session.expiresAt - 60000) return;
  const refresh=(async()=>{
    if (!session.refreshToken) throw new Error('Discord session expired');
    const form = new URLSearchParams({ client_id:CLIENT_ID, grant_type:'refresh_token', refresh_token:session.refreshToken });
    const response = await fetch('https://discord.com/api/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:form,signal:AbortSignal.timeout(10000)});
    const token = await response.json();
    if (!response.ok || !token.access_token) {
      const error = new Error(token.error_description || token.error || 'Discord refresh failed');
      error.reauthRequired = ['invalid_grant','invalid_client'].includes(token.error);
      throw error;
    }
    session.accessToken=token.access_token;session.refreshToken=token.refresh_token||session.refreshToken;session.expiresAt=Date.now()+(token.expires_in||604800)*1000;session.checkedAt=0;
    persist?.();
  })();
  tokenRefreshes.set(session,refresh);
  try{await refresh}finally{tokenRefreshes.delete(session)}
}
async function memberCheck(session, persist, force=false) {
  await refreshIfNeeded(session,persist);
  if (!force && Date.now()-session.checkedAt < 30000) return session.member;
  let response=await fetch(`https://discord.com/api/v10/users/@me/guilds/${GUILD_ID}/member`,{headers:{Authorization:`Bearer ${session.accessToken}`},signal:AbortSignal.timeout(10000)});
  if(response.status===401){await refreshIfNeeded(session,persist,true);response=await fetch(`https://discord.com/api/v10/users/@me/guilds/${GUILD_ID}/member`,{headers:{Authorization:`Bearer ${session.accessToken}`},signal:AbortSignal.timeout(10000)});}
  session.checkedAt=Date.now();
  if(response.ok){const details=await response.json();session.roleIds=Array.isArray(details.roles)?details.roles:[];session.member=true;persist?.();return true;}
  if(response.status===404)return session.member=false;
  throw new Error(`Membership check failed (${response.status})`);
}
function normalizeRoleMetadata(data){
  const entries=Array.isArray(data)?data:Array.isArray(data?.roles)?data.roles:data&&typeof data==='object'?Object.entries(data).map(([id,role])=>({id,...role})):[];
  const normalized={};
  for(const role of entries){
    if(!role||!/^\d{15,22}$/.test(String(role.id||''))||typeof role.name!=='string')continue;
    const raw=role.color??role.colors?.primary_color;
    const color=typeof raw==='number'&&raw>0?`#${raw.toString(16).padStart(6,'0').slice(-6)}`:typeof raw==='string'&&/^#[0-9a-f]{6}$/i.test(raw)?raw:null;
    normalized[role.id]={name:role.name.slice(0,100),color};
  }
  return normalized;
}
async function refreshRoleMetadata(){
  if(!ROLE_METADATA_URL||Date.now()-roleMetadataFetchedAt<10*60*1000)return;
  if(roleMetadataLoad)return roleMetadataLoad;
  roleMetadataLoad=(async()=>{
    try{
      const endpoint=new URL(ROLE_METADATA_URL);
      if(endpoint.protocol!=='https:')throw new Error('Role metadata URL must use HTTPS');
      const response=await fetch(endpoint,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(5000)});
      if(!response.ok)throw new Error(`Role metadata request failed (${response.status})`);
      const data=await response.json(),next=normalizeRoleMetadata(data);
      if(Object.keys(next).length){ROLE_METADATA={...ROLE_METADATA,...next};roleMetadataFetchedAt=Date.now();}
    }catch(error){console.warn(`Nexa Verse role metadata unavailable: ${error.message}`);roleMetadataFetchedAt=Date.now()-9*60*1000;}
    finally{roleMetadataLoad=null;}
  })();
  return roleMetadataLoad;
}
function roleDetails(session){return (session.roleIds||[]).map(id=>{const meta=ROLE_METADATA[id]||{};const mappedName=meta.name||ROLE_NAMES[id];const name=mappedName||(id===GUILD_ID?'@everyone':'');const color=typeof meta.color==='string'&&/^#[0-9a-f]{6}$/i.test(meta.color)?meta.color:null;return {id,name,color,metadataAvailable:Boolean(mappedName||id===GUILD_ID)};});}
function startServer(port=4317, storage={}) {
  const launcherHeartbeatId=crypto.randomUUID();
  let sharedPresenceSocket=null,sharedPresenceCount=null,sharedPresenceHeartbeat=null,sharedPresenceRetry=null,presenceEligible=false;
  const disconnectSharedPresence=()=>{
    presenceEligible=false;
    clearInterval(sharedPresenceHeartbeat);sharedPresenceHeartbeat=null;
    clearTimeout(sharedPresenceRetry);sharedPresenceRetry=null;
    sharedPresenceCount=null;
    const socket=sharedPresenceSocket;sharedPresenceSocket=null;
    try{socket?.close()}catch{}
  };
  const connectSharedPresence=()=>{
    if(!presenceEligible||!PRESENCE_SERVICE_URL||sharedPresenceSocket||typeof WebSocket==='undefined')return;
    try{
      const endpoint=new URL('/api/connect',PRESENCE_SERVICE_URL);
      if(endpoint.protocol!=='https:')throw new Error('Presence service must use HTTPS');
      endpoint.protocol='wss:';endpoint.searchParams.set('id',launcherHeartbeatId);
      const socket=new WebSocket(endpoint);sharedPresenceSocket=socket;
      socket.addEventListener('open',()=>{
        const heartbeat=()=>{if(socket.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type:'heartbeat'}))};
        heartbeat();sharedPresenceHeartbeat=setInterval(heartbeat,60_000);
      });
      socket.addEventListener('message',event=>{try{const packet=JSON.parse(String(event.data));if(Number.isSafeInteger(packet.connected)&&packet.connected>=0)sharedPresenceCount=packet.connected}catch{}});
      socket.addEventListener('close',()=>{
        if(sharedPresenceSocket===socket)sharedPresenceSocket=null;
        clearInterval(sharedPresenceHeartbeat);sharedPresenceHeartbeat=null;sharedPresenceCount=null;
        if(presenceEligible&&PRESENCE_SERVICE_URL&&!sharedPresenceRetry)sharedPresenceRetry=setTimeout(()=>{sharedPresenceRetry=null;connectSharedPresence()},15_000);
      });
      socket.addEventListener('error',()=>{try{socket.close()}catch{}});
    }catch(error){console.warn(`Shared Nexa Verse presence could not connect: ${error.message}`)}
  };
  const restored=storage.load?.();
  if(restored?.sid&&restored?.session)sessions.set(restored.sid,{...restored.session,checkedAt:0});
  const persist=(sid,session)=>storage.save?.({sid,session});
  const clearStored=()=>storage.clear?.();
  const server=http.createServer(async(req,res)=>{
    const url=new URL(req.url,`http://${req.headers.host||'127.0.0.1'}`);
    try {
      if(url.pathname==='/api/status'){
        const sid=cookies(req).nv_session,session=sessions.get(sid);
        if(!session)return send(res,200,JSON.stringify({configured:true,linked:false,user:null}));
        await refreshRoleMetadata();
        let member;try{member=await memberCheck(session,()=>persist(sid,session),url.searchParams.get('force')==='1');}catch(error){
          if(error.reauthRequired){sessions.delete(sid);clearStored();return send(res,200,JSON.stringify({configured:true,linked:false,user:null,reauth:true}),'application/json; charset=utf-8',{'Set-Cookie':'nv_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'});}
          return send(res,200,JSON.stringify({configured:true,linked:true,user:session.user,member:null,checking:true}));
        }
        return send(res,200,JSON.stringify({configured:true,linked:true,user:session.user,member,roles:roleDetails(session)}));
      }
      if(url.pathname==='/api/presence'&&req.method==='POST'){
        const sid=cookies(req).nv_session,session=sessions.get(sid);
        if(!session){disconnectSharedPresence();return send(res,200,JSON.stringify({connected:0}));}
        let member;try{member=await memberCheck(session,()=>persist(sid,session),false)}catch{return send(res,200,JSON.stringify({connected:0}));}
        if(!member){activeLaunchers.delete(sid);disconnectSharedPresence();return send(res,200,JSON.stringify({connected:0}));}
        activeLaunchers.set(sid,Date.now());
        for(const [key,seen] of activeLaunchers)if(Date.now()-seen>45000)activeLaunchers.delete(key);
        presenceEligible=true;
        connectSharedPresence();
        if(Number.isSafeInteger(sharedPresenceCount))return send(res,200,JSON.stringify({connected:sharedPresenceCount,scope:'network'}));
        return send(res,200,JSON.stringify({connected:activeLaunchers.size,scope:'this launcher instance'}));
      }
      if(url.pathname==='/api/auth/start'&&req.method==='POST'){
        if(req.headers.origin&&req.headers.origin!==`http://127.0.0.1:${port}`)return send(res,403,JSON.stringify({error:'Origin rejected.'}));
        let sid=cookies(req).nv_session;const headers={};if(!sid){sid=crypto.randomBytes(32).toString('hex');headers['Set-Cookie']=`nv_session=${sid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=31536000`;}
        const state=crypto.randomBytes(24).toString('hex'),codeVerifier=verifier();pending.set(state,{created:Date.now(),codeVerifier,sid});
        const redirect=`http://127.0.0.1:${port}/auth/callback`,authorize=new URL('https://discord.com/oauth2/authorize');
        authorize.search=new URLSearchParams({client_id:CLIENT_ID,response_type:'code',redirect_uri:redirect,scope:'identify guilds.members.read',state,code_challenge:challenge(codeVerifier),code_challenge_method:'S256'}).toString();
        return send(res,200,JSON.stringify({url:authorize.toString()}),'application/json; charset=utf-8',headers);
      }
      if(url.pathname==='/auth/callback'){
        const{code,state,error,error_description:errorDescription}=Object.fromEntries(url.searchParams),record=pending.get(state);pending.delete(state);
        if(error)return send(res,400,page(`Discord sign-in was not completed: ${errorDescription||error}. Return to the launcher and try again.`),'text/html; charset=utf-8');
        if(!code||!record||Date.now()-record.created>300000)return send(res,400,page('That sign-in expired. Return to the launcher and try again.'),'text/html; charset=utf-8');
        const redirect=`http://127.0.0.1:${port}/auth/callback`,form=new URLSearchParams({client_id:CLIENT_ID,grant_type:'authorization_code',code,redirect_uri:redirect,code_verifier:record.codeVerifier});
        const tokenResponse=await fetch('https://discord.com/api/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:form}),token=await tokenResponse.json();
        if(!token.access_token||!token.refresh_token){const detail=token.error_description||token.error||`Discord returned HTTP ${tokenResponse.status}`;console.warn(`Discord OAuth token exchange failed (${tokenResponse.status}): ${detail}`);return send(res,502,page(`Discord could not finish linking (${detail}). In the Discord Developer Portal, add this exact OAuth2 redirect URL: ${redirect}`),'text/html; charset=utf-8');}
        const profileResponse=await fetch('https://discord.com/api/v10/users/@me',{headers:{Authorization:`Bearer ${token.access_token}`}}),me=await profileResponse.json();
        if(!me.id)return send(res,502,page('Could not read your Discord profile. Try again.'),'text/html; charset=utf-8');
        const session={accessToken:token.access_token,refreshToken:token.refresh_token,expiresAt:Date.now()+(token.expires_in||604800)*1000,user:{id:me.id,username:me.username,displayName:me.global_name||me.username,avatar:me.avatar?`https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png?size=96`:null},checkedAt:0,member:false,roleIds:[]};
        const sid=record.sid;sessions.set(sid,session);persist(sid,session);
        res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Set-Cookie':`nv_session=${sid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=31536000`});
        let member;try{member=await memberCheck(session,()=>persist(sid,session),true)}catch{return res.end(page('Discord is linked and saved. Membership could not be checked right now; return to the launcher and retry the check.'));}
        if(!member)return res.end(page('Discord is linked and saved. Join the Nexa Verse Discord server, then use Check membership in the launcher.',process.env.DISCORD_INVITE_URL));
        return res.end(page('Discord linked and Nexa Verse membership verified. You can return to the launcher.'));
      }
      if(url.pathname==='/auth/logout'&&req.method==='POST'){
        const sid=cookies(req).nv_session,session=sessions.get(sid);sessions.delete(sid);activeLaunchers.delete(sid);clearStored();
        disconnectSharedPresence();
        if(session?.refreshToken){const form=new URLSearchParams({client_id:CLIENT_ID,token:session.refreshToken,token_type_hint:'refresh_token'});fetch('https://discord.com/api/oauth2/token/revoke',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:form}).catch(()=>{});}
        return send(res,200,'{}','application/json; charset=utf-8',{'Set-Cookie':'nv_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'});
      }
      if(url.pathname==='/api/play'){
        const sid=cookies(req).nv_session,session=sessions.get(sid);if(!session)return send(res,403,JSON.stringify({error:'Link Discord and join the Nexa Verse server before playing.'}));
        let member;try{member=await memberCheck(session,()=>persist(sid,session),true)}catch{return send(res,503,JSON.stringify({error:'Could not verify server membership. Try again shortly.'}));}
        if(!member)return send(res,403,JSON.stringify({error:'Join the Nexa Verse server to access the launcher.'}));
        return send(res,200,JSON.stringify({ok:true,message:'Discord linked and Nexa Verse membership verified. Configure the game launch command to start playing.'}));
      }
      const rel=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname.slice(1)),file=path.resolve(ROOT,rel);
      if(!file.startsWith(ROOT+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return send(res,404,'Not found','text/plain');
      res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
    } catch { return send(res,503,JSON.stringify({error:'Discord membership verification is temporarily unavailable.'})); }
  });
  return new Promise(resolve=>server.listen(port,'127.0.0.1',()=>resolve(server)));
}
if(require.main===module)startServer(Number(process.env.PORT)||4317).then(()=>console.log('Nexa Verse at http://127.0.0.1:4317'));
module.exports={startServer};

