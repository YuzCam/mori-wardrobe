import { openDB } from 'idb';
import type { EditRecipe, GarmentInput } from '../../types/wardrobe';
export type UploadDraft = {
  id: string;
  original: Blob;
  mask: Blob | null;
  recipe: EditRecipe;
  input: GarmentInput;
  step: number;
  savedAt: string;
  editingId?: string;
  revision?: number;
};
const db = () =>
  openDB('mori-private-drafts', 1, {
    upgrade(db) {
      db.createObjectStore('drafts');
    },
  });
export async function saveDraft(owner: string, draft: UploadDraft) {
  const database = await db();
  await database.put('drafts', draft, owner);
}
export async function loadDraft(owner: string): Promise<UploadDraft | undefined> {
  return (await db()).get('drafts', owner);
}
export async function clearDraft(owner: string) {
  await (await db()).delete('drafts', owner);
}
export async function clearPrivateData() {
  await (await db()).clear('drafts');
  for (const key of Object.keys(localStorage))
    if (key.startsWith('mori:')) localStorage.removeItem(key);
}
