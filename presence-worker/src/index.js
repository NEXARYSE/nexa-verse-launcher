export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/live-patch/current' && request.method === 'GET') {
      const id = env.PRESENCE.idFromName('nexa-verse-live-patch-v1');
      return env.PRESENCE.get(id).fetch('https://live-patch.internal/current');
    }
    if (url.pathname === '/api/live-patch/publish') {
      if (request.method !== 'POST') return Response.json({ error: 'POST required' }, { status: 405 });
      if (typeof env.LIVE_PATCH_ADMIN_TOKEN !== 'string' || env.LIVE_PATCH_ADMIN_TOKEN.length < 32 || typeof env.LIVE_PATCH_PRIVATE_JWK !== 'string') return Response.json({ error: 'Live patch publishing is not configured' }, { status: 503 });
      if (!await constantTimeTokenMatch(request.headers.get('Authorization') || '', `Bearer ${env.LIVE_PATCH_ADMIN_TOKEN}`)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
      let payload;
      try { payload = await request.json(); } catch { return Response.json({ error: 'Invalid request' }, { status: 400 }); }
      const allowed = ['app.js', 'index.html', 'social.css', 'style.css', 'ui-adjustments.js'];
      if (!Number.isSafeInteger(payload.version) || payload.version < 1 || !payload.files || typeof payload.files !== 'object' || Array.isArray(payload.files) || Object.keys(payload.files).some(name => !allowed.includes(name)) || allowed.some(name => typeof payload.files[name] !== 'string')) return Response.json({ error: 'A patch must include the complete UI file set' }, { status: 400 });
      const totalSize = allowed.reduce((sum, name) => sum + new TextEncoder().encode(payload.files[name]).length, 0);
      if (totalSize > 600_000) return Response.json({ error: 'UI patch is too large' }, { status: 413 });
      const files = [];
      for (const name of allowed) {
        const content = payload.files[name];
        const hash = await sha256Hex(content);
        files.push({ path: name, sha256: hash, content });
      }
      const manifest = { version: payload.version, files };
      const signingKey = await crypto.subtle.importKey('jwk', JSON.parse(env.LIVE_PATCH_PRIVATE_JWK), { name: 'Ed25519' }, false, ['sign']);
      const signature = await crypto.subtle.sign('Ed25519', signingKey, new TextEncoder().encode(JSON.stringify(manifest)));
      const signedPatch = { manifest, signature: bytesToBase64(new Uint8Array(signature)) };
      const id = env.PRESENCE.idFromName('nexa-verse-live-patch-v1');
      const response = await env.PRESENCE.get(id).fetch('https://live-patch.internal/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(signedPatch) });
      return response;
    }
    if (url.pathname === '/api/leaderboard/admin') {
      if (request.method !== 'POST') return Response.json({ error: 'POST required' }, { status: 405 });
      if (typeof env.LEADERBOARD_ADMIN_TOKEN !== 'string' || env.LEADERBOARD_ADMIN_TOKEN.length < 32) return Response.json({ error: 'Leaderboard admin is not configured' }, { status: 503 });
      const supplied = request.headers.get('Authorization') || '';
      if (!await constantTimeTokenMatch(supplied, `Bearer ${env.LEADERBOARD_ADMIN_TOKEN}`)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
      let payload;
      try { payload = await request.json(); } catch { return Response.json({ error: 'Invalid request' }, { status: 400 }); }
      if (payload.action === 'reset') {
        const id = env.PRESENCE.idFromName('nexa-verse-global-leaderboard-v1');
        return env.PRESENCE.get(id).fetch('https://leaderboard.internal/leaderboard', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'adminReset' }),
        });
      }
      if (!Array.isArray(payload.players) || payload.players.length > 100) return Response.json({ error: 'Provide up to 100 player records' }, { status: 400 });
      const players = [];
      const seen = new Set();
      for (const item of payload.players) {
        const username = String(item?.username || '').replace(/^@/, '').trim();
        const key = username.toLowerCase();
        const playtimeSeconds = Number(item?.playtimeSeconds);
        const trophiesEarned = Number(item?.trophiesEarned);
        const completionPercent = Number(item?.completionPercent);
        if (!/^[a-zA-Z0-9_.]{1,32}$/.test(username) || seen.has(key) || !Number.isSafeInteger(playtimeSeconds) || playtimeSeconds < 0 || playtimeSeconds > 315360000 || !Number.isSafeInteger(trophiesEarned) || trophiesEarned < 0 || trophiesEarned > 55 || !Number.isFinite(completionPercent) || completionPercent < 0 || completionPercent > 100) return Response.json({ error: 'Invalid player stats' }, { status: 400 });
        seen.add(key);
        players.push({ username, playtimeSeconds, trophiesEarned, completionPercent: Math.floor(completionPercent) });
      }
      const id = env.PRESENCE.idFromName('nexa-verse-global-leaderboard-v1');
      return env.PRESENCE.get(id).fetch('https://leaderboard.internal/leaderboard', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'adminUpsert', players }),
      });
    }
    if (url.pathname === '/api/profile') {
      if (request.method !== 'POST') return Response.json({ error: 'POST required' }, { status: 405 });
      let payload;
      try { payload = await request.json(); } catch { return Response.json({ error: 'Invalid request' }, { status: 400 }); }
      if (typeof payload.accessToken !== 'string' || payload.accessToken.length < 10 || payload.accessToken.length > 4096) return Response.json({ error: 'Discord authorization is required' }, { status: 401 });
      const profileResponse = await fetch('https://discord.com/api/v10/users/@me', { headers: { Authorization: `Bearer ${payload.accessToken}` }, signal: AbortSignal.timeout(10000) });
      if (!profileResponse.ok) return Response.json({ error: 'Discord authorization expired; relink Discord and try again' }, { status: 401 });
      const profile = await profileResponse.json();
      if (!/^\d{17,20}$/.test(profile.id || '')) return Response.json({ error: 'Could not verify the Discord account' }, { status: 401 });
      const memberResponse = await fetch(`https://discord.com/api/v10/users/@me/guilds/${GUILD_ID}/member`, { headers: { Authorization: `Bearer ${payload.accessToken}` }, signal: AbortSignal.timeout(10000) });
      if (memberResponse.status === 404) return Response.json({ error: 'Join the Nexa Verse Discord server to use profiles' }, { status: 403 });
      if (memberResponse.status === 403) return Response.json({ error: 'Refresh Discord permissions to verify Nexa Verse membership' }, { status: 403 });
      if (!memberResponse.ok) return Response.json({ error: 'Could not verify Nexa Verse membership right now' }, { status: 503 });
      if (typeof env.MODPACK_HASH_PEPPER !== 'string' || env.MODPACK_HASH_PEPPER.length < 32) return Response.json({ error: 'Profile storage is not configured' }, { status: 503 });
      if (!['save', 'get', 'heartbeat'].includes(payload.action)) return Response.json({ error: 'Unknown profile action' }, { status: 400 });
      if (payload.action === 'get' && !/^\d{17,20}$/.test(payload.targetUserId || '')) return Response.json({ error: 'Invalid profile identifier' }, { status: 400 });
      if (payload.action === 'save' && (typeof payload.aboutMe !== 'string' || payload.aboutMe.length > 500)) return Response.json({ error: 'About Me must be 500 characters or fewer' }, { status: 400 });
      const userHash = await hmacSha256Hex(env.MODPACK_HASH_PEPPER, payload.action === 'get' ? payload.targetUserId : profile.id);
      const id = env.PRESENCE.idFromName('nexa-verse-global-profiles-v1');
      const profilePayload = { action: payload.action, userHash };
      if (payload.action === 'save') profilePayload.aboutMe = payload.aboutMe.trim();
      if (payload.action === 'heartbeat') {
        profilePayload.status = ['online', 'idle', 'dnd', 'invisible'].includes(payload.status) ? payload.status : 'online';
        profilePayload.username = String(profile.username || '').slice(0, 32);
        profilePayload.displayName = String(profile.global_name || profile.username || 'Nexa Verse player').slice(0, 64);
      }
      return env.PRESENCE.get(id).fetch('https://profile.internal/profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(profilePayload) });
    }
    if (url.pathname === '/api/leaderboard') {
      if (request.method !== 'POST') return Response.json({ error: 'POST required' }, { status: 405 });
      let payload;
      try { payload = await request.json(); } catch { return Response.json({ error: 'Invalid request' }, { status: 400 }); }
      if (typeof payload.accessToken !== 'string' || payload.accessToken.length < 10 || payload.accessToken.length > 4096) return Response.json({ error: 'Discord authorization is required' }, { status: 401 });
      const profileResponse = await fetch('https://discord.com/api/v10/users/@me', { headers: { Authorization: `Bearer ${payload.accessToken}` }, signal: AbortSignal.timeout(10000) });
      if (!profileResponse.ok) return Response.json({ error: 'Discord authorization expired; relink Discord and try again' }, { status: 401 });
      const profile = await profileResponse.json();
      if (!/^\d{17,20}$/.test(profile.id || '')) return Response.json({ error: 'Could not verify the Discord account' }, { status: 401 });
      const memberResponse = await fetch(`https://discord.com/api/v10/users/@me/guilds/${GUILD_ID}/member`, { headers: { Authorization: `Bearer ${payload.accessToken}` }, signal: AbortSignal.timeout(10000) });
      if (memberResponse.status === 404) return Response.json({ error: 'Join the Nexa Verse Discord server to use the leaderboard' }, { status: 403 });
      if (memberResponse.status === 403) return Response.json({ error: 'Refresh Discord permissions to verify Nexa Verse membership' }, { status: 403 });
      if (!memberResponse.ok) return Response.json({ error: 'Could not verify Nexa Verse membership right now' }, { status: 503 });
      if (typeof env.MODPACK_HASH_PEPPER !== 'string' || env.MODPACK_HASH_PEPPER.length < 32) return Response.json({ error: 'Leaderboard storage is not configured' }, { status: 503 });
      const action = payload.action === 'list' ? 'list' : 'update';
      const stats = { playtimeSeconds: Number(payload.playtimeSeconds), trophiesEarned: Number(payload.trophiesEarned), completionPercent: Number(payload.completionPercent) };
      if (action === 'update' && (!Number.isSafeInteger(stats.playtimeSeconds) || stats.playtimeSeconds < 0 || stats.playtimeSeconds > 315360000 || !Number.isSafeInteger(stats.trophiesEarned) || stats.trophiesEarned < 0 || stats.trophiesEarned > 55 || !Number.isFinite(stats.completionPercent) || stats.completionPercent < 0 || stats.completionPercent > 100)) return Response.json({ error: 'Leaderboard stats are outside allowed ranges' }, { status: 400 });
      const userHash = await hmacSha256Hex(env.MODPACK_HASH_PEPPER, profile.id);
      const id = env.PRESENCE.idFromName('nexa-verse-global-leaderboard-v1');
      return env.PRESENCE.get(id).fetch('https://leaderboard.internal/leaderboard', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, userHash, username: String(profile.username || '').slice(0, 32), displayName: String(profile.global_name || profile.username || 'Nexa Verse player').slice(0, 64), ...stats }),
      });
    }
    if (url.pathname === '/api/modpack/status' || url.pathname === '/api/modpack/redeem') {
      if (request.method !== 'POST') return Response.json({ error: 'POST required' }, { status: 405 });
      let payload;
      try { payload = await request.json(); } catch { return Response.json({ error: 'Invalid request' }, { status: 400 }); }
      if (typeof payload.accessToken !== 'string' || payload.accessToken.length < 10 || payload.accessToken.length > 4096) {
        return Response.json({ error: 'Discord authorization is required' }, { status: 401 });
      }
      const profileResponse = await fetch('https://discord.com/api/v10/users/@me', {
        headers: { Authorization: `Bearer ${payload.accessToken}` }, signal: AbortSignal.timeout(10000),
      });
      if (!profileResponse.ok) return Response.json({ error: 'Discord authorization expired; relink Discord and try again' }, { status: 401 });
      const profile = await profileResponse.json();
      if (!/^\d{17,20}$/.test(profile.id || '')) return Response.json({ error: 'Could not verify the Discord account' }, { status: 401 });
      const memberResponse = await fetch(`https://discord.com/api/v10/users/@me/guilds/${GUILD_ID}/member`, {
        headers: { Authorization: `Bearer ${payload.accessToken}` }, signal: AbortSignal.timeout(10000),
      });
      if (memberResponse.status === 401) return Response.json({ error: 'Discord authorization expired; relink Discord and try again' }, { status: 401 });
      if (memberResponse.status === 403) return Response.json({ error: 'Refresh Discord permissions to verify Nexa Verse membership' }, { status: 403 });
      if (memberResponse.status === 404) return Response.json({ error: 'Join the Nexa Verse Discord server to use a Modpack code' }, { status: 403 });
      if (!memberResponse.ok) return Response.json({ error: 'Could not verify Nexa Verse membership right now' }, { status: 503 });
      if (typeof env.MODPACK_HASH_PEPPER !== 'string' || env.MODPACK_HASH_PEPPER.length < 32) return Response.json({ error: 'Modpack redemption is not configured yet' }, { status: 503 });
      const userHash = await hmacSha256Hex(env.MODPACK_HASH_PEPPER, profile.id);
      const action = url.pathname.endsWith('/status') ? 'status' : 'redeem';
      let codeHash;
      if (action === 'redeem') {
        if (typeof payload.code !== 'string' || !/^\d{8}$/.test(payload.code)) return Response.json({ error: 'Enter an 8 digit code' }, { status: 400 });
        if (typeof env.MODPACK_CODE_HASHES !== 'string' || !env.MODPACK_CODE_HASHES.trim()) return Response.json({ error: 'Modpack code redemption is not configured yet' }, { status: 503 });
        codeHash = await sha256Hex(payload.code);
        const allowed = new Set(String(env.MODPACK_CODE_HASHES || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean));
        if (!allowed.has(codeHash)) return Response.json({ error: 'That access code is not valid' }, { status: 400 });
      }
      const id = env.PRESENCE.idFromName('nexa-verse-modpack-redemptions-v1');
      return env.PRESENCE.get(id).fetch('https://modpack.internal/redeem', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, userHash, codeHash }),
      });
    }
    if (url.pathname !== '/api/connect') return Response.json({ error: 'Not found' }, { status: 404 });
    if (request.method !== 'GET' || request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return Response.json({ error: 'WebSocket upgrade required' }, { status: 426 });
    }
    const id = env.PRESENCE.idFromName('nexa-verse-global-active-launchers');
    return env.PRESENCE.get(id).fetch(request);
  },
};

