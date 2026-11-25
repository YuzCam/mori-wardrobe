import test from 'node:test';
import assert from 'node:assert/strict';
import { openDB } from 'idb';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { database, input, assets, WardrobeStore } from './helpers.ts';
const { garmentSchema } = await import('../../lib/validation/garment.ts');
const { detailedCategories, categoryGroups, clothingGroup } =
  await import('../../config/clothing.ts');
const { filterGarments, emptyFilters } = await import('../src/filter.ts');
const { exportParts, inspectBackup } = await import('../src/backup.ts');
const look = (id: string) => ({
  name: '周末搭配',
  notes: '本机测试',
  background: '#f2eee8',
  layers: [{ garmentId: id, x: 20, y: 8, width: 45, rotation: 0 }],
});
async function archive(db: ReturnType<typeof database>) {
  const result = [];
  for await (const p of exportParts(db, () => {})) result.push(p);
  return result;
}

test('every requested detail belongs to the correct main group and survives garment validation', () => {
  assert.deepEqual(
    categoryGroups.map((g) => g.name),
    ['套装', '上装', '下装', '鞋子', '配饰'],
  );
  assert.equal(detailedCategories.length, 23);
  for (const detail of detailedCategories) {
    const parsed = garmentSchema.parse({
      ...input,
      category: detail.category,
      subcategory: detail.id,
    });
    assert.equal(clothingGroup(parsed), detail.group);
  }
  assert.equal(
    garmentSchema.safeParse({ ...input, category: 'shoes', subcategory: 'sweater' }).success,
    false,
  );
  assert.equal(garmentSchema.safeParse(input).success, true);
});
test('custom hex colors and main/detail category filters work while unsafe colors are rejected', async () => {
  const db = database();
  const a = await db.save(
    { ...input, subcategory: 'sweater', colors: ['custom:#12AB34'] },
    assets(),
  );
  await db.save({ ...input, category: 'outerwear', subcategory: 'long-coat' }, assets());
  const all = await db.list();
  assert.equal(a.colors[0], 'custom:#12ab34');
  assert.equal(filterGarments(all, { ...emptyFilters, categories: ['group:tops'] }).length, 2);
  assert.equal(
    filterGarments(all, { ...emptyFilters, categories: ['detail:sweater'] })[0].id,
    a.id,
  );
  assert.equal(filterGarments(all, { ...emptyFilters, q: '毛衣' })[0].id, a.id);
  assert.equal(filterGarments(all, { ...emptyFilters, colors: ['custom:#12ab34'] })[0].id, a.id);
  assert.equal(
    garmentSchema.safeParse({ ...input, colors: ['custom:url(example)'] }).success,
    false,
  );
  await db.close();
});
test('database version one upgrades without losing clothing, images, draft or settings', async () => {
  const name = 'mori-upgrade-' + crypto.randomUUID(),
    id = crypto.randomUUID(),
    now = new Date().toISOString();
  const old = await openDB(name, 1, {
    upgrade(db) {
      db.createObjectStore('garments', { keyPath: 'id' }).createIndex('by-import', 'importKey', {
        unique: true,
      });
      db.createObjectStore('assets', { keyPath: 'key' });
      db.createObjectStore('drafts', { keyPath: 'id' });
      db.createObjectStore('settings', { keyPath: 'key' });
    },
  });
  await old.put('garments', {
    ...input,
    id,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  });
  for (const [k, blob] of Object.entries(assets()))
    await old.put('assets', { key: `${id}:${k}`, blob });
  await old.put('drafts', {
    id: 'current',
    input,
    original: assets().original,
    mask: assets().mask,
    step: 'image',
    savedAt: now,
  });
  await old.put('settings', { key: 'app', value: { autoProcess: false, lastBackup: null } });
  old.close();
  const db = new WardrobeStore(name);
  assert.equal((await db.list()).length, 1);
  assert.ok((await db.asset(id, 'original'))?.size);
  assert.ok(await db.draft());
  assert.equal((await db.settings()).autoProcess, false);
  assert.deepEqual(await db.listLooks(), []);
  await db.close();
});
test('looks preserve edits and preview, retain a draft until saved, and support reversible trash', async () => {
  const db = database(),
    garment = await db.save(input, assets()),
    preview = assets().image;
  await db.saveLookDraft({
    id: 'current',
    input: look(garment.id),
    savedAt: new Date().toISOString(),
  });
  const first = await db.saveLook(look(garment.id), preview);
  assert.equal(await db.lookDraft(), undefined);
  const edited = await db.saveLook({ ...look(garment.id), name: '新的名字' }, preview, {
    id: first.id,
    revision: first.revision,
  });
  assert.equal(edited.id, first.id);
  assert.equal(edited.revision, 2);
  await assert.rejects(
    () => db.saveLook(look(garment.id), preview, { id: first.id, revision: 1 }),
    /变化/,
  );
  await db.changeLookTrash(first.id, true);
  assert.equal((await db.listLooks()).length, 0);
  assert.ok(await db.lookPreview(first.id));
  await db.changeLookTrash(first.id, false);
  assert.equal((await db.listLooks()).length, 1);
  await db.changeTrash(garment.id, true);
  await assert.rejects(() => db.saveLook(look(garment.id), preview), /收起/);
  assert.equal((await db.listLooks()).length, 1);
  await db.close();
});
test('a missing garment never partially saves a look or clears its draft', async () => {
  const db = database(),
    data = look(crypto.randomUUID());
  await db.saveLookDraft({ id: 'current', input: data, savedAt: new Date().toISOString() });
  await assert.rejects(() => db.saveLook(data, assets().image), /衣物/);
  assert.equal((await db.listLooks()).length, 0);
  assert.ok(await db.lookDraft());
  await db.close();
});
test('backup restores detailed tags, custom colors, look layers and previews, and is idempotent', async () => {
  const source = database(),
    target = database();
  const garment = await source.save(
    { ...input, subcategory: 'shirt', colors: ['custom:#d4b3af'] },
    assets(),
  );
  const saved = await source.saveLook(look(garment.id), assets().image);
  const [part] = await archive(source),
    backup = await inspectBackup(part.blob);
  assert.equal(backup.looks.length, 1);
  await target.restore(backup.entries, backup.backupId, backup.looks);
  await target.restore(backup.entries, backup.backupId, backup.looks);
  assert.equal((await target.list()).length, 1);
  assert.deepEqual((await target.list())[0].colors, ['custom:#d4b3af']);
  assert.equal((await target.list())[0].subcategory, 'shirt');
  assert.equal((await target.listLooks()).length, 1);
  assert.equal((await target.listLooks())[0].layers[0].garmentId, (await target.list())[0].id);
  assert.ok(await target.lookPreview(saved.id));
  await source.close();
  await target.close();
});
test('outfit import remaps colliding clothing IDs and rejects a look volume imported before its garments', async () => {
  const source = database(),
    target = database();
  const garment = await source.save(input, assets());
  await source.saveLook(look(garment.id), assets().image);
  const [part] = await archive(source),
    backup = await inspectBackup(part.blob);
  await assert.rejects(() => target.restore([], backup.backupId, backup.looks), /分卷/);
  assert.deepEqual(await target.listLooks(), []);
  const collision = {
    ...backup.entries[0],
    record: { ...backup.entries[0].record, createdAt: '2000-01-01T00:00:00.000Z' },
  };
  await target.restore([collision], crypto.randomUUID());
  await target.restore(backup.entries, backup.backupId, backup.looks);
  const outfit = (await target.listLooks())[0];
  assert.notEqual(outfit.layers[0].garmentId, garment.id);
  assert.equal((await target.get(outfit.layers[0].garmentId))?.createdAt, garment.createdAt);
  assert.equal((await target.list()).length, 2);
  await source.close();
  await target.close();
});
test('version one wardrobe backups remain readable after adding looks', async () => {
  const db = database();
  await db.save(input, assets());
  const [part] = await archive(db),
    files = unzipSync(new Uint8Array(await part.blob.arrayBuffer()));
  const manifest = JSON.parse(strFromU8(files['manifest.json']));
  manifest.version = 1;
  delete manifest.looks;
  files['manifest.json'] = strToU8(JSON.stringify(manifest));
  const parsed = await inspectBackup(new Blob([zipSync(files) as Uint8Array<ArrayBuffer>]));
  assert.equal(parsed.entries.length, 1);
  assert.deepEqual(parsed.looks, []);
  await db.close();
});
test('altered look previews fail inspection before any records can be restored', async () => {
  const db = database(),
    g = await db.save(input, assets());
  await db.saveLook(look(g.id), assets().image);
  const [part] = await archive(db),
    files = unzipSync(new Uint8Array(await part.blob.arrayBuffer()));
  const manifest = JSON.parse(strFromU8(files['manifest.json']));
  files[manifest.looks[0].file.path] = strToU8('altered');
  await assert.rejects(
    () => inspectBackup(new Blob([zipSync(files) as Uint8Array<ArrayBuffer>])),
    /搭配图片校验/,
  );
  await db.close();
});
