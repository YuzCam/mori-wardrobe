import { route, authorize, json } from '../../../lib/server/http';
import { listOutfits, listGarments } from '../../../lib/server/repository';
export const GET = route(async (request) => {
  const owner = await authorize(request);
  const ids = new Set((await listGarments(owner)).map((g) => g.id));
  return json({
    items: (await listOutfits(owner)).filter((o) => o.garmentIds.every((id) => ids.has(id))),
  });
});
