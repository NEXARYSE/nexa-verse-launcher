const fs = require('node:fs');
const path = require('node:path');

async function main() {
  const root = path.resolve(__dirname, '..');
  const service = JSON.parse(fs.readFileSync(path.join(root, 'presence-service.json'), 'utf8'));
  const secretPath = path.join(root, 'presence-worker', '.wrangler-config', 'live-patch-admin-token');
  if (!fs.existsSync(secretPath)) throw new Error('Live patch publishing token is not configured on this developer machine.');
  const token = fs.readFileSync(secretPath, 'utf8').trim();
  const base = service.url.replace(/\/$/, '');
  const currentResponse = await fetch(`${base}/api/live-patch/current`, { headers: { Accept: 'application/json' } });
  if (!currentResponse.ok) throw new Error(`Could not read current patch version (${currentResponse.status}).`);
  const current = await currentResponse.json();
  const version = Number(current?.manifest?.version || 0) + 1;
  const files = {};
  for (const name of ['app.js', 'index.html', 'social.css', 'style.css', 'ui-adjustments.js']) files[name] = fs.readFileSync(path.join(root, name), 'utf8');
  const response = await fetch(`${base}/api/live-patch/publish`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ version, files }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Patch publish failed (${response.status}): ${result.error || 'unknown error'}`);
  process.stdout.write(`Published live UI patch ${result.version}. Open launchers will apply it on their next background check.\n`);
}

main().catch(error => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
