import { route, authorize, json, HttpError } from '../../../lib/server/http';
const cache = new Map<string, { at: number; data: unknown }>();
async function upstream(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error('upstream');
    return (await response.json()) as any;
  } catch {
    throw new HttpError(502, '天气服务暂时不可用，可以手动设置天气');
  } finally {
    clearTimeout(timer);
  }
}
export const GET = route(async (request) => {
  await authorize(request);
  const p = new URL(request.url).searchParams;
  if (p.has('search')) {
    const q = (p.get('search') ?? '').trim();
    if (!q || q.length > 80) throw new HttpError(400, '请输入城市名称');
    const data = await upstream(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&language=zh&format=json`,
    );
    return json({
      items: (data.results ?? []).map((c: any) => ({
        city: c.name,
        region: [c.admin1, c.country].filter(Boolean).join(' · '),
        latitude: c.latitude,
        longitude: c.longitude,
      })),
    });
  }
  const lat = Number(p.get('lat')),
    lon = Number(p.get('lon'));
  if (
    !p.has('lat') ||
    !p.has('lon') ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    Math.abs(lat) > 90 ||
    Math.abs(lon) > 180
  )
    throw new HttpError(400, '请先选择城市');
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const stored = cache.get(key);
  if (stored && Date.now() - stored.at < 1800000) return json(stored.data);
  const data = await upstream(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,precipitation,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=1&timezone=auto`,
  );
  const result = {
    latitude: lat,
    longitude: lon,
    city: p.get('city') ?? '',
    temperature: data.current.temperature_2m,
    apparent: data.current.apparent_temperature,
    min: data.daily.temperature_2m_min[0],
    max: data.daily.temperature_2m_max[0],
    rain: data.daily.precipitation_probability_max[0],
    code: data.current.weather_code,
    updatedAt: new Date().toISOString(),
  };
  if (cache.size > 200) cache.clear();
  cache.set(key, { at: Date.now(), data: result });
  return json(result);
});
