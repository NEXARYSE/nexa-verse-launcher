export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/api/connect') {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }
    if (request.method !== 'GET' || request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return Response.json({ error: 'WebSocket upgrade required' }, { status: 426 });
    }
    const id = env.PRESENCE.idFromName('nexa-verse-global-active-launchers');
    return env.PRESENCE.get(id).fetch(request);
  },
};

export class PresenceCounter {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
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

