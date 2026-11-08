const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const assetRoot = path.join(root, '.build-assets', 'data');
const manifestPath = path.join(root, '.build-assets', 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

for (const asset of manifest.assets) {
  if (!Array.isArray(asset.parts) || !asset.parts.length) {
    throw new Error(`No source chunks listed for ${asset.target}`);
  }
  const encoded = asset.parts.map((part) => {
    const partPath = path.resolve(assetRoot, part);
    if (!partPath.startsWith(assetRoot + path.sep)) {
      throw new Error(`Invalid asset chunk path: ${part}`);
    }
    return fs.readFileSync(partPath, 'utf8').trim();
  }).join('');
  const target = path.resolve(root, asset.target);
  if (!target.startsWith(root + path.sep)) {
    throw new Error(`Invalid asset target: ${asset.target}`);
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, Buffer.from(encoded, 'base64'));
  console.log(`Restored ${asset.target}`);
}
