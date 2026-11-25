import test from 'node:test';
import assert from 'node:assert/strict';
import { database, input, assets } from './helpers.ts';
const { exportParts, inspectBackup } = await import('../src/backup.ts');
const look = (id: string) => ({
  name: '删除关联测试',
  notes: '',
  background: '#f2eee8',
  layers: [{ garmentId: id, x: 20, y: 8, width: 45, rotation: 0 }],
});

test('only trashed garments can be permanently deleted; all four blobs are removed', async () => {
  const db = database(),
    garment = await db.save(input, assets());
  await assert.rejects(() => db.garmentDeletionPlan(garment.id), /回收站/);
  await db.changeTrash(garment.id, true);
  const plan = await db.garmentDeletionPlan(garment.id);
  await db.purgeGarment(plan);
  assert.equal(await db.get(garment.id), undefined);
  for (const kind of ['original', 'image', 'thumbnail', 'mask'] as const)
    assert.equal(await db.asset(garment.id, kind), undefined);
  assert.equal((await db.storageUsage()).total, 0);
  await assert.rejects(() => db.purgeGarment(plan), /不存在/);
  await db.close();
});

test('restoring an item after opening confirmation prevents its permanent deletion', async () => {
  const db = database(),
    garment = await db.save(input, assets());
  await db.changeTrash(garment.id, true);
  const plan = await db.garmentDeletionPlan(garment.id);
  await db.changeTrash(garment.id, false);
  await assert.rejects(() => db.purgeGarment(plan), /回收站/);
  assert.ok(await db.asset(garment.id, 'original'));
  await db.close();
});

test('linked looks including trashed looks require explicit consent; unrelated clothes and looks survive', async () => {
  const db = database(),
    garment = await db.save(input, assets()),
    other = await db.save(input, assets());
  const linked = await db.saveLook(look(garment.id), assets().image);
  const linkedTrash = await db.saveLook(look(garment.id), assets().image);
  await db.changeLookTrash(linkedTrash.id, true);
  const unrelated = await db.saveLook(look(other.id), assets().image);
  await db.changeTrash(garment.id, true);
  const plan = await db.garmentDeletionPlan(garment.id);
  assert.equal(plan.looks.length, 2);
  await assert.rejects(() => db.purgeGarment(plan), /确认/);
  assert.equal((await db.listLooks(true)).length, 3);
  assert.ok(await db.asset(garment.id, 'image'));
  await db.purgeGarment(plan, true);
  assert.deepEqual(
    (await db.listLooks(true)).map((l) => l.id),
    [unrelated.id],
  );
  assert.equal(await db.lookPreview(linked.id), undefined);
  assert.equal(await db.lookPreview(linkedTrash.id), undefined);
  assert.ok(await db.lookPreview(unrelated.id));
  assert.ok(await db.asset(other.id, 'original'));
  const parts = [];
  for await (const part of exportParts(db, () => {})) parts.push(part);
  const backup = await inspectBackup(parts[0].blob);
  assert.equal(backup.entries.length, 1);
  assert.equal(backup.looks.length, 1);
  assert.equal(backup.looks[0].record.layers[0].garmentId, other.id);
  await db.close();
});

test('new or edited linked looks invalidate an earlier confirmation plan', async () => {
  const db = database(),
    garment = await db.save(input, assets());
  const linked = await db.saveLook(look(garment.id), assets().image);
  await db.changeTrash(garment.id, true);
  const plan = await db.garmentDeletionPlan(garment.id);
  await db.changeLookTrash(linked.id, true);
  await assert.rejects(() => db.purgeGarment(plan, true), /变化/);
  assert.ok(await db.get(garment.id));
  assert.ok(await db.lookPreview(linked.id));
  await db.close();
});

