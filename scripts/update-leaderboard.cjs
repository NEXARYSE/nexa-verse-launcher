const fs = require('node:fs');
const path = require('node:path');

async function main() {
  const root = path.resolve(__dirname, '..');
  const service = JSON.parse(fs.readFileSync(path.join(root, 'presence-service.json'), 'utf8'));
  const configDir = path.join(root, 'presence-worker', '.wrangler-config');
  const tokenPath = path.join(configDir, 'leaderboard-admin-token');
  if (!fs.existsSync(tokenPath)) throw new Error('Missing private admin token. Configure it once with the project owner.');
  const token = fs.readFileSync(tokenPath, 'utf8').trim();
  const inputPath = process.argv[2];
  if (!inputPath) throw new Error('Usage: node scripts/update-leaderboard.cjs <stats.json>');
  const input = JSON.parse(fs.readFileSync(path.resolve(inputPath), 'utf8'));
  if (!Array.isArray(input.players)) throw new Error('Stats JSON must contain a players array.');
  const response = await fetch(`${service.url.replace(/\/$/, '')}/api/leaderboard/admin`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Leaderboard update failed (${response.status}): ${result.error || 'unknown error'}`);
  process.stdout.write(`Updated ${result.updated} leaderboard record(s).\n`);
}

main().catch(error => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
