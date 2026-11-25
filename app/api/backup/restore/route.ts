import { route, authorize, json } from '../../../../lib/server/http';
import {
  listGarments,
  insertOutfits,
  savePreferences,
  bindings,
} from '../../../../lib/server/repository';
import { preferencesSchema } from '../../../../lib/validation/garment';
import { z } from 'zod';
export const POST = route(async (request) => {
  const owner = await authorize(request, true);
  const body = z
    .object({
      backupId: z.string().uuid(),
      outfits: z
        .array(
          z.object({
            id: z.string().max(120),
            garmentIds: z.array(z.string().max(120)).max(12),
            date: z.string().max(20),
            title: z.string().max(100),
            reason: z.string().max(1000),
            favorite: z.boolean(),
            worn: z.boolean(),
            createdAt: z.string().datetime(),
          }),
        )
        .max(500),
      preferences: preferencesSchema.optional(),
    })
    .parse(await request.json());
  const { db } = bindings();
  const { results } = await db
    .prepare('SELECT id,import_key FROM garments WHERE owner=? AND import_key LIKE ?')
    .bind(owner, `${body.backupId}:%`)
    .all<{ id: string; import_key: string }>();
  const mapping = new Map(results.map((g) => [g.import_key.slice(body.backupId.length + 1), g.id]));
  const ids = new Set((await listGarments(owner)).map((g) => g.id));
  let restored = 0;
  for (const o of body.outfits) {
    const garmentIds = o.garmentIds
      .map((id) => mapping.get(id))
      .filter((id): id is string => !!id && ids.has(id));
    if (garmentIds.length !== o.garmentIds.length) continue;
    const digest = new Uint8Array(
      await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(`${owner}:${body.backupId}:${o.id}`),
      ),
    );
    const id =
      'restore-' +
      [...digest]
        .map((v) => v.toString(16).padStart(2, '0'))
        .join('')
        .slice(0, 48);
    const existing = await db
      .prepare('SELECT id FROM outfits WHERE id=? AND owner=?')
      .bind(id, owner)
      .first();
    if (existing) continue;
    await insertOutfits(owner, [{ ...o, id, garmentIds }]);
    restored++;
  }
  if (body.preferences) await savePreferences(owner, body.preferences);
  return json({ restored });
});
