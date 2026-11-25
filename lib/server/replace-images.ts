import type { Garment, GarmentInput } from '../../types/wardrobe';
import { bindings } from './repository';
import { HttpError } from './http';
export async function replaceImages(
  owner: string,
  current: Garment,
  input: GarmentInput,
  files: { original: File; image: File; thumbnail: File; mask: File | null },
) {
  const { db, bucket } = bindings();
  const id = current.id;
  const stored: { id: string; key: string; kind: string; file: File }[] = [];
  let committed = false;
  const { results: old } = await db
    .prepare('SELECT id,key FROM assets WHERE garment_id=? AND owner=?')
    .bind(id, owner)
    .all<{ id: string; key: string }>();
  const next = {
    ...current,
    ...input,
    revision: current.revision + 1,
    updatedAt: new Date().toISOString(),
  };
  try {
    for (const [kind, file] of Object.entries(files)) {
      if (!file) continue;
      const assetId = crypto.randomUUID(),
        key = `${owner}/${id}/${assetId}`;
      await bucket.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
      stored.push({ id: assetId, key, kind, file });
      (next as any)[
        kind === 'image'
          ? 'imageUrl'
          : kind === 'original'
            ? 'originalUrl'
            : kind === 'thumbnail'
              ? 'thumbnailUrl'
              : 'maskUrl'
      ] = `/api/assets/${assetId}`;
    }
    const results = await db.batch([
      db
        .prepare(
          'UPDATE garments SET name=?,category=?,data=?,revision=revision+1,updated_at=? WHERE id=? AND owner=? AND revision=?',
        )
        .bind(
          next.name,
          next.category,
          JSON.stringify(next),
          next.updatedAt,
          id,
          owner,
          current.revision,
        ),
      ...stored.map((a) =>
        db
          .prepare(
            'INSERT INTO assets(id,owner,garment_id,kind,key,content_type,size) VALUES(?,?,?,?,?,?,?)',
          )
          .bind(a.id, owner, id, a.kind, a.key, a.file.type, a.file.size),
      ),
    ]);
    if (!results[0].meta.changes)
      throw new HttpError(409, '这件衣物已在另一台设备修改，请重新打开后再编辑');
    committed = true;
    if (old.length)
      await db
        .batch(
          old.map((a) => db.prepare('DELETE FROM assets WHERE id=? AND owner=?').bind(a.id, owner)),
        )
        .catch(() => console.error('[wardrobe] old asset metadata cleanup deferred'));
    await Promise.allSettled(old.map((a) => bucket.delete(a.key)));
    return next;
  } catch (error) {
    if (!committed) {
      if (stored.length)
        await db
          .batch(
            stored.map((a) =>
              db.prepare('DELETE FROM assets WHERE id=? AND owner=?').bind(a.id, owner),
            ),
          )
          .catch(() => {});
      await Promise.allSettled(stored.map((a) => bucket.delete(a.key)));
    }
    throw error;
  }
}
