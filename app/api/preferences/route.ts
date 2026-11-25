import { route, authorize, json } from '../../../lib/server/http';
import { getPreferences, savePreferences } from '../../../lib/server/repository';
import { preferencesSchema } from '../../../lib/validation/garment';
export const GET = route(async (request) => json(await getPreferences(await authorize(request))));
export const PATCH = route(async (request) => {
  const owner = await authorize(request, true);
  const value = preferencesSchema.parse(await request.json());
  await savePreferences(owner, value);
  return json(value);
});