async function sha256Hex(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

function bytesToBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function constantTimeTokenMatch(actual, expected) {
  const [a, b] = await Promise.all([sha256Bytes(actual), sha256Bytes(expected)]);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}

async function sha256Bytes(value) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}

async function hmacSha256Hex(secret, value) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

export class PresenceCounter {
  constructor(state) {
    this.state = state;
    this.state.storage.sql.exec('CREATE TABLE IF NOT EXISTS modpack_redemptions (code_hash TEXT PRIMARY KEY, user_hash TEXT NOT NULL UNIQUE)');
    this.state.storage.sql.exec('CREATE TABLE IF NOT EXISTS launcher_leaderboard (user_hash TEXT PRIMARY KEY, username TEXT NOT NULL, display_name TEXT NOT NULL, playtime_seconds INTEGER NOT NULL DEFAULT 0, trophies_earned INTEGER NOT NULL DEFAULT 0, completion_percent INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL)');
    this.state.storage.sql.exec('CREATE TABLE IF NOT EXISTS leaderboard_overrides (username TEXT PRIMARY KEY COLLATE NOCASE, display_name TEXT NOT NULL, playtime_seconds INTEGER NOT NULL, trophies_earned INTEGER NOT NULL, completion_percent INTEGER NOT NULL, updated_at INTEGER NOT NULL)');
    this.state.storage.sql.exec('CREATE TABLE IF NOT EXISTS live_patch (singleton INTEGER PRIMARY KEY CHECK (singleton = 1), version INTEGER NOT NULL, payload TEXT NOT NULL, updated_at INTEGER NOT NULL)');
    this.state.storage.sql.exec(`CREATE TABLE IF NOT EXISTS launcher_profiles (user_hash TEXT PRIMARY KEY, username TEXT NOT NULL DEFAULT '', display_name TEXT NOT NULL DEFAULT 'Nexa Verse player', about_me TEXT NOT NULL DEFAULT '', launcher_status TEXT NOT NULL DEFAULT 'offline', last_online INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL)`);
  }

