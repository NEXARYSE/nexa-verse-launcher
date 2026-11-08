# Nexa Verse shared launcher presence

This Cloudflare Worker counts active launcher sessions and enforces single-use Modpack code redemption. Presence uses a random session UUID and last heartbeat time on the live socket attachment, expires idle sockets after 90 seconds, and returns an aggregate count. Redemption validates the Discord OAuth token and Nexa Verse guild membership at the Worker, then stores only a SHA-256 hash of the Discord account ID and a SHA-256 hash of the redeemed code in a Durable Object SQLite table. It does not store raw Discord IDs, names, tokens, or access codes.

## Deploy

1. Install Node.js and run `npx wrangler login` in this folder. Sign in to the Cloudflare account that owns the worker.
2. Set a randomly generated, 32-byte-or-longer secret as `MODPACK_HASH_PEPPER` and the comma-separated SHA-256 hashes of all valid 8-digit codes as `MODPACK_CODE_HASHES`, using `npx wrangler secret put`. Keep both secrets and the plaintext codes private; never commit them to source control. The pepper protects stored Discord ID hashes from being guessed if the database is exposed.
3. Run `npx wrangler deploy`.
4. Keep the deployed `https://nexaverse-launcher.tratreejordant.workers.dev` URL in `presence-service.json` at the launcher project root, then publish a launcher release.

Each valid code is globally redeemable once, and each linked Discord account may redeem one code total. A permanent redemption row stores only the code hash and a peppered HMAC of the Discord ID; there is no reset or expiry. Add future code hashes to the Worker secret before distributing future codes. Replacing the secret with a new set invalidates all codes that are not included, so preserve earlier unredeemed hashes when rotating it.

The global counter is a best-effort online indicator, not an anti-cheat system. The launcher opens a WebSocket only after its local Discord membership check succeeds. Heartbeats expire after 90 seconds if a launcher closes or loses network access. Review your Cloudflare account limits before wide distribution. See [Cloudflare Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/).

