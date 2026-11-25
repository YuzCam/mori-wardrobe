import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { api, post } from '../../lib/client/api';
import { garmentSchema, preferencesSchema } from '../../lib/validation/garment';
import type { Garment, Outfit, Preferences } from '../../types/wardrobe';
export type BackupManifest = {
  version: 1;
  backupId: string;
  exportedAt: string;
  garments: (Garment & { files: Record<string, { path: string; sha256: string; type: string }> })[];
  outfits: Outfit[];
  preferences: Preferences;
};
async function sha(bytes: Uint8Array) {
  const value = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>);
  return [...new Uint8Array(value)].map((v) => v.toString(16).padStart(2, '0')).join('');
}
export async function exportBackup(progress: (text: string) => void) {
  const data = await api<{ garments: Garment[]; outfits: Outfit[]; preferences: Preferences }>(
    '/api/backup',
  );
  const files: Record<string, Uint8Array> = {};
  let bytes = 0;
  const manifest: BackupManifest = {
    ...data,
    version: 1,
    backupId: crypto.randomUUID(),
    exportedAt: new Date().toISOString(),
    garments: [],
  };
  for (let i = 0; i < data.garments.length; i++) {
    const g = data.garments[i];
    progress(`正在收好第 ${i + 1} / ${data.garments.length} 件衣物`);
    const entry: BackupManifest['garments'][number] = { ...g, files: {} };
    for (const [kind, url] of Object.entries({
      original: g.originalUrl,
      image: g.imageUrl,
      thumbnail: g.thumbnailUrl,
      mask: g.maskUrl,
    })) {
      if (!url) continue;
      const r = await fetch(url);
      if (!r.ok) throw new Error('有图片未能下载，本次备份未完成，请重试');
      const b = new Uint8Array(await r.arrayBuffer());
      bytes += b.length;
      if (bytes > 80 * 1024 * 1024)
        throw new Error('衣橱图片超过当前单次 80MB 备份上限，请先联系维护者启用分卷导出');
      const type = r.headers.get('content-type') ?? 'image/png';
      const path = `files/${g.id}/${kind}.${type.includes('jpeg') ? 'jpg' : 'png'}`;
      files[path] = b;
      entry.files[kind] = { path, sha256: await sha(b), type };
    }
    manifest.garments.push(entry);
  }
  files['manifest.json'] = strToU8(JSON.stringify(manifest));
  progress('正在生成备份文件');
  const zipped = zipSync(files, { level: 0 });
  const url = URL.createObjectURL(
    new Blob([zipped as Uint8Array<ArrayBuffer>], { type: 'application/zip' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = `沐衣-完整备份-${new Date().toISOString().slice(0, 10)}.zip`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
export async function inspectBackup(file: File) {
  if (file.size > 90 * 1024 * 1024) throw new Error('备份文件过大，当前支持 90MB 以内的备份');
  let total = 0;
  const files = unzipSync(new Uint8Array(await file.arrayBuffer()), {
    filter: (f) => {
      total += f.originalSize;
      if (f.originalSize > 8 * 1024 * 1024 || total > 100 * 1024 * 1024)
        throw new Error('备份解压体积超出限制');
      return (
        f.name === 'manifest.json' ||
        /^files\/[a-zA-Z0-9-]+\/(original|image|thumbnail|mask)\.(jpg|png)$/.test(f.name)
      );
    },
  });
  if (!files['manifest.json']) throw new Error('不是有效的沐衣备份文件');
  const manifest = JSON.parse(strFromU8(files['manifest.json'])) as BackupManifest;
  if (
    manifest.version !== 1 ||
    !/^[a-f0-9-]{36}$/.test(manifest.backupId) ||
    !Array.isArray(manifest.garments) ||
    manifest.garments.length > 500 ||
    !Array.isArray(manifest.outfits) ||
    manifest.outfits.length > 500
  )
    throw new Error('备份版本或结构不支持');
  preferencesSchema.parse(manifest.preferences);
  for (const g of manifest.garments) {
    garmentSchema.parse(g);
    if (!g.id || typeof g.files !== 'object') throw new Error('备份信息不完整');
    for (const kind of ['original', 'image', 'thumbnail'])
      if (!g.files[kind]) throw new Error('备份缺少必要图片');
    for (const entry of Object.values(g.files)) {
      if (!files[entry.path] || (await sha(files[entry.path])) !== entry.sha256)
        throw new Error('备份中的图片缺失或校验不一致');
    }
  }
  return { manifest, files };
}
export async function importBackup(
  backup: Awaited<ReturnType<typeof inspectBackup>>,
  restorePreferences: boolean,
  progress: (text: string) => void,
) {
  let completed = 0;
  try {
    for (const g of backup.manifest.garments) {
      progress(`正在恢复第 ${completed + 1} / ${backup.manifest.garments.length} 件衣物`);
      const form = new FormData();
      form.set('metadata', JSON.stringify(garmentSchema.parse(g)));
      form.set('importKey', `${backup.manifest.backupId}:${g.id}`);
      form.set('restoreCreatedAt', g.createdAt);
      for (const [kind, entry] of Object.entries(g.files))
        form.set(
          kind,
          new Blob([backup.files[entry.path] as Uint8Array<ArrayBuffer>], { type: entry.type }),
          entry.path.split('/').pop(),
        );
      await api('/api/garments', { method: 'POST', body: form });
      completed++;
    }
    await post('/api/backup/restore', {
      backupId: backup.manifest.backupId,
      outfits: backup.manifest.outfits,
      preferences: restorePreferences ? backup.manifest.preferences : undefined,
    });
  } catch (error) {
    throw new Error(
      `已完成 ${completed} 件。${(error as Error).message}；可用同一个备份重试，已恢复的衣物不会重复添加。`,
    );
  }
}
