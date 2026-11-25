import { route, authorize, json, HttpError } from '../../../../lib/server/http';
import { bindings, findGarment, imageFile } from '../../../../lib/server/repository';
import { replaceImages } from '../../../../lib/server/replace-images';
import { garmentSchema } from '../../../../lib/validation/garment';
export const GET = route(async (request, ctx) =>
  json(await findGarment(await authorize(request), (await ctx.params).id)),
);
export const PATCH = route(async (request, ctx) => {
  const owner = await authorize(request, true);
  const id = (await ctx.params).id;
  const current = await findGarment(owner, id);
  if (request.headers.get('content-type')?.includes('multipart/form-data')) {
    if (Number(request.headers.get('content-length')) > 24 * 1024 * 1024)
      throw new HttpError(413, '图片过大，请缩小后再试');
    const form = await request.formData();
    let body;
    try {
      body = JSON.parse(String(form.get('metadata')));
    } catch {
      throw new HttpError(400, '衣物信息不完整');
    }
    if (body.revision !== current.revision)
      throw new HttpError(409, '这件衣物已在另一台设备修改，请重新打开后编辑');
    return json(
      await replaceImages(owner, current, garmentSchema.parse(body), {
        original: (await imageFile(form.get('original'), true))!,
        image: (await imageFile(form.get('image'), true))!,
        thumbnail: (await imageFile(form.get('thumbnail'), true))!,
        mask: await imageFile(form.get('mask'), false),
      }),
    );
  }
  const body = (await request.json()) as any;
  if (body.revision !== current.revision)
    throw new HttpError(409, '这件衣物已在另一台设备修改，请刷新后重试');
  const input = garmentSchema.parse(body);
  const next = {
    ...current,
    ...input,
    revision: current.revision + 1,
    updatedAt: new Date().toISOString(),
  };
  const { db } = bindings();
  const result = await db
    .prepare(
      'UPDATE garments SET name=?, category=?, data=?, revision=revision+1, updated_at=? WHERE id=? AND owner=? AND revision=?',
    )
    .bind(
      next.name,
      next.category,
      JSON.stringify(next),
      next.updatedAt,
      id,
      owner,
      current.revision,
    )
    .run();
  if (!result.meta.changes) throw new HttpError(409, '检测到同时修改，请刷新后重试');
  return json(next);
});
export const DELETE = route(async (request, ctx) => {
  const owner = await authorize(request, true);
  const id = (await ctx.params).id;
  await findGarment(owner, id);
  const { db, bucket } = bindings();
  const { results } = await db
    .prepare('SELECT key FROM assets WHERE garment_id=? AND owner=?')
    .bind(id, owner)
    .all<{ key: string }>();
  await db.batch([
    db.prepare('DELETE FROM assets WHERE garment_id=? AND owner=?').bind(id, owner),
    db.prepare('DELETE FROM recognition_runs WHERE garment_id=? AND owner=?').bind(id, owner),
    db.prepare('DELETE FROM garments WHERE id=? AND owner=?').bind(id, owner),
  ]);
  await Promise.allSettled(results.map((x) => bucket.delete(x.key)));
  return json({ success: true });
});
