import { blobOf, canvas, decodeImage, renderGarment } from '../../features/image-editor/engine';
import type { WardrobeStore } from './store';
import type { LocalGarment } from './types';
import type { LookInput } from './looks-model';
export async function garmentCutout(store: WardrobeStore, item: LocalGarment) {
  const [originalBlob, maskBlob] = await Promise.all([
    store.asset(item.id, 'original'),
    store.asset(item.id, 'mask'),
  ]);
  if (!originalBlob || !maskBlob) throw new Error('衣物图片未能读取，请检查或从备份恢复');
  const [original, mask] = await Promise.all([
    decodeImage(originalBlob, 700),
    decodeImage(maskBlob, 700),
  ]);
  return renderGarment(original, mask, item.recipe, true, 700);
}
export async function renderLook(store: WardrobeStore, items: LocalGarment[], input: LookInput) {
  const output = canvas(800, 1000),
    context = output.getContext('2d')!;
  context.fillStyle = input.background;
  context.fillRect(0, 0, 800, 1000);
  for (const layer of input.layers) {
    const item = items.find((g) => g.id === layer.garmentId);
    if (!item) throw new Error('搭配中的衣物不存在');
    const cutout = await garmentCutout(store, item),
      w = (800 * layer.width) / 100,
      h = (w * cutout.height) / cutout.width,
      x = (800 * layer.x) / 100,
      y = (1000 * layer.y) / 100;
    context.save();
    context.translate(x + w / 2, y + h / 2);
    context.rotate((layer.rotation * Math.PI) / 180);
    context.drawImage(cutout, -w / 2, -h / 2, w, h);
    context.restore();
  }
  return blobOf(output, 'image/png');
}
