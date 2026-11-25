import type { Garment, GarmentInput } from '../../types/wardrobe';
export type AssetKind = 'original' | 'image' | 'thumbnail' | 'mask';
export const assetKinds: AssetKind[] = ['original', 'image', 'thumbnail', 'mask'];
export type LocalGarment = Omit<
  Garment,
  'imageUrl' | 'originalUrl' | 'thumbnailUrl' | 'maskUrl'
> & { deletedAt: string | null; importKey?: string };
export type AssetSet = Record<AssetKind, Blob>;
export type Draft = {
  id: 'current';
  input: GarmentInput;
  original: Blob;
  mask: Blob;
  editingId?: string;
  revision?: number;
  step: 'image' | 'tags';
  savedAt: string;
};
export type EditSession = {
  input: GarmentInput;
  original: HTMLCanvasElement;
  originalBlob: Blob;
  mask: HTMLCanvasElement;
  editingId?: string;
  revision?: number;
};
export type AppSettings = { autoProcess: boolean; lastBackup: string | null };
export const initialSettings: AppSettings = { autoProcess: true, lastBackup: null };