  async fetch(request) {
    if (new URL(request.url).pathname === '/profile') {
      let payload;
      try { payload = await request.json(); } catch { return Response.json({ error: 'Invalid request' }, { status: 400 }); }
      if (!/^[a-f0-9]{64}$/.test(payload.userHash || '') || !['save', 'get', 'heartbeat'].includes(payload.action)) return Response.json({ error: 'Invalid profile request' }, { status: 400 });
      const sql = this.state.storage.sql;
      const now = Date.now();
      if (payload.action === 'save') {
        if (typeof payload.aboutMe !== 'string' || payload.aboutMe.length > 500) return Response.json({ error: 'About Me must be 500 characters or fewer' }, { status: 400 });
        sql.exec('INSERT INTO launcher_profiles (user_hash, about_me, last_online, updated_at) VALUES (?, ?, 0, ?) ON CONFLICT(user_hash) DO UPDATE SET about_me = excluded.about_me, updated_at = excluded.updated_at', payload.userHash, payload.aboutMe.trim(), now);
        return Response.json({ ok: true });
      }
      if (payload.action === 'heartbeat') {
        const status = ['online', 'idle', 'dnd', 'invisible'].includes(payload.status) ? payload.status : 'online';
        const username = String(payload.username || '').slice(0, 32);
        const displayName = String(payload.displayName || username || 'Nexa Verse player').slice(0, 64);
        const lastOnline = status === 'invisible' ? 0 : now;
        sql.exec('INSERT INTO launcher_profiles (user_hash, username, display_name, launcher_status, last_online, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_hash) DO UPDATE SET username = excluded.username, display_name = excluded.display_name, launcher_status = excluded.launcher_status, last_online = CASE WHEN excluded.launcher_status = \'invisible\' THEN launcher_profiles.last_online ELSE excluded.last_online END, updated_at = excluded.updated_at', payload.userHash, username, displayName, status, lastOnline, now);
        const saved = sql.exec('SELECT last_online FROM launcher_profiles WHERE user_hash = ? LIMIT 1', payload.userHash).toArray()[0];
        return Response.json({ ok: true, lastOnline: Number(saved?.last_online || 0) });
      }
      const row = sql.exec('SELECT username, display_name, about_me, launcher_status, last_online FROM launcher_profiles WHERE user_hash = ? LIMIT 1', payload.userHash).toArray()[0];
      return Response.json({ username: row?.username || '', displayName: row?.display_name || '', aboutMe: row?.about_me || '', launcherStatus: row?.launcher_status || 'offline', lastOnline: Number(row?.last_online || 0) });
    }
    if (new URL(request.url).pathname === '/current' || new URL(request.url).pathname === '/publish') {
      const sql = this.state.storage.sql;
      if (new URL(request.url).pathname === '/current') {
        const row = sql.exec('SELECT payload FROM live_patch WHERE singleton = 1').toArray()[0];
        return new Response(row?.payload || JSON.stringify({ manifest: { version: 0, files: [] }, signature: '' }), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
      }
      let payload;
      try { payload = await request.json(); } catch { return Response.json({ error: 'Invalid patch payload' }, { status: 400 }); }
      if (!Number.isSafeInteger(payload?.manifest?.version) || payload.manifest.version < 1 || !Array.isArray(payload.manifest.files) || payload.manifest.files.length !== 5 || !/^[A-Za-z0-9+/=]{80,120}$/.test(payload.signature || '')) return Response.json({ error: 'Invalid signed patch' }, { status: 400 });
      const existing = sql.exec('SELECT version FROM live_patch WHERE singleton = 1').toArray()[0];
      if (existing && payload.manifest.version <= existing.version) return Response.json({ error: 'Patch version must increase' }, { status: 409 });
      const encoded = JSON.stringify(payload);
      if (new TextEncoder().encode(encoded).length > 700_000) return Response.json({ error: 'Signed patch is too large' }, { status: 413 });
      sql.exec('INSERT INTO live_patch (singleton, version, payload, updated_at) VALUES (1, ?, ?, ?) ON CONFLICT(singleton) DO UPDATE SET version = excluded.version, payload = excluded.payload, updated_at = excluded.updated_at', payload.manifest.version, encoded, Date.now());
      return Response.json({ ok: true, version: payload.manifest.version });
    }
    if (new URL(request.url).pathname === '/leaderboard') {
      let payload;
      try { payload = await request.json(); } catch { return Response.json({ error: 'Invalid request' }, { status: 400 }); }
      if (payload.action !== 'adminUpsert' && !/^[a-f0-9]{64}$/.test(payload.userHash || '')) return Response.json({ error: 'Invalid account identifier' }, { status: 400 });
      const sql = this.state.storage.sql;
      if (payload.action === 'list') {
        const rows = sql.exec('SELECT username, display_name, playtime_seconds, trophies_earned, completion_percent FROM launcher_leaderboard').toArray();
        const merged = new Map(rows.map(row => [row.username.toLowerCase(), row]));
        for (const row of sql.exec('SELECT username, display_name, playtime_seconds, trophies_earned, completion_percent FROM leaderboard_overrides').toArray()) merged.set(row.username.toLowerCase(), row);
        const entries = [...merged.values()].map(row => ({ ...row, score: row.trophies_earned * 100 + Math.floor(row.playtime_seconds / 3600) }));
        entries.sort((a, b) => b.score - a.score || b.trophies_earned - a.trophies_earned || b.playtime_seconds - a.playtime_seconds || a.username.localeCompare(b.username, undefined, { sensitivity: 'base' }));
        return Response.json({ entries: entries.slice(0, 10).map((row, index) => ({ rank: index + 1, username: row.username, displayName: `@${row.username}`, name: row.display_name, playtimeSeconds: row.playtime_seconds, trophiesEarned: row.trophies_earned, completionPercent: row.completion_percent, score: row.score })) });
      }
        if (payload.action === 'adminReset') {
          sql.exec('UPDATE launcher_leaderboard SET playtime_seconds = 0, trophies_earned = 0, completion_percent = 0, updated_at = ?', Date.now());
          sql.exec('UPDATE leaderboard_overrides SET playtime_seconds = 0, trophies_earned = 0, completion_percent = 0, updated_at = ?', Date.now());
          return Response.json({ reset: true });
        }
        if (payload.action === 'adminUpsert') {
        if (!Array.isArray(payload.players) || payload.players.length > 100 || payload.players.some(player => !/^[a-zA-Z0-9_.]{1,32}$/.test(player?.username || '') || !Number.isSafeInteger(player.playtimeSeconds) || player.playtimeSeconds < 0 || player.playtimeSeconds > 315360000 || !Number.isSafeInteger(player.trophiesEarned) || player.trophiesEarned < 0 || player.trophiesEarned > 55 || !Number.isSafeInteger(player.completionPercent) || player.completionPercent < 0 || player.completionPercent > 100)) return Response.json({ error: 'Invalid leaderboard overrides' }, { status: 400 });
        this.state.storage.transactionSync(() => {
          for (const player of payload.players) sql.exec('INSERT INTO leaderboard_overrides (username, display_name, playtime_seconds, trophies_earned, completion_percent, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(username) DO UPDATE SET display_name = excluded.display_name, playtime_seconds = excluded.playtime_seconds, trophies_earned = excluded.trophies_earned, completion_percent = excluded.completion_percent, updated_at = excluded.updated_at', player.username, `@${player.username}`, player.playtimeSeconds, player.trophiesEarned, player.completionPercent, Date.now());
        });
        return Response.json({ ok: true, updated: payload.players.length });
      }
      if (payload.action !== 'update' || !/^[a-zA-Z0-9_.]{1,32}$/.test(payload.username || '') || !Number.isSafeInteger(payload.playtimeSeconds) || payload.playtimeSeconds < 0 || payload.playtimeSeconds > 315360000 || !Number.isSafeInteger(payload.trophiesEarned) || payload.trophiesEarned < 0 || payload.trophiesEarned > 55 || !Number.isFinite(payload.completionPercent) || payload.completionPercent < 0 || payload.completionPercent > 100) return Response.json({ error: 'Invalid leaderboard update' }, { status: 400 });
      sql.exec('INSERT INTO launcher_leaderboard (user_hash, username, display_name, playtime_seconds, trophies_earned, completion_percent, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_hash) DO UPDATE SET username = excluded.username, display_name = excluded.display_name, playtime_seconds = excluded.playtime_seconds, trophies_earned = excluded.trophies_earned, completion_percent = excluded.completion_percent, updated_at = excluded.updated_at', payload.userHash, payload.username, payload.displayName, payload.playtimeSeconds, payload.trophiesEarned, Math.floor(payload.completionPercent), Date.now());
      return Response.json({ ok: true });
    }
    if (new URL(request.url).pathname === '/redeem') {
      let payload;
      try { payload = await request.json(); } catch { return Response.json({ error: 'Invalid request' }, { status: 400 }); }
      if (!/^[a-f0-9]{64}$/.test(payload.userHash || '')) return Response.json({ error: 'Invalid account identifier' }, { status: 400 });
      const sql = this.state.storage.sql;
      if (payload.action === 'status') {
        const row = sql.exec('SELECT 1 AS unlocked FROM modpack_redemptions WHERE user_hash = ? LIMIT 1', payload.userHash).toArray()[0];
        return Response.json({ unlocked: Boolean(row) });
      }
      if (payload.action !== 'redeem' || !/^[a-f0-9]{64}$/.test(payload.codeHash || '')) return Response.json({ error: 'Invalid redemption request' }, { status: 400 });
      try {
        this.state.storage.transactionSync(() => {
          const account = sql.exec('SELECT code_hash FROM modpack_redemptions WHERE user_hash = ? LIMIT 1', payload.userHash).toArray()[0];
          if (account) throw new Error('ACCOUNT_ALREADY_REDEEMED');
          const code = sql.exec('SELECT user_hash FROM modpack_redemptions WHERE code_hash = ? LIMIT 1', payload.codeHash).toArray()[0];
          if (code) throw new Error('CODE_ALREADY_REDEEMED');
          sql.exec('INSERT INTO modpack_redemptions (code_hash, user_hash) VALUES (?, ?)', payload.codeHash, payload.userHash);
        });
        return Response.json({ ok: true, unlocked: true });
      } catch (error) {
        if (error.message === 'ACCOUNT_ALREADY_REDEEMED') return Response.json({ error: 'This Discord account has already redeemed a Modpack code' }, { status: 409 });
        if (error.message === 'CODE_ALREADY_REDEEMED') return Response.json({ error: 'This code has already been used by another person' }, { status: 409 });
        return Response.json({ error: 'Could not record the code redemption' }, { status: 503 });
      }
    }
    const url = new URL(request.url);
    const sessionId = url.searchParams.get('id');
    if (!sessionId || !/^[0-9a-f-]{36}$/i.test(sessionId)) {
      return Response.json({ error: 'Invalid session id' }, { status: 400 });
    }
    const pair = new WebSocketPair();
    const [client, socket] = Object.values(pair);
    this.state.acceptWebSocket(socket);
    socket.serializeAttachment({ id: sessionId, seenAt: Date.now() });
    socket.send(JSON.stringify({ connected: this.activeCount() }));
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(socket, message) {
    let packet;
    try { packet = JSON.parse(typeof message === 'string' ? message : new TextDecoder().decode(message)); }
    catch { socket.close(1003, 'Invalid message'); return; }
    if (packet.type !== 'heartbeat') { socket.close(1003, 'Unsupported message'); return; }
    const attachment = socket.deserializeAttachment() || {};
    socket.serializeAttachment({ ...attachment, seenAt: Date.now() });
    socket.send(JSON.stringify({ connected: this.activeCount() }));
  }

  webSocketClose(socket) {
    try { socket.close(); } catch {}
  }

  webSocketError(socket) {
    try { socket.close(); } catch {}
  }

  activeCount() {
    const now = Date.now();
    let active = 0;
    for (const socket of this.state.getWebSockets()) {
      const attachment = socket.deserializeAttachment() || {};
      if (now - Number(attachment.seenAt || 0) > 90_000) {
        try { socket.close(1001, 'Heartbeat expired'); } catch {}
      } else {
        active++;
      }
    }
    return active;
  }
}

