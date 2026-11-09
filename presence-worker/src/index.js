export default {
  async fetch(request, env) {
    const url = new URL(request.url);
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
  }

  async fetch(request) {
    if (new URL(request.url).pathname === '/leaderboard') {
      let payload;
      try { payload = await request.json(); } catch { return Response.json({ error: 'Invalid request' }, { status: 400 }); }
      if (!/^[a-f0-9]{64}$/.test(payload.userHash || '')) return Response.json({ error: 'Invalid account identifier' }, { status: 400 });
      const sql = this.state.storage.sql;
      if (payload.action === 'list') {
        const rows = sql.exec('SELECT username, display_name, playtime_seconds, trophies_earned, completion_percent, (trophies_earned * 100 + CAST(playtime_seconds / 3600 AS INTEGER)) AS score FROM launcher_leaderboard ORDER BY score DESC, trophies_earned DESC, playtime_seconds DESC, username COLLATE NOCASE ASC LIMIT 10').toArray();
        return Response.json({ entries: rows.map((row, index) => ({ rank: index + 1, username: row.username, displayName: `@${row.username}`, name: row.display_name, playtimeSeconds: row.playtime_seconds, trophiesEarned: row.trophies_earned, completionPercent: row.completion_percent, score: row.score })) });
      }
      if (payload.action !== 'update' || !/^[a-zA-Z0-9_.]{1,32}$/.test(payload.username || '') || !Number.isSafeInteger(payload.playtimeSeconds) || payload.playtimeSeconds < 0 || payload.playtimeSeconds > 315360000 || !Number.isSafeInteger(payload.trophiesEarned) || payload.trophiesEarned < 0 || payload.trophiesEarned > 55 || !Number.isFinite(payload.completionPercent) || payload.completionPercent < 0 || payload.completionPercent > 100) return Response.json({ error: 'Invalid leaderboard update' }, { status: 400 });
      sql.exec('INSERT INTO launcher_leaderboard (user_hash, username, display_name, playtime_seconds, trophies_earned, completion_percent, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_hash) DO UPDATE SET username = excluded.username, display_name = excluded.display_name, playtime_seconds = MAX(launcher_leaderboard.playtime_seconds, excluded.playtime_seconds), trophies_earned = MAX(launcher_leaderboard.trophies_earned, excluded.trophies_earned), completion_percent = MAX(launcher_leaderboard.completion_percent, excluded.completion_percent), updated_at = excluded.updated_at', payload.userHash, payload.username, payload.displayName, payload.playtimeSeconds, payload.trophiesEarned, Math.floor(payload.completionPercent), Date.now());
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

