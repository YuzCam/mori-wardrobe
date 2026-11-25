import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { garmentSchema } from '../../lib/validation/garment';
import type { GarmentInput } from '../../types/wardrobe';
import {
  assetKinds,
  initialSettings,
  type AssetKind,
  type AssetSet,
  type AppSettings,
  type Draft,
  type LocalGarment,
} from './types.ts';
import {
  lookSchema,
  type LookInput,
  type LocalLook,
  type LookImport,
  type LookDraft,
} from './looks-model.ts';

interface WardrobeDB extends DBSchema {
  garments: { key: string; value: LocalGarment; indexes: { 'by-import': string } };
  assets: { key: string; value: { key: string; blob: Blob } };
  drafts: { key: string; value: Draft };
  settings: { key: string; value: { key: string; value: AppSettings } };
  looks: { key: string; value: LocalLook; indexes: { 'by-import': string } };
  lookPreviews: { key: string; value: { id: string; blob: Blob } };
  lookDrafts: { key: string; value: LookDraft };
}
export interface GarmentDeletionPlan {
  id: string;
  revision: number;
  looks: { id: string; revision: number; name: string }[];
  lookDraft?: string;
}
function deletionPlan(
  item: LocalGarment,
  looks: LocalLook[],
  draft?: LookDraft,
): GarmentDeletionPlan {
  if (!item.deletedAt) throw new Error('请先将衣物移入回收站，再永久删除');
  const related = looks.filter((l) => l.layers.some((layer) => layer.garmentId === item.id));
  const relatedDraft =
    draft &&
    (draft.input.layers.some((l) => l.garmentId === item.id) ||
      related.some((l) => l.id === draft.editing?.id));
  return {
    id: item.id,
    revision: item.revision,
    looks: related.map(({ id, revision, name }) => ({ id, revision, name })),
    ...(relatedDraft ? { lookDraft: JSON.stringify(draft) } : {}),
  };
}
export class WardrobeStore {
  private db: Promise<IDBPDatabase<WardrobeDB>>;
  constructor(name = 'mori-offline-v1') {
    this.db = openDB<WardrobeDB>(name, 2, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore('garments', { keyPath: 'id' }).createIndex(
            'by-import',
            'importKey',
            {
              unique: true,
            },
          );
          db.createObjectStore('assets', { keyPath: 'key' });
          db.createObjectStore('drafts', { keyPath: 'id' });
          db.createObjectStore('settings', { keyPath: 'key' });
        }
        if (oldVersion < 2) {
          db.createObjectStore('looks', { keyPath: 'id' }).createIndex('by-import', 'importKey', {
            unique: true,
          });
          db.createObjectStore('lookPreviews', { keyPath: 'id' });
          db.createObjectStore('lookDrafts', { keyPath: 'id' });
        }
      },
      blocked() {
        window.dispatchEvent(new CustomEvent('mori-storage-blocked'));
      },
    });
    // Keep a failed open observable to the UI without an unhandled rejection.
    this.db.catch(() => {});
  }
  async list(includeDeleted = false) {
    return (await (await this.db).getAll('garments'))
      .filter((g) => includeDeleted || !g.deletedAt)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async get(id: string) {
    return (await this.db).get('garments', id);
  }
  async asset(id: string, kind: AssetKind) {
    return (await (await this.db).get('assets', `${id}:${kind}`))?.blob;
  }
  async assets(id: string): Promise<AssetSet> {
    const entries = await Promise.all(
      assetKinds.map(async (kind) => {
        const blob = await this.asset(id, kind);
        if (!blob) throw new Error('这件衣物的图片不完整，请从备份恢复');
        return [kind, blob];
      }),
    );
    return Object.fromEntries(entries) as AssetSet;
  }
  async save(
    input: GarmentInput,
    assets: AssetSet,
    editing?: { id: string; revision: number },
  ): Promise<LocalGarment> {
    const data = garmentSchema.parse(input);
    for (const kind of assetKinds)
      if (!(assets[kind] instanceof Blob) || !assets[kind].size)
        throw new Error('衣物图片尚未准备完成');
    const db = await this.db;
    const tx = db.transaction(['garments', 'assets', 'drafts'], 'readwrite');
    const old = editing ? await tx.objectStore('garments').get(editing.id) : undefined;
    if (editing && (!old || old.deletedAt || old.revision !== editing.revision)) {
      tx.abort();
      await tx.done.catch(() => {});
      throw new Error('这件衣物已发生变化，请关闭编辑后重新打开');
    }
    const now = new Date().toISOString();
    const record: LocalGarment = {
      ...data,
      id: old?.id ?? crypto.randomUUID(),
      revision: (old?.revision ?? 0) + 1,
      createdAt: old?.createdAt ?? now,
      updatedAt: now,
      deletedAt: null,
      ...(old?.importKey ? { importKey: old.importKey } : {}),
    };
    await tx.objectStore('garments').put(record);
    for (const kind of assetKinds)
      await tx.objectStore('assets').put({ key: `${record.id}:${kind}`, blob: assets[kind] });
    await tx.objectStore('drafts').delete('current');
    await tx.done;
    return record;
  }
  async changeTrash(id: string, trash: boolean) {
    const db = await this.db;
    const tx = db.transaction('garments', 'readwrite');
    const item = await tx.store.get(id);
    if (!item) {
      tx.abort();
      await tx.done.catch(() => {});
      throw new Error('这件衣物不存在');
    }
    await tx.store.put({
      ...item,
      deletedAt: trash ? new Date().toISOString() : null,
      revision: item.revision + 1,
      updatedAt: new Date().toISOString(),
    });
    await tx.done;
  }
  async garmentDeletionPlan(id: string): Promise<GarmentDeletionPlan> {
    const tx = (await this.db).transaction(['garments', 'looks', 'lookDrafts']);
    const [item, looks, draft] = await Promise.all([
      tx.objectStore('garments').get(id),
      tx.objectStore('looks').getAll(),
      tx.objectStore('lookDrafts').get('current'),
    ]);
    await tx.done;
    if (!item) throw new Error('这件衣物不存在');
    return deletionPlan(item, looks, draft);
  }
  async purgeGarment(plan: GarmentDeletionPlan, deleteLinked = false) {
    const tx = (await this.db).transaction(
      ['garments', 'assets', 'drafts', 'looks', 'lookPreviews', 'lookDrafts'],
      'readwrite',
    );
    try {
      const item = await tx.objectStore('garments').get(plan.id);
      if (!item) throw new Error('这件衣物不存在');
      const current = deletionPlan(
        item,
        await tx.objectStore('looks').getAll(),
        await tx.objectStore('lookDrafts').get('current'),
      );
      if (JSON.stringify(current) !== JSON.stringify(plan))
        throw new Error('衣物或关联搭配已变化，请取消后重新打开删除确认');
      if ((current.looks.length || current.lookDraft) && !deleteLinked)
        throw new Error('请先解除搭配关联，或明确确认同时删除关联搭配');
      for (const look of current.looks) {
        await tx.objectStore('looks').delete(look.id);
        await tx.objectStore('lookPreviews').delete(look.id);
      }
      if (current.lookDraft) await tx.objectStore('lookDrafts').delete('current');
      const draft = await tx.objectStore('drafts').get('current');
      if (draft?.editingId === plan.id) await tx.objectStore('drafts').delete('current');
      for (const kind of assetKinds) await tx.objectStore('assets').delete(`${plan.id}:${kind}`);
      await tx.objectStore('garments').delete(plan.id);
      await tx.done;
    } catch (error) {
      try {
        tx.abort();
      } catch {}
      await tx.done.catch(() => {});
      throw error;
    }
  }
  async storageUsage() {
    const tx = (await this.db).transaction(['assets', 'drafts', 'lookPreviews']);
    let pictures = 0,
      drafts = 0,
      previews = 0;
    // Walk blob records individually, without retaining every photo in memory.
    for (const name of ['assets', 'lookPreviews'] as const) {
      let cursor = await tx.objectStore(name).openCursor();
      while (cursor) {
        if (name === 'assets') pictures += cursor.value.blob.size;
        else previews += cursor.value.blob.size;
        cursor = await cursor.continue();
      }
    }
    const draft = await tx.objectStore('drafts').get('current');
    if (draft) drafts = draft.original.size + draft.mask.size;
    await tx.done;
    return { pictures, drafts, previews, total: pictures + drafts + previews };
  }
  async draft() {
    return (await this.db).get('drafts', 'current');
  }
  async saveDraft(draft: Draft) {
    await (await this.db).put('drafts', draft);
  }
  async clearDraft() {
    await (await this.db).delete('drafts', 'current');
  }
  async settings(): Promise<AppSettings> {
    return (await (await this.db).get('settings', 'app'))?.value ?? { ...initialSettings };
  }
  async saveSettings(value: AppSettings) {
    await (await this.db).put('settings', { key: 'app', value });
  }
  async listLooks(includeDeleted = false) {
    return (await (await this.db).getAll('looks'))
      .filter((l) => includeDeleted || !l.deletedAt)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async lookDraft() {
    return (await this.db).get('lookDrafts', 'current');
  }
  async saveLookDraft(draft: LookDraft) {
    await (await this.db).put('lookDrafts', draft);
  }
  async clearLookDraft() {
    await (await this.db).delete('lookDrafts', 'current');
  }
  async lookPreview(id: string) {
    return (await (await this.db).get('lookPreviews', id))?.blob;
  }
  async saveLook(input: LookInput, preview: Blob, editing?: { id: string; revision: number }) {
    const data = lookSchema.parse(input);
    if (!(preview instanceof Blob) || !preview.size || preview.size > 4 * 1024 * 1024)
      throw new Error('搭配预览尚未准备好');
    const db = await this.db,
      tx = db.transaction(['garments', 'looks', 'lookPreviews', 'lookDrafts'], 'readwrite');
    try {
      for (const layer of data.layers) {
        const g = await tx.objectStore('garments').get(layer.garmentId);
        if (!g || g.deletedAt) throw new Error('部分衣物已被收起，请先移除它们或放回衣橱');
      }
      const old = editing ? await tx.objectStore('looks').get(editing.id) : undefined;
      if (editing && (!old || old.deletedAt || old.revision !== editing.revision))
        throw new Error('这套搭配已发生变化，请重新打开');
      const now = new Date().toISOString();
      const record: LocalLook = {
        ...data,
        id: old?.id ?? crypto.randomUUID(),
        revision: (old?.revision ?? 0) + 1,
        createdAt: old?.createdAt ?? now,
        updatedAt: now,
        deletedAt: null,
        ...(old?.importKey ? { importKey: old.importKey } : {}),
      };
      await tx.objectStore('looks').put(record);
      await tx.objectStore('lookPreviews').put({ id: record.id, blob: preview });
      await tx.objectStore('lookDrafts').delete('current');
      await tx.done;
      return record;
    } catch (error) {
      try {
        tx.abort();
      } catch {}
      await tx.done.catch(() => {});
      throw error;
    }
  }
  async changeLookTrash(id: string, trash: boolean) {
    const db = await this.db,
      tx = db.transaction('looks', 'readwrite'),
      look = await tx.store.get(id);
    if (!look) {
      tx.abort();
      await tx.done.catch(() => {});
      throw new Error('没有找到这套搭配');
    }
    await tx.store.put({
      ...look,
      deletedAt: trash ? new Date().toISOString() : null,
      updatedAt: new Date().toISOString(),
      revision: look.revision + 1,
    });
    await tx.done;
  }
  async restore(
    entries: { record: LocalGarment; assets: AssetSet }[],
    backupId: string,
    looks: LookImport[] = [],
  ) {
    const db = await this.db;
    const tx = db.transaction(['garments', 'assets', 'looks', 'lookPreviews'], 'readwrite');
    let restored = 0,
      skipped = 0;
    try {
      // Append only: importing never overwrites a user's newer local edits.
      for (const { record, assets } of entries) {
        const importKey = `${backupId}:${record.id}`;
        const prior = await tx.objectStore('garments').index('by-import').get(importKey);
        const existing = await tx.objectStore('garments').get(record.id);
        if (
          prior ||
          (existing &&
            existing.createdAt === record.createdAt &&
            existing.updatedAt >= record.updatedAt)
        ) {
          skipped++;
          continue;
        }
        const id = existing ? crypto.randomUUID() : record.id;
        await tx.objectStore('garments').put({ ...record, id, importKey });
        for (const kind of assetKinds)
          await tx.objectStore('assets').put({ key: `${id}:${kind}`, blob: assets[kind] });
        restored++;
      }
      for (const { record, preview, garmentRefs } of looks) {
        const importKey = `${backupId}:${record.id}`;
        const prior = await tx.objectStore('looks').index('by-import').get(importKey),
          existing = await tx.objectStore('looks').get(record.id);
        if (
          prior ||
          (existing &&
            existing.createdAt === record.createdAt &&
            existing.updatedAt >= record.updatedAt)
        )
          continue;
        const layers = [];
        for (const layer of record.layers) {
          const mapped = await tx
            .objectStore('garments')
            .index('by-import')
            .get(`${backupId}:${layer.garmentId}`);
          const candidate = mapped ?? (await tx.objectStore('garments').get(layer.garmentId));
          if (!candidate || candidate.createdAt !== garmentRefs[layer.garmentId])
            throw new Error('请先按顺序恢复所有衣物分卷，再恢复搭配分卷');
          layers.push({ ...layer, garmentId: candidate.id });
        }
        const id = existing ? crypto.randomUUID() : record.id;
        await tx.objectStore('looks').put({ ...record, id, layers, importKey });
        await tx.objectStore('lookPreviews').put({ id, blob: preview });
      }
      await tx.done;
      return { restored, skipped };
    } catch (error) {
      // A synchronous clone/write failure does not automatically abort IDB.
      try {
        tx.abort();
      } catch {}
      await tx.done.catch(() => {});
      throw error;
    }
  }
  async close() {
    (await this.db).close();
  }
}
export const readableError = (error: unknown): string => {
  if (error instanceof DOMException && /Quota|UnknownError/.test(error.name))
    return '本机存储空间不足，保存未完成。请腾出空间后重试，原有衣物不会被覆盖。';
  if (error instanceof Error) {
    if (error.name === 'ZodError') {
      try {
        return JSON.parse(error.message)[0].message;
      } catch {}
    }
    return error.message;
  }
  return '操作未完成，请重试';
};
