import { route, authorize, json } from '../../../../lib/server/http';
import {
  listGarments,
  getPreferences,
  listOutfits,
  insertOutfits,
} from '../../../../lib/server/repository';
import { dateInZone, generateOutfits, wardrobeVersion } from '../../../../features/outfits/engine';
import { z } from 'zod';
export const POST = route(async (request) => {
  const owner = await authorize(request, true);
  const body = z
    .object({
      refresh: z.boolean().optional(),
      lockedId: z.string().max(80).optional(),
      weather: z
        .object({ apparent: z.number().min(-60).max(60) })
        .nullable()
        .optional(),
    })
    .parse(await request.json());
  const [items, preferences, history] = await Promise.all([
    listGarments(owner),
    getPreferences(owner),
    listOutfits(owner),
  ]);
  const date = dateInZone(preferences.timezone);
  const version = wardrobeVersion(items);
  const temp = body.weather?.apparent;
  const season = temp !== undefined ? (temp >= 23 ? 'summer' : 'winter') : preferences.season;
  const contextKey = `${season}:${temp === undefined ? 'unknown' : Math.round(temp)}:${body.lockedId ?? ''}`;
  const existing = history
    .filter(
      (o) =>
        o.date === date &&
        o.wardrobeVersion === version &&
        o.contextKey === contextKey &&
        o.garmentIds.every((id) => items.some((g) => g.id === id)),
    )
    .slice(0, 3);
  if (!body.refresh && !body.lockedId && existing.length) return json({ items: existing });
  const generated = generateOutfits(items, {
    date,
    season,
    weather: body.weather,
    history: history.filter(
      (o) => o.worn && Date.parse(o.wornAt ?? o.createdAt) > Date.now() - 7 * 86400000,
    ),
    nonce: body.refresh ? Date.now() : 0,
    lockedId: body.lockedId,
  }).map((o) => ({ ...o, id: crypto.randomUUID(), contextKey }));
  await insertOutfits(owner, generated);
  return json({ items: generated });
});
