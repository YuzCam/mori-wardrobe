import { spawnSync } from 'node:child_process';
import { readFile, writeFile, mkdir, cp, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const root = process.cwd();
function run(args) {
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
run(['scripts/prepare-runtime.mjs']);
run(['node_modules/vite/bin/vite.js', 'build', '--config', 'vite.offline.config.ts']);
const web = path.resolve(root, 'outputs/offline-web');
for (const directory of ['models', 'model-metadata', 'ort', 'workers'])
  await cp(path.join(root, 'public', directory), path.join(web, directory), { recursive: true });
const modelManifest = JSON.parse(
  await readFile(path.join(web, 'model-metadata/manifest.json'), 'utf8'),
);
for (const model of [modelManifest.segmentation, modelManifest.classification]) {
  const digest = createHash('sha256');
  for (const segment of model.segments) {
    const data = await readFile(path.join(web, segment.url));
    if (
      data.length !== segment.bytes ||
      createHash('sha256').update(data).digest('hex') !== segment.sha256
    )
      throw Error('Bundled model integrity check failed: ' + segment.url);
    digest.update(data);
  }
  if (digest.digest('hex') !== model.sha256)
    throw Error('Bundled model integrity check failed: ' + model.model);
}
const entries = [];
async function index(folder) {
  for (const item of await readdir(folder, { withFileTypes: true })) {
    const file = path.join(folder, item.name);
    if (item.isDirectory()) await index(file);
    else {
      const name = path.relative(web, file).replaceAll('\\', '/');
      const bytes = await readFile(file);
      const mime = /\.(js|mjs)$/.test(name)
        ? 'text/javascript'
        : name.endsWith('.css')
          ? 'text/css'
          : name.endsWith('.html')
            ? 'text/html'
            : name.endsWith('.json')
              ? 'application/json'
              : name.endsWith('.wasm')
                ? 'application/wasm'
                : name.endsWith('.svg')
                  ? 'image/svg+xml'
                  : 'application/octet-stream';
      entries.push({
        path: name,
        mime,
        bytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      });
    }
  }
}
await index(web);
await writeFile(path.join(web, 'resource-index.json'), JSON.stringify(entries, null, 2));
const nativeAssets = path.resolve(root, 'harmonyos/entry/src/main/resources/rawfile/offline');
await mkdir(nativeAssets, { recursive: true });
// No deletion: the generated index exposes only the current build's assets.
await cp(web, nativeAssets, { recursive: true });
await writeFile(
  path.join(root, 'outputs/offline-build.json'),
  JSON.stringify(
    {
      builtAt: new Date().toISOString(),
      assetCount: entries.length,
      bytes: entries.reduce((s, e) => s + e.bytes, 0),
      web,
      nativeAssets,
      offline: true,
      nativeCompiled: false,
      note: 'This is the verified offline UI bundle. A signed HAP requires Huawei SDK and device signing.',
    },
    null,
    2,
  ),
);
console.log(`Offline bundle ready: ${web}`);
console.log('HarmonyOS bundled resources updated. No HAP has been compiled by this command.');
