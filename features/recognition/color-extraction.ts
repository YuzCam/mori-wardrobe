import { colors } from '../../config/taxonomy';
function lab(r: number, g: number, b: number) {
  const lin = (v: number) => ((v /= 255) > 0.04045 ? ((v + 0.055) / 1.055) ** 2.4 : v / 12.92);
  r = lin(r);
  g = lin(g);
  b = lin(b);
  const f = (v: number) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116);
  const x = f((r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047),
    y = f(r * 0.2126 + g * 0.7152 + b * 0.0722),
    z = f((r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
export function extractColors(original: HTMLCanvasElement, mask: HTMLCanvasElement): string[] {
  const c = document.createElement('canvas');
  c.width = c.height = 80;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(original, 0, 0, 80, 80);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(mask, 0, 0, 80, 80);
  const data = ctx.getImageData(0, 0, 80, 80).data;
  const buckets = new Map<string, { rgb: number[]; count: number }>();
  for (let i = 0; i < data.length; i += 4)
    if (data[i + 3] > 200) {
      const key = `${data[i] >> 5},${data[i + 1] >> 5},${data[i + 2] >> 5}`;
      const old = buckets.get(key) ?? { rgb: [0, 0, 0], count: 0 };
      old.count++;
      for (let j = 0; j < 3; j++) old.rgb[j] += data[i + j];
      buckets.set(key, old);
    }
  const total = [...buckets.values()].reduce((v, x) => v + x.count, 0);
  if (!total) return [];
  const palette = colors
    .filter((c) => c.id !== 'contrast')
    .map((c) => ({
      ...c,
      lab: lab(
        ...(c.hex
          .slice(1)
          .match(/../g)!
          .map((v) => parseInt(v, 16)) as [number, number, number]),
      ),
    }));
  const ranked = new Map<string, number>();
  for (const bucket of buckets.values()) {
    const sample = lab(...(bucket.rgb.map((x) => x / bucket.count) as [number, number, number]));
    const nearest = [...palette].sort(
      (a, b) =>
        a.lab.reduce((s, x, i) => s + (x - sample[i]) ** 2, 0) -
        b.lab.reduce((s, x, i) => s + (x - sample[i]) ** 2, 0),
    )[0];
    ranked.set(nearest.id, (ranked.get(nearest.id) ?? 0) + bucket.count);
  }
  return [...ranked]
    .sort((a, b) => b[1] - a[1])
    .filter(([, count], i) => i === 0 || count / total > 0.2)
    .slice(0, 2)
    .map(([id]) => id);
}
