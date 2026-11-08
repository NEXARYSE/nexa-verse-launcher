# Nexa Verse shared launcher presence

This Cloudflare Worker counts active launcher sessions using a Durable Object WebSocket. It keeps only a random session UUID and last heartbeat time on the live socket attachment, expires idle sockets after 90 seconds, and returns an aggregate count. It does not store Discord IDs, names, tokens, or game activity.

## Deploy

1. Install Node.js and run `npx wrangler login` in this folder. Sign in to the Cloudflare account that will own the worker.
2. Run `npx wrangler deploy`.
3. Copy the deployed `https://nexaverse-launcher.tratreejordant.workers.dev` URL into `presence-service.json` at the launcher project root.
4. Build and publish a launcher release. Players will then connect one anonymous WebSocket each and send a heartbeat every 60 seconds to see the shared active launcher count.

The global counter is a best-effort online indicator, not an authorization or anti-cheat system. The launcher opens a WebSocket only after its local Discord membership check succeeds. Heartbeats expire after 90 seconds if a launcher closes or loses network access. The current Cloudflare Free plan allows 100,000 Durable Object requests per day; Durable Object WebSocket messages use a 20:1 request billing ratio, so one-minute heartbeats use about 72,000 requests per day for 1,000 clients that remain connected all day (plus connection traffic). A few thousand continuous connections can exceed free limits; review the current account limits before wide distribution. See [Cloudflare Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/).

