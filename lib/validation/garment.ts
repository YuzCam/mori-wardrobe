import { z } from 'zod';
import { categories, colors, customColor, styles } from '../../config/taxonomy';
import { detailedCategories } from '../../config/clothing';
const list = (ids: string[], max: number) =>
  z
    .array(z.string().refine((v) => ids.includes(v), '未知标签'))
    .max(max)
    .transform((v) => [...new Set(v)]);
export const garmentSchema = z
  .object({
    name: z.string().trim().min(1, '给这件衣服起个名字吧').max(80),
    category: z.enum([
      'top',
      'outerwear',
      'camisole',
      'trousers',
      'skirt',
      'dress',
      'suit',
      'shoes',
      'bag',
      'accessory',
    ]),
    subcategory: z.enum(detailedCategories.map((d) => d.id) as [string, ...string[]]).optional(),
    seasons: z
      .array(z.enum(['summer', 'winter', 'spring-autumn']))
      .min(1, '请选择适用季节')
      .max(3)
      .transform((v) => [...new Set(v)]),
    colors: z
      .array(z.string().refine((v) => colors.some((c) => c.id === v) || customColor(v), '未知色系'))
      .min(1, '请选择色系')
      .max(3)
      .transform((v) => [...new Set(v.map((x) => (customColor(x) ? x.toLowerCase() : x)))]),
    styles: list(
      styles.map((x) => x.id),
      4,
    ),
    notes: z.string().max(1000).default(''),
    warmth: z.number().int().min(0).max(3),
    recipe: z.object({
      brightness: z.number().min(50).max(150),
      contrast: z.number().min(50).max(150),
      background: z.string().regex(/^#[a-fA-F0-9]{6}$/),
      rotation: z.number().min(-360).max(360),
      crop: z
        .object({
          x: z.number().min(0).max(1),
          y: z.number().min(0).max(1),
          width: z.number().min(0.01).max(1),
          height: z.number().min(0.01).max(1),
        })
        .nullable(),
    }),
    recognition: z
      .object({
        model: z.string().max(180),
        categoryCandidates: z
          .array(
            z.object({
              label: z.enum(categories.map((x) => x.id) as ['top', ...'top'[]]),
              score: z.number().finite(),
            }),
          )
          .max(10),
        styleCandidates: z
          .array(z.object({ label: z.string().max(40), score: z.number().finite() }))
          .max(10),
        source: z.enum(['model', 'manual']),
        confirmed: z.boolean(),
      })
      .nullable(),
  })
  .refine(
    (v) =>
      !v.subcategory ||
      detailedCategories.some((d) => d.id === v.subcategory && d.category === v.category),
    { message: '细分类与品类不一致，请重新选择', path: ['subcategory'] },
  );
export const preferencesSchema = z.object({
  city: z.string().max(80),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
  timezone: z.string().refine((v) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: v });
      return true;
    } catch {
      return false;
    }
  }),
  season: z.enum(['summer', 'winter']),
  theme: z.enum(['seasonal', 'summer', 'winter']),
});
