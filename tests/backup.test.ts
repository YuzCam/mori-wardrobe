import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { zipSync, strToU8 } from 'fflate';
// Node's TypeScript runner deliberately does not infer extensionless TS imports.
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (specifier.startsWith('.') && !/\.[a-z]+$/.test(specifier))
        return nextResolve(specifier + '.ts', context);
      throw error;
    }
  },
});
const { inspectBackup } = await import('../features/settings/backup.ts');
const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const checksum = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
  .map((x) => x.toString(16).padStart(2, '0'))
  .join('');
function fixture(modify?: (manifest: any, files: Record<string, Uint8Array>) => void) {
  const id = 'da50440e-09de-40da-836b-e8ee2277c135';
  const file = { path: `files/${id}/original.png`, sha256: checksum, type: 'image/png' };
  const manifest: any = {
    version: 1,
    backupId: crypto.randomUUID(),
    exportedAt: new Date().toISOString(),
    preferences: {
      city: '',
      latitude: null,
      longitude: null,
      timezone: 'Asia/Shanghai',
      season: 'winter',
      theme: 'seasonal',
    },
    outfits: [],
    garments: [
      {
        id,
        name: '备份单品',
        category: 'top',
        seasons: ['winter'],
        colors: ['oat'],
        styles: [],
        notes: '',
        warmth: 2,
        recipe: { brightness: 100, contrast: 100, background: '#f2eee8', crop: null, rotation: 0 },
        recognition: null,
        files: { original: file, image: file, thumbnail: file },
      },
    ],
  };
  const files: Record<string, Uint8Array> = { [file.path]: bytes };
  modify?.(manifest, files);
  files['manifest.json'] = strToU8(JSON.stringify(manifest));
  return new File([zipSync(files) as Uint8Array<ArrayBuffer>], 'backup.zip', {
    type: 'application/zip',
  });
}
test('backup validates metadata and all referenced image hashes', async () => {
  const backup = await inspectBackup(fixture());
  assert.equal(backup.manifest.garments.length, 1);
  assert.equal(backup.manifest.garments[0].name, '备份单品');
});
test('missing or altered backup images are rejected before writes', async () => {
  await assert.rejects(
    () =>
      inspectBackup(
        fixture((m, f) => {
          f[m.garments[0].files.original.path] = new Uint8Array([1, 2, 3]);
        }),
      ),
    /校验/,
  );
});
test('unsupported backup version cannot be restored', async () => {
  await assert.rejects(
    () =>
      inspectBackup(
        fixture((m) => {
          m.version = 999;
        }),
      ),
    /版本/,
  );
});
test('expanded size is bounded before decompression', async () => {
  const large = new Uint8Array(8 * 1024 * 1024 + 1);
  const file = new File(
    [zipSync({ 'manifest.json': large }, { level: 9 }) as Uint8Array<ArrayBuffer>],
    'oversize.zip',
  );
  await assert.rejects(() => inspectBackup(file), /解压体积/);
});
