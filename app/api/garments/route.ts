import { route, authorize, json, HttpError } from '../../../lib/server/http';
import { listGarments, imageFile, createGarment } from '../../../lib/server/repository';
import { garmentSchema } from '../../../lib/validation/garment';
import { filterGarments } from '../../../features/wardrobe/filter';
import { z } from 'zod';
export const GET = route(async (request) => {
  const owner = await authorize(request);
  const p = new URL(request.url).searchParams;
  const filters = {
    q: p.get('q') ?? '',
    categories: p.getAll('category'),
    seasons: p.getAll('season'),
    colors: p.getAll('color'),
    styles: p.getAll('style'),
    sort: p.get('sort') ?? 'newest',
  };
  return json({ items: filterGarments(await listGarments(owner), filters) });
});
export const POST = route(async (request) => {
  const owner = await authorize(request, true);
  if (Number(request.headers.get('content-length')) > 24 * 1024 * 1024)
    throw new HttpError(413, '本次图片太大，请缩小后再试');
  const form = await request.formData();
  let metadata;
  try {
    metadata = JSON.parse(String(form.get('metadata')));
  } catch {
    throw new HttpError(400, '衣物信息不完整');
  }
  const input = garmentSchema.parse(metadata);
  const original = await imageFile(form.get('original'), true);
  const image = await imageFile(form.get('image'), true);
  const thumbnail = await imageFile(form.get('thumbnail'), true);
  const mask = await imageFile(form.get('mask'), false);
  const importKey = form.get('importKey')
    ? z
        .string()
        .regex(/^[a-zA-Z0-9:-]{1,160}$/)
        .parse(form.get('importKey'))
    : undefined;
  const restoreCreatedAt = form.get('restoreCreatedAt')
    ? z.string().datetime().parse(form.get('restoreCreatedAt'))
    : undefined;
  return json(
    await createGarment(
      owner,
      input,
      { original: original!, image: image!, thumbnail: thumbnail!, mask },
      importKey,
      restoreCreatedAt,
    ),
    201,
  );
});
