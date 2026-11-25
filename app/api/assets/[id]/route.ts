import { route, authorize, HttpError } from '../../../../lib/server/http';
import { bindings } from '../../../../lib/server/repository';
export const GET = route(async (request, ctx) => {
  const owner = await authorize(request);
  const { db, bucket } = bindings();
  const row = await db
    .prepare('SELECT key,content_type FROM assets WHERE id=? AND owner=?')
    .bind((await ctx.params).id, owner)
    .first<{ key: string; content_type: string }>();
  if (!row) throw new HttpError(404, '图片不存在');
  const object = await bucket.get(row.key);
  if (!object) throw new HttpError(404, '图片暂时不可用');
  return new Response(object.body, {
    headers: {
      'Content-Type': row.content_type,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
});
