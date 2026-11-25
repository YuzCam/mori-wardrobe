import { z } from 'zod';
export const lookSchema = z
  .object({
    name: z.string().trim().min(1, '给这套搭配起个名字吧').max(80),
    notes: z.string().max(1000).default(''),
    background: z.string().regex(/^#[0-9a-f]{6}$/i),
    layers: z
      .array(
        z.object({
          garmentId: z.string().uuid(),
          x: z.number().finite().min(0).max(95),
          y: z.number().finite().min(0).max(95),
          width: z.number().finite().min(10).max(100),
          rotation: z.number().finite().min(-180).max(180),
        }),
      )
      .min(1, '先选择一件衣物吧')
      .max(12, '每套搭配最多12件衣物'),
  })
  .refine(
    (v) => new Set(v.layers.map((l) => l.garmentId)).size === v.layers.length,
    '同件衣物不能重复加入',
  );
export type LookInput = z.infer<typeof lookSchema>;
export type LocalLook = LookInput & {
  id: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  importKey?: string;
};
export type LookImport = { record: LocalLook; preview: Blob; garmentRefs: Record<string, string> };
export type LookDraft = {
  id: 'current';
  input: LookInput;
  editing?: { id: string; revision: number };
  savedAt: string;
};
