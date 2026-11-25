import test from 'node:test';
import assert from 'node:assert/strict';
import { database, input, assets, WardrobeStore } from './helpers.ts';

test('metadata and four image blobs survive a database close and reopen', async () => {
  const name = 'mori-test-' + crypto.randomUUID();
  const first = new WardrobeStore(name);
  const record = await first.save(input, assets());
  await first.close();
  const second = new WardrobeStore(name);
  assert.equal((await second.get(record.id))?.name, input.name);
  for (const blob of Object.values(await second.assets(record.id))) assert.ok(blob.size > 0);
  await second.close();
});
test('image editing preserves identity and rejects stale edits without losing images', async () => {
  const db = database();
  const record = await db.save(input, assets());
  const changed = assets();
  changed.image = new Blob(['new-image'], { type: 'image/png' });
  const updated = await db.save({ ...input, name: '更新后的针织衫' }, changed, {
    id: record.id,
    revision: record.revision,
  });
  assert.equal(updated.id, record.id);
  assert.equal(updated.revision, 2);
  assert.equal(updated.createdAt, record.createdAt);
  await assert.rejects(() => db.save(input, assets(), { id: record.id, revision: 1 }), /变化/);
  assert.equal(
    (await db.asset(record.id, 'image')) && (await (await db.asset(record.id, 'image'))!.text()),
    'new-image',
  );
  assert.equal((await db.list()).length, 1);
  await db.close();
});
test('trash is reversible and retains original and processed images', async () => {
  const db = database(),
    record = await db.save(input, assets());
  await db.changeTrash(record.id, true);
  assert.equal((await db.list()).length, 0);
  assert.equal((await db.list(true)).length, 1);
  assert.ok((await db.asset(record.id, 'original'))!.size);
  await db.changeTrash(record.id, false);
  assert.equal((await db.list()).length, 1);
  await db.close();
});
test('invalid labels and missing pictures never create incomplete records', async () => {
  const db = database();
  await assert.rejects(() => db.save({ ...input, seasons: [] }, assets()));
  const bad = assets();
  bad.mask = new Blob([], { type: 'image/png' });
  await assert.rejects(() => db.save(input, bad), /图片/);
  assert.equal((await db.list(true)).length, 0);
  await db.close();
});
test('successful save clears the matching draft in the same transaction', async () => {
  const db = database();
  const pictures = assets();
  await db.saveDraft({
    id: 'current',
    input,
    original: pictures.original,
    mask: pictures.mask,
    step: 'tags',
    savedAt: new Date().toISOString(),
  });
  assert.ok(await db.draft());
  await db.save(input, pictures);
  assert.equal(await db.draft(), undefined);
  await db.close();
});
test('mid-import write failure rolls back every metadata and image write', async () => {
  const db = database();
  const source = database();
  const a = await source.save(input, assets()),
    b = await source.save({ ...input, name: '第二件' }, assets());
  const originalPut = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (value, key) {
    if (this.name === 'assets' && value.key === `${b.id}:image`)
      throw new DOMException('Injected write failure', 'QuotaExceededError');
    return originalPut.call(this, value, key);
  };
  try {
    await assert.rejects(() =>
      db.restore(
        [
          { record: a, assets: assets() },
          { record: b, assets: assets() },
        ],
        crypto.randomUUID(),
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal((await db.list(true)).length, 0);
    assert.equal(await db.asset(a.id, 'original'), undefined);
  } finally {
    IDBObjectStore.prototype.put = originalPut;
    await db.close();
    await source.close();
  }
});
