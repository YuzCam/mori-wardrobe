import 'fake-indexeddb/auto';
import { registerHooks } from 'node:module';
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (specifier.startsWith('.') && !/\.[a-z]+$/.test(specifier))
        return nextResolve(specifier + '.ts', context);
      throw error;
    }
  },
});
export const { WardrobeStore } = await import('../src/store.ts');
export const { defaultRecipe } = await import('../../types/wardrobe.ts');
export const input = {
  name: '燕麦针织衫',
  category: 'top' as const,
  seasons: ['winter' as const],
  colors: ['oat'],
  styles: ['relaxed'],
  notes: '测试用衣物',
  warmth: 1,
  recipe: defaultRecipe,
  recognition: null,
};
export const png = new Uint8Array(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jE1kAAAAASUVORK5CYII=',
    'base64',
  ),
);
export const assets = () => ({
  original: new Blob([png], { type: 'image/png' }),
  image: new Blob([png], { type: 'image/png' }),
  thumbnail: new Blob([png], { type: 'image/png' }),
  mask: new Blob([png], { type: 'image/png' }),
});
export const database = () => new WardrobeStore('mori-test-' + crypto.randomUUID());
