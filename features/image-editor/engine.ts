import type { EditRecipe } from '../../types/wardrobe';
export const canvas = (w: number, h: number) => {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
};
export const blobOf = (c: HTMLCanvasElement, type = 'image/png', quality = 0.9) =>
  new Promise<Blob>((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('图片导出失败，请重试'))), type, quality),
  );
export async function decodeImage(file: Blob, maxEdge = 1800): Promise<HTMLCanvasElement> {
  let source: CanvasImageSource;
  let close: (() => void) | undefined;
  if ('createImageBitmap' in window) {
    try {
      const bitmap = await createImageBitmap(file, {
        imageOrientation: 'from-image',
        resizeWidth: undefined,
      });
      source = bitmap;
      close = () => bitmap.close();
    } catch {
      source = await htmlImage(file);
    }
  } else source = await htmlImage(file);
  const sw = (source as any).naturalWidth ?? (source as any).width;
  const sh = (source as any).naturalHeight ?? (source as any).height;
  if (!sw || !sh) throw new Error('无法读取这张照片，请使用 JPEG、PNG 或 WebP');
  const scale = Math.min(1, maxEdge / Math.max(sw, sh));
  const c = canvas(sw * scale, sh * scale);
  c.getContext('2d')!.drawImage(source, 0, 0, c.width, c.height);
  close?.();
  return c;
}
function htmlImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('当前浏览器无法读取此格式，请改用 JPEG 照片'));
    };
    image.src = url;
  });
}
export function fullMask(w: number, h: number) {
  const c = canvas(w, h);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  return c;
}
export function maskFromPrediction(
  prediction: Float32Array,
  size: number,
  width: number,
  height: number,
) {
  const tiny = canvas(size, size);
  const ctx = tiny.getContext('2d')!;
  const data = ctx.createImageData(size, size);
  for (let i = 0; i < prediction.length; i++) {
    const alpha = Math.round(Math.max(0, Math.min(1, prediction[i])) * 255);
    data.data[i * 4] = data.data[i * 4 + 1] = data.data[i * 4 + 2] = 255;
    data.data[i * 4 + 3] = alpha;
  }
  ctx.putImageData(data, 0, 0);
  const result = canvas(width, height);
  result.getContext('2d')!.drawImage(tiny, 0, 0, width, height);
  return result;
}
export function boundingCrop(mask: HTMLCanvasElement) {
  const sample = canvas(320, 320);
  sample.getContext('2d')!.drawImage(mask, 0, 0, 320, 320);
  const d = sample.getContext('2d')!.getImageData(0, 0, 320, 320).data;
  let x1 = 320,
    y1 = 320,
    x2 = 0,
    y2 = 0;
  for (let y = 0; y < 320; y++)
    for (let x = 0; x < 320; x++)
      if (d[(y * 320 + x) * 4 + 3] > 100) {
        x1 = Math.min(x1, x);
        y1 = Math.min(y1, y);
        x2 = Math.max(x2, x);
        y2 = Math.max(y2, y);
      }
  if (x2 <= x1 || y2 <= y1) return null;
  x1 = Math.max(0, x1 - 12);
  y1 = Math.max(0, y1 - 12);
  x2 = Math.min(320, x2 + 12);
  y2 = Math.min(320, y2 + 12);
  return { x: x1 / 320, y: y1 / 320, width: (x2 - x1) / 320, height: (y2 - y1) / 320 };
}
export function renderGarment(
  original: HTMLCanvasElement,
  mask: HTMLCanvasElement,
  recipe: EditRecipe,
  transparent = false,
  edge = 1400,
) {
  const layer = canvas(original.width, original.height);
  const lc = layer.getContext('2d')!;
  lc.filter = `brightness(${recipe.brightness}%) contrast(${recipe.contrast}%)`;
  lc.drawImage(original, 0, 0);
  lc.filter = 'none';
  lc.globalCompositeOperation = 'destination-in';
  lc.drawImage(mask, 0, 0, original.width, original.height);
  const r = recipe.crop ?? { x: 0, y: 0, width: 1, height: 1 };
  const sw = Math.max(1, original.width * r.width),
    sh = Math.max(1, original.height * r.height);
  const rotated = Math.abs(recipe.rotation % 180) === 90;
  const rw = rotated ? sh : sw,
    rh = rotated ? sw : sh;
  const scale = Math.min(1, edge / Math.max(rw, rh));
  const out = canvas(rw * scale, rh * scale);
  const ctx = out.getContext('2d')!;
  if (!transparent) {
    ctx.fillStyle = recipe.background;
    ctx.fillRect(0, 0, out.width, out.height);
  }
  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate((recipe.rotation * Math.PI) / 180);
  ctx.drawImage(
    layer,
    original.width * r.x,
    original.height * r.y,
    sw,
    sh,
    (-sw * scale) / 2,
    (-sh * scale) / 2,
    sw * scale,
    sh * scale,
  );
  layer.width = layer.height = 1;
  return out;
}
export function pixelsFor(c: HTMLCanvasElement, size: number) {
  const resized = canvas(size, size);
  resized.getContext('2d')!.drawImage(c, 0, 0, size, size);
  return resized.getContext('2d')!.getImageData(0, 0, size, size).data;
}
export function clipPixels(c: HTMLCanvasElement) {
  const out = canvas(224, 224);
  const ctx = out.getContext('2d')!;
  ctx.fillStyle = '#efede9';
  ctx.fillRect(0, 0, 224, 224);
  const s = Math.min(208 / c.width, 208 / c.height);
  ctx.drawImage(c, (224 - c.width * s) / 2, (224 - c.height * s) / 2, c.width * s, c.height * s);
  return ctx.getImageData(0, 0, 224, 224).data;
}
