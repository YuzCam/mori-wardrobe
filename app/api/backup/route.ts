import { route, authorize, json } from '../../../lib/server/http';
import { listGarments, listOutfits, getPreferences } from '../../../lib/server/repository';
export const GET = route(async (request) => {
  const owner = await authorize(request);
  const [garments, outfits, preferences] = await Promise.all([
    listGarments(owner),
    listOutfits(owner),
    getPreferences(owner),
  ]);
  return json({ version: 1, exportedAt: new Date().toISOString(), garments, outfits, preferences });
});