test('related garment and outfit drafts are deleted only with the corresponding item and consent', async () => {
  const db = database(),
    garment = await db.save(input, assets()),
    pictures = assets();
  await db.saveDraft({
    id: 'current',
    input,
    original: pictures.original,
    mask: pictures.mask,
    editingId: garment.id,
    revision: garment.revision,
    step: 'tags',
    savedAt: new Date().toISOString(),
  });
  await db.saveLookDraft({
    id: 'current',
    input: look(garment.id),
    savedAt: new Date().toISOString(),
  });
  await db.changeTrash(garment.id, true);
  const plan = await db.garmentDeletionPlan(garment.id);
  assert.ok(plan.lookDraft);
  await assert.rejects(() => db.purgeGarment(plan), /确认/);
  assert.ok(await db.draft());
  assert.ok(await db.lookDraft());
  await db.purgeGarment(plan, true);
  assert.equal(await db.draft(), undefined);
  assert.equal(await db.lookDraft(), undefined);
  assert.equal((await db.storageUsage()).total, 0);
  await db.close();
});

test('unrelated drafts survive and modified related drafts invalidate confirmation', async () => {
  const db = database(),
    garment = await db.save(input, assets()),
    other = await db.save(input, assets()),
    pictures = assets();
  await db.saveDraft({
    id: 'current',
    input,
    original: pictures.original,
    mask: pictures.mask,
    editingId: other.id,
    step: 'image',
    savedAt: new Date().toISOString(),
  });
  const draft = {
    id: 'current' as const,
    input: look(garment.id),
    savedAt: new Date().toISOString(),
  };
  await db.saveLookDraft(draft);
  await db.changeTrash(garment.id, true);
  const plan = await db.garmentDeletionPlan(garment.id);
  await db.saveLookDraft({ ...draft, input: { ...draft.input, name: '修改草稿' } });
  await assert.rejects(() => db.purgeGarment(plan, true), /变化/);
  await db.saveLookDraft({ ...draft, input: look(other.id) });
  await db.purgeGarment(await db.garmentDeletionPlan(garment.id));
  assert.equal((await db.draft())?.editingId, other.id);
  assert.equal((await db.lookDraft())?.input.layers[0].garmentId, other.id);
  await db.close();
});

test('a failed permanent deletion rolls back metadata, photos, linked previews and drafts together', async () => {
  const db = database(),
    garment = await db.save(input, assets()),
    pictures = assets();
  const linked = await db.saveLook(look(garment.id), pictures.image);
  await db.saveLookDraft({
    id: 'current',
    input: look(garment.id),
    savedAt: new Date().toISOString(),
  });
  await db.changeTrash(garment.id, true);
  const plan = await db.garmentDeletionPlan(garment.id);
  const originalDelete = IDBObjectStore.prototype.delete;
  IDBObjectStore.prototype.delete = function (key) {
    if (this.name === 'assets' && key === `${garment.id}:mask`)
      throw new Error('Injected delete failure');
    return originalDelete.call(this, key);
  };
  try {
    await assert.rejects(() => db.purgeGarment(plan, true), /Injected/);
    assert.ok((await db.get(garment.id))?.deletedAt);
    for (const blob of Object.values(await db.assets(garment.id))) assert.ok(blob.size);
    assert.ok(await db.lookPreview(linked.id));
    assert.equal((await db.listLooks(true)).length, 1);
    assert.ok(await db.lookDraft());
  } finally {
    IDBObjectStore.prototype.delete = originalDelete;
    await db.close();
  }
});

test('image usage includes trash, image drafts and outfit previews; deleting lowers only related bytes', async () => {
  const db = database(),
    pictures = assets(),
    garment = await db.save(input, pictures),
    other = await db.save(input, pictures);
  await db.saveLook(look(other.id), pictures.image);
  await db.saveDraft({
    id: 'current',
    input,
    original: pictures.original,
    mask: pictures.mask,
    step: 'image',
    savedAt: new Date().toISOString(),
  });
  await db.changeTrash(garment.id, true);
  const before = await db.storageUsage();
  assert.deepEqual(before, {
    pictures: pictures.image.size * 8,
    drafts: pictures.image.size * 2,
    previews: pictures.image.size,
    total: pictures.image.size * 11,
  });
  await db.purgeGarment(await db.garmentDeletionPlan(garment.id));
  assert.equal((await db.storageUsage()).total, before.total - pictures.image.size * 4);
  await db.close();
});
