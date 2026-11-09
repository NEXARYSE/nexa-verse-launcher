const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const filesToPatch = ['app.js', 'index.html', 'social.css', 'style.css', 'ui-adjustments.js'];
const feedUrl = 'https://raw.githubusercontent.com/NEXARYSE/nexa-verse-launcher/main/live-patch.json';

async function main() {
  let previousVersion = 0;
  try {
    const response = await fetch(`${feedUrl}?v=${Date.now()}`, { headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' } });
    if (response.ok) previousVersion = Number((await response.json()).manifest?.version) || 0;
  } catch {}

  const files = filesToPatch.map((name) => {
    const content = fs.readFileSync(path.join(root, name), 'utf8');
    const data = Buffer.from(content, 'utf8');
    if (data.length > 300_000) throw new Error(`${name} is too large for live patch delivery.`);
    return { path: name, sha256: crypto.createHash('sha256').update(data).digest('hex'), content };
  });
  if (files.reduce((sum, file) => sum + Buffer.byteLength(file.content), 0) > 600_000) throw new Error('The live patch exceeds the feed size limit.');

  const manifest = { version: previousVersion + 1, files };
  const keyPath = path.join(root, 'presence-worker', '.wrangler-config', 'live-patch-private.jwk');
  if (!fs.existsSync(keyPath)) throw new Error('The live patch signing key is not configured on this developer machine.');
  const privateKey = crypto.createPrivateKey({ key: JSON.parse(fs.readFileSync(keyPath, 'utf8')), format: 'jwk' });
  const signature = crypto.sign(null, Buffer.from(JSON.stringify(manifest)), privateKey).toString('base64');
  fs.writeFileSync(path.join(root, 'live-patch.json'), `${JSON.stringify({ manifest, signature })}\n`);
  process.stdout.write(`Prepared signed live patch ${manifest.version}. Publish live-patch.json to the repository's main branch to distribute it.\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
