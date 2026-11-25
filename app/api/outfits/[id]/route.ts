import { route, authorize, json, HttpError } from '../../../../lib/server/http';
import { bindings, listOutfits, listGarments } from '../../../../lib/server/repository';
import { z } from 'zod';
export const PATCH = route(async (request, ctx) => {
  const owner = await authorize(request, true);
  const id = (await ctx.params).id;
  const body = z
    .object({ favorite: z.boolean().optional(), worn: z.boolean().optional() })
    .parse(await request.json());
  const item = (await listOutfits(owner)).find((o) => o.id === id);
  if (!item) throw new HttpError(404, '搭配不存在');
  const ids = new Set((await listGarments(owner)).map((g) => g.id));
  if (!item.garmentIds.every((id) => ids.has(id)))
    throw new HttpError(409, '搭配中的衣物已变化，请重新生成');
  const next = {
    ...item,
    ...body,
    ...(body.worn === true
      ? { wornAt: new Date().toISOString() }
      : body.worn === false
        ? { wornAt: undefined }
        : {}),
  };
  const { db } = bindings();
  await db
    .prepare('UPDATE outfits SET data=?,favorite=?,worn=? WHERE id=? AND owner=?')
    .bind(JSON.stringify(next), next.favorite ? 1 : 0, next.worn ? 1 : 0, id, owner)
    .run();
  return json(next);
});
