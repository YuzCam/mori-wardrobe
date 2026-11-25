import test from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { database, input, assets } from './helpers.ts';
const { exportParts, inspectBackup } = await import('../src/backup.ts');
async function archive(db: ReturnType<typeof database>) {
  const parts = [];
  for await (const part of exportParts(db, () => {})) parts.push(part);
  return parts;
}
test('spring/autumn and three-season tags survive a full backup round trip', async () => {
  const source = database(), target = database();
  await source.save({ ...input, name: '春秋外套', seasons: ['spring-autumn'] }, assets());
  await source.save({ ...input, name: '四季打底', seasons: ['spring-autumn', 'summer', 'winter'] }, assets());
  const [part] = await archive(source);
  const backup = await inspectBackup(part.blob);
  await target.restore(backup.entries, backup.backupId);
  const all = await target.list();
  assert.deepEqual(all.find(g => g.name === '春秋外套')?.seasons, ['spring-autumn']);
  assert.deepEqual(all.find(g => g.name === '四季打底')?.seasons, ['spring-autumn', 'summer', 'winter']);
  await source.close(); await target.close();
});
test('a complete backup restores blobs, edits and trash state without a server', async () => {
  const source = database(),
    target = database();
  const first = await source.save(input, assets());
  const second = await source.save(
    { ...input, name: '收起的外套', category: 'outerwear' },
    assets(),
  );
  await source.changeTrash(second.id, true);
  const [part] = await archive(source),
    backup = await inspectBackup(part.blob);
  assert.equal(backup.entries.length, 2);
  assert.deepEqual(await target.restore(backup.entries, backup.backupId), {
    restored: 2,
    skipped: 0,
  });
  assert.equal((await target.list()).length, 1);
  assert.equal((await target.list(true)).length, 2);
  assert.equal(
    await (await target.asset(first.id, 'original'))!.text(),
    await (await source.asset(first.id, 'original'))!.text(),
  );
  await source.close();
  await target.close();
});
test('restoring the same backup twice is idempotent and keeps newer local edits', async () => {
  const source = database(),
    target = database();
  await source.save(input, assets());
  const [part] = await archive(source),
    backup = await inspectBackup(part.blob);
  await target.restore(backup.entries, backup.backupId);
  const record = (await target.list())[0];
  await target.save({ ...input, name: '本机修改' }, assets(), {
    id: record.id,
    revision: record.revision,
  });
  assert.deepEqual(await target.restore(backup.entries, backup.backupId), {
    restored: 0,
    skipped: 1,
  });
  assert.equal((await target.list())[0].name, '本机修改');
  await source.close();
  await target.close();
});
test('tampered pictures fail validation before any database write', async () => {
  const db = database();
  await db.save(input, assets());
  const [part] = await archive(db);
  const files = unzipSync(new Uint8Array(await part.blob.arrayBuffer()));
  const manifest = JSON.parse(strFromU8(files['manifest.json']));
  files[manifest.garments[0].files.image.path] = strToU8('tampered');
  await assert.rejects(
    () => inspectBackup(new Blob([zipSync(files) as Uint8Array<ArrayBuffer>])),
    /校验/,
  );
  await db.close();
});
test('legacy website backup imports clothing while ignoring online-only settings', async () => {
  const db = database();
  await db.save(input, assets());
  const [part] = await archive(db);
  const files = unzipSync(new Uint8Array(await part.blob.arrayBuffer()));
  const manifest = JSON.parse(strFromU8(files['manifest.json']));
  delete manifest.format;
  delete manifest.garments[0].files.mask;
  manifest.outfits = [];
  manifest.preferences = {};
  files['manifest.json'] = strToU8(JSON.stringify(manifest));
  const parsed = await inspectBackup(new Blob([zipSync(files) as Uint8Array<ArrayBuffer>]));
  assert.equal(parsed.legacy, true);
  assert.ok(parsed.entries[0].assets.mask.size);
  await db.close();
});
test('oversized decompression and unknown versions are rejected', async () => {
  const bomb = new Blob([
    zipSync(
      { 'manifest.json': new Uint8Array(8 * 1024 * 1024 + 1) },
      { level: 9 },
    ) as Uint8Array<ArrayBuffer>,
  ]);
  await assert.rejects(() => inspectBackup(bomb), /体积/);
  const unknown = new Blob([
    zipSync({
      'manifest.json': strToU8(JSON.stringify({ version: 999 })),
    }) as Uint8Array<ArrayBuffer>,
  ]);
  await assert.rejects(() => inspectBackup(unknown), /版本/);
});
