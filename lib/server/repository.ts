import { env } from 'cloudflare:workers';
import type { Garment, GarmentInput, Outfit, Preferences } from '../../types/wardrobe';
import { defaultPreferences } from '../../types/wardrobe';
import { HttpError } from './http';
export function bindings() {
  if (!env.DB || !env.BUCKET) throw new HttpError(503, '衣橱存储正在准备中，请稍后重试');
  return { db: env.DB, bucket: env.BUCKET };
}
export function rowToGarment(row: any): Garment {
  return {
    ...JSON.parse(row.data),
    id: row.id,
    name: row.name,
    category: row.category,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
export async function listGarments(owner: string): Promise<Garment[]> {
  const { db } = bindings();
  const { results } = await db
    .prepare('SELECT * FROM garments WHERE owner = ? ORDER BY created_at DESC')
    .bind(owner)
    .all();
  return results.map(rowToGarment);
}
export async function findGarment(owner: string, id: string) {
  const { db } = bindings();
  const row = await db
    .prepare('SELECT * FROM garments WHERE id = ? AND owner = ?')
    .bind(id, owner)
    .first();
  if (!row) throw new HttpError(404, '这件衣物不存在或已被删除');
  return rowToGarment(row);
}
export async function getPreferences(owner: string): Promise<Preferences> {
  const { db } = bindings();
  const row = await db
    .prepare('SELECT data FROM preferences WHERE owner = ?')
    .bind(owner)
    .first<{ data: string }>();
  return row ? { ...defaultPreferences, ...JSON.parse(row.data) } : defaultPreferences;
}
export async function savePreferences(owner: string, value: Preferences) {
  const { db } = bindings();
  await db
    .prepare(
      'INSERT INTO preferences(owner, data) VALUES(?, ?) ON CONFLICT(owner) DO UPDATE SET data = excluded.data',
    )
    .bind(owner, JSON.stringify(value))
    .run();
}
export async function listOutfits(owner: string): Promise<Outfit[]> {
  const { db } = bindings();
  const { results } = await db
    .prepare('SELECT * FROM outfits WHERE owner = ? ORDER BY created_at DESC LIMIT 200')
    .bind(owner)
    .all<any>();
  return results.map((row) => ({
    ...JSON.parse(row.data),
    id: row.id,
    favorite: !!row.favorite,
    worn: !!row.worn,
    createdAt: row.created_at,
  }));
}
export async function insertOutfits(owner: string, outfits: Outfit[]) {
  const { db } = bindings();
  if (!outfits.length) return;
  await db.batch(
    outfits.map((o) =>
      db
        .prepare(
          'INSERT INTO outfits(id,owner,date,data,favorite,worn,created_at) VALUES(?,?,?,?,?,?,?)',
        )
        .bind(
          o.id,
          owner,
          o.date,
          JSON.stringify(o),
          o.favorite ? 1 : 0,
          o.worn ? 1 : 0,
          o.createdAt,
        ),
    ),
  );
}
export async function imageFile(
  file: FormDataEntryValue | null,
  required: boolean,
): Promise<File | null> {
  if (!file || typeof file === 'string') {
    if (required) throw new HttpError(400, '缺少衣物图片');
    return null;
  }
  if (!file.size || file.size > 8 * 1024 * 1024)
    throw new HttpError(413, '处理后的单张图片不能超过 8MB');
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const png = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71;
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp =
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  if (!(png || jpeg || webp)) throw new HttpError(415, '请选择 JPEG、PNG 或 WebP 图片');
  const mime = png ? 'image/png' : jpeg ? 'image/jpeg' : 'image/webp';
  if (file.type !== mime) throw new HttpError(415, '图片内容与文件格式不一致');
  return file;
}
export async function createGarment(
  owner: string,
  input: GarmentInput,
  files: { original: File; image: File; thumbnail: File; mask?: File | null },
  importKey?: string,
  restoreCreatedAt?: string,
) {
  const { db, bucket } = bindings();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const createdAt =
    restoreCreatedAt && Number.isFinite(Date.parse(restoreCreatedAt))
      ? new Date(restoreCreatedAt).toISOString()
      : now;
  if (importKey) {
    const existing = await db
      .prepare('SELECT * FROM garments WHERE owner=? AND import_key=?')
      .bind(owner, importKey)
      .first();
    if (existing) return rowToGarment(existing);
  }
  const stored: { id: string; key: string; kind: string; file: File }[] = [];
  const data: any = { ...input };
  try {
    for (const [kind, file] of Object.entries(files)) {
      if (!file) continue;
      const assetId = crypto.randomUUID();
      const key = `${owner}/${id}/${assetId}`;
      await bucket.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
      stored.push({ id: assetId, key, kind, file });
      data[
        kind === 'image'
          ? 'imageUrl'
          : kind === 'original'
            ? 'originalUrl'
            : kind === 'mask'
              ? 'maskUrl'
              : 'thumbnailUrl'
      ] = `/api/assets/${assetId}`;
    }
    const statements = [
      db
        .prepare(
          'INSERT INTO garments(id,owner,name,category,data,import_key,revision,created_at,updated_at) VALUES(?,?,?,?,?,?,1,?,?)',
        )
        .bind(
          id,
          owner,
          input.name,
          input.category,
          JSON.stringify(data),
          importKey ?? null,
          createdAt,
          now,
        ),
      ...stored.map((a) =>
        db
          .prepare(
            'INSERT INTO assets(id,owner,garment_id,kind,key,content_type,size) VALUES(?,?,?,?,?,?,?)',
          )
          .bind(a.id, owner, id, a.kind, a.key, a.file.type, a.file.size),
      ),
    ];
    if (input.recognition)
      statements.push(
        db
          .prepare(
            'INSERT INTO recognition_runs(id,garment_id,owner,data,created_at) VALUES(?,?,?,?,?)',
          )
          .bind(crypto.randomUUID(), id, owner, JSON.stringify(input.recognition), now),
      );
    await db.batch(statements);
    return { ...data, id, revision: 1, createdAt, updatedAt: now } as Garment;
  } catch (error) {
    await Promise.allSettled(stored.map((a) => bucket.delete(a.key)));
    throw error;
  }
}
