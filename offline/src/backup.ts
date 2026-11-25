import { zip, unzipSync, strToU8, strFromU8 } from 'fflate';
import { garmentSchema } from '../../lib/validation/garment';
import type { WardrobeStore } from './store';
import { assetKinds, type AssetSet, type LocalGarment } from './types';
import { lookSchema, type LocalLook, type LookImport } from './looks-model';

const MiB = 1024 * 1024;
const PART_LIMIT = 48 * MiB;
type FileEntry = { path: string; sha256: string; type: string };
type BackupRecord = LocalGarment & { files: Record<string, FileEntry> };
type Manifest = {
  format: 'mori-offline';
  version: 2;
  backupId: string;
  exportedAt: string;
  part: number;
  parts: number;
  garments: BackupRecord[];
  looks: (LocalLook & { file: FileEntry; garmentRefs: Record<string, string> })[];
};
export async function sha256(bytes: Uint8Array) {
  return [
    ...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>)),
  ]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('');
}
const zipped = (files: Record<string, Uint8Array>) =>
  new Promise<Uint8Array<ArrayBuffer>>((resolve, reject) => {
    zip(files, { level: 0 }, (error, result) =>
      error ? reject(error) : resolve(result as Uint8Array<ArrayBuffer>),
    );
  });
export async function* exportParts(store: WardrobeStore, progress: (value: string) => void) {
  const records = await store.list(true);
  const looks = await store.listLooks(true);
  const groups: { garments: LocalGarment[]; looks: LocalLook[] }[] = [{ garments: [], looks: [] }];
  let size = 0;
  for (const record of records) {
    const assets = await store.assets(record.id);
    const bytes = Object.values(assets).reduce((s, b) => s + b.size, 0);
    if (bytes > PART_LIMIT) throw new Error(`“${record.name}”图片过大，请缩小图片后备份`);
    if (
      (size + bytes > PART_LIMIT || groups.at(-1)!.garments.length >= 1000) &&
      groups.at(-1)!.garments.length
    ) {
      groups.push({ garments: [], looks: [] });
      size = 0;
    }
    groups.at(-1)!.garments.push(record);
    size += bytes;
  }
  for (const look of looks) {
    const preview = await store.lookPreview(look.id);
    if (!preview) throw new Error('搭配预览缺失，备份未完成');
    const group = groups.at(-1)!;
    if (
      (size + preview.size > PART_LIMIT ||
        group.looks.length >= 1000 ||
        group.garments.length * 4 + group.looks.length >= 4999) &&
      (group.garments.length || group.looks.length)
    ) {
      groups.push({ garments: [], looks: [] });
      size = 0;
    }
    groups.at(-1)!.looks.push(look);
    size += preview.size;
  }
  const backupId = crypto.randomUUID();
  const exportedAt = new Date().toISOString();
  for (let part = 0; part < groups.length; part++) {
    const files: Record<string, Uint8Array> = {};
    const manifest: Manifest = {
      format: 'mori-offline',
      version: 2,
      backupId,
      exportedAt,
      part: part + 1,
      parts: groups.length,
      garments: [],
      looks: [],
    };
    for (const record of groups[part].garments) {
      progress(`正在打包第 ${part + 1}/${groups.length} 卷：${record.name}`);
      const entry: BackupRecord = { ...record, files: {} };
      const assets = await store.assets(record.id);
      for (const kind of assetKinds) {
        const blob = assets[kind];
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const path = `files/${record.id}/${kind}.${blob.type.includes('jpeg') ? 'jpg' : 'png'}`;
        files[path] = bytes;
        entry.files[kind] = { path, type: blob.type, sha256: await sha256(bytes) };
      }
      manifest.garments.push(entry);
    }
    for (const look of groups[part].looks) {
      const blob = (await store.lookPreview(look.id))!,
        bytes = new Uint8Array(await blob.arrayBuffer()),
        path = `looks/${look.id}/preview.png`,
        garmentRefs: Record<string, string> = {};
      for (const layer of look.layers) {
        const item = records.find((g) => g.id === layer.garmentId);
        if (!item) throw new Error('搭配引用的衣物缺失，请检查这套搭配');
        garmentRefs[item.id] = item.createdAt;
      }
      files[path] = bytes;
      manifest.looks.push({
        ...look,
        file: { path, type: blob.type, sha256: await sha256(bytes) },
        garmentRefs,
      });
    }
    files['manifest.json'] = strToU8(JSON.stringify(manifest));
    const bytes = await zipped(files);
    yield {
      blob: new Blob([bytes], { type: 'application/zip' }),
      name: `沐衣备份-${exportedAt.slice(0, 10)}-${part + 1}of${groups.length}.zip`,
      part: part + 1,
      parts: groups.length,
    };
  }
}
export async function inspectBackup(file: Blob) {
  if (!file.size || file.size > 96 * MiB)
    throw new Error('请选择 96MB 以内的沐衣备份文件；多卷备份请逐卷导入');
  let expanded = 0,
    count = 0;
  const files = unzipSync(new Uint8Array(await file.arrayBuffer()), {
    filter(entry) {
      expanded += entry.originalSize;
      count++;
      if (
        expanded > 100 * MiB ||
        entry.originalSize > (entry.name === 'manifest.json' ? 8 : 16) * MiB ||
        count > 5000
      )
        throw new Error('备份解压体积超出安全限制');
      return (
        entry.name === 'manifest.json' ||
        /^looks\/[a-f0-9-]{36}\/preview\.png$/.test(entry.name) ||
        /^files\/[a-zA-Z0-9-]+\/(original|image|thumbnail|mask)\.(jpg|png)$/.test(entry.name)
      );
    },
  });
  if (!files['manifest.json']) throw new Error('没有找到沐衣备份信息');
  const manifest = JSON.parse(strFromU8(files['manifest.json']));
  if (
    ![1, 2].includes(manifest.version) ||
    (manifest.format && manifest.format !== 'mori-offline') ||
    !/^[a-f0-9-]{36}$/.test(manifest.backupId) ||
    !Array.isArray(manifest.garments) ||
    manifest.garments.length > 1000
  )
    throw new Error('备份版本或结构不支持');
  if (!Number.isFinite(Date.parse(manifest.exportedAt))) throw new Error('备份时间无效');
  const entries: { record: LocalGarment; assets: AssetSet }[] = [];
  const looks: LookImport[] = [];
  const ids = new Set<string>();
  for (const value of manifest.garments) {
    const input = garmentSchema.parse(value);
    if (!/^[a-f0-9-]{36}$/.test(value.id) || ids.has(value.id))
      throw new Error('备份含有重复或无效的衣物编号');
    ids.add(value.id);
    if (!value.files || !value.files.original || !value.files.image || !value.files.thumbnail)
      throw new Error('备份缺少必要图片');
    const assets = {} as AssetSet;
    for (const kind of assetKinds) {
      const entry = value.files[kind] ?? (kind === 'mask' ? value.files.original : null);
      if (
        !entry ||
        !/^files\/[a-zA-Z0-9-]+\/(original|image|thumbnail|mask)\.(jpg|png)$/.test(entry.path) ||
        !['image/png', 'image/jpeg', 'image/webp'].includes(entry.type) ||
        !files[entry.path] ||
        (await sha256(files[entry.path])) !== entry.sha256
      )
        throw new Error('备份图片缺失或校验失败，未写入任何衣物');
      assets[kind] = new Blob([files[entry.path] as Uint8Array<ArrayBuffer>], { type: entry.type });
    }
    const createdAt = value.createdAt ?? manifest.exportedAt;
    const updatedAt = value.updatedAt ?? createdAt;
    if (
      !Number.isFinite(Date.parse(createdAt)) ||
      !Number.isFinite(Date.parse(updatedAt)) ||
      (value.deletedAt != null && !Number.isFinite(Date.parse(value.deletedAt)))
    )
      throw new Error('衣物时间信息无效');
    entries.push({
      record: {
        ...input,
        id: value.id,
        createdAt,
        updatedAt,
        revision: Number.isSafeInteger(value.revision) && value.revision > 0 ? value.revision : 1,
        deletedAt: value.deletedAt ?? null,
      },
      assets,
    });
  }
  if (manifest.format === 'mori-offline' && manifest.version === 2) {
    if (!Array.isArray(manifest.looks) || manifest.looks.length > 1000)
      throw new Error('搭配备份结构不支持');
    const lookIds = new Set<string>();
    for (const value of manifest.looks) {
      const data = lookSchema.parse(value),
        entry = value.file;
      if (
        !/^[a-f0-9-]{36}$/.test(value.id) ||
        lookIds.has(value.id) ||
        !Number.isFinite(Date.parse(value.createdAt)) ||
        !Number.isFinite(Date.parse(value.updatedAt)) ||
        (value.deletedAt != null && !Number.isFinite(Date.parse(value.deletedAt)))
      )
        throw new Error('搭配编号或时间无效');
      lookIds.add(value.id);
      if (
        !entry ||
        entry.path !== `looks/${value.id}/preview.png` ||
        !['image/png', 'image/jpeg'].includes(entry.type) ||
        !files[entry.path] ||
        files[entry.path].length > 4 * MiB ||
        (await sha256(files[entry.path])) !== entry.sha256
      )
        throw new Error('搭配图片校验失败，未恢复数据');
      const refs = value.garmentRefs;
      if (!refs || data.layers.some((l) => !Number.isFinite(Date.parse(refs[l.garmentId]))))
        throw new Error('搭配衣物引用无效');
      looks.push({
        record: {
          ...data,
          id: value.id,
          revision: Number.isSafeInteger(value.revision) && value.revision > 0 ? value.revision : 1,
          createdAt: value.createdAt,
          updatedAt: value.updatedAt,
          deletedAt: value.deletedAt ?? null,
        },
        preview: new Blob([files[entry.path] as Uint8Array<ArrayBuffer>], { type: entry.type }),
        garmentRefs: refs,
      });
    }
  }
  return {
    backupId: manifest.backupId as string,
    entries,
    looks,
    exportedAt: manifest.exportedAt as string,
    part: manifest.part ?? 1,
    parts: manifest.parts ?? 1,
    legacy: !manifest.format,
  };
}
