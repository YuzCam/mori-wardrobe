import type { Garment, Outfit, Weather, Season } from '../../types/wardrobe.ts';
import { categories, colorName, styleName } from '../../config/taxonomy.ts';
export function dateInZone(timezone: string, now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
function hash(value: string) {
  let h = 2166136261;
  for (const c of value) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
export const wardrobeVersion = (garments: Garment[]) =>
  String(
    hash(
      garments
        .map((g) => `${g.id}:${g.revision}`)
        .sort()
        .join('|'),
    ),
  );
export function generateOutfits(
  garments: Garment[],
  options: {
    date: string;
    season: Season;
    weather?: Partial<Weather> | null;
    nonce?: number;
    lockedId?: string;
    history?: Outfit[];
  },
): Omit<Outfit, 'id'>[] {
  const temp = options.weather?.apparent;
  const role = (g: Garment) => categories.find((c) => c.id === g.category)?.role;
  const eligible = garments.filter((g) => g.seasons.includes(options.season));
  const list = (r: string) =>
    eligible
      .filter((g) => role(g) === r)
      .sort(
        (a, b) =>
          hash(a.id + options.date + options.nonce) - hash(b.id + options.date + options.nonce),
      )
      .slice(0, 20);
  const combos: Garment[][] = [...list('full').map((g) => [g])];
  for (const top of list('top')) for (const bottom of list('bottom')) combos.push([top, bottom]);
  const outer = list('outerwear'),
    shoes = list('shoes'),
    bags = list('bag'),
    accessories = list('accessory');
  const candidates: { garments: Garment[]; score: number; reason: string }[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < combos.length; i++) {
    const g = [...combos[i]];
    const seed = hash(g.map((x) => x.id).join('') + options.date + (options.nonce ?? 0));
    const cold = temp !== undefined ? temp < 17 : options.season === 'winter';
    const upper = g.find((x) => role(x) === 'top' || role(x) === 'full');
    const needOuter = cold && (upper?.warmth ?? 0) < 3;
    const warmOuter = outer.filter((x) => x.warmth >= (temp !== undefined && temp >= 13 ? 1 : 2));
    if (needOuter && warmOuter.length) g.push(warmOuter[seed % warmOuter.length]);
    else if (needOuter) continue;
    if (temp !== undefined && temp >= 26 && g.some((x) => x.warmth >= 3)) continue;
    for (const pool of [shoes, bags, accessories])
      if (pool.length) g.push(pool[(seed + g.length) % pool.length]);
    if (options.lockedId && !g.some((x) => x.id === options.lockedId)) continue;
    const key = g
      .map((x) => x.id)
      .sort()
      .join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    const allColors = [...new Set(g.flatMap((x) => x.colors))];
    const commonStyles = g[0].styles.filter(
      (s) => g.filter((x) => x.styles.includes(s)).length >= 2,
    );
    let score = 50 + (allColors.length <= 3 ? 20 : 0) + commonStyles.length * 8 + (seed % 10);
    for (const recent of options.history ?? [])
      if (recent.worn && recent.garmentIds.some((id) => g.some((x) => x.id === id))) score -= 6;
    const weatherText =
      temp !== undefined
        ? `体感 ${Math.round(temp)}°，${cold ? '用外搭增加层次和暖意' : '选择轻松舒适的组合'}`
        : `按${options.season === 'winter' ? '冬季' : '夏季'}偏好搭配`;
    const palette = allColors.slice(0, 2).map(colorName).join('与');
    const styleText = commonStyles.length ? `，延续${styleName(commonStyles[0])}的感觉` : '';
    candidates.push({
      garments: g,
      score,
      reason: `${weatherText}。${palette || '基础色'}协调组合${styleText}。${!shoes.length ? '衣橱暂缺鞋，先提供基础搭配。' : ''}`,
    });
  }
  candidates.sort((a, b) => b.score - a.score);
  const chosen: typeof candidates = [];
  for (const c of candidates) {
    if (chosen.length >= 3) break;
    if (
      !chosen.some(
        (v) =>
          v.garments
            .slice(0, 2)
            .map((x) => x.id)
            .join('|') ===
          c.garments
            .slice(0, 2)
            .map((x) => x.id)
            .join('|'),
      )
    )
      chosen.push(c);
  }
  return chosen.map((c, i) => ({
    garmentIds: c.garments.map((x) => x.id),
    date: options.date,
    reason: c.reason,
    title: ['刚刚好的日常', '换一种心情', '今日的小灵感'][i],
    favorite: false,
    worn: false,
    createdAt: new Date().toISOString(),
    wardrobeVersion: wardrobeVersion(garments),
  }));
}
