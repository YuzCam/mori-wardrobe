import test from 'node:test';
import assert from 'node:assert/strict';
import { filterGarments, emptyFilters } from '../features/wardrobe/filter.ts';
import { generateOutfits, dateInZone, wardrobeVersion } from '../features/outfits/engine.ts';
import type { Garment } from '../types/wardrobe.ts';
function garment(id: string, category: Garment['category'], extra: Partial<Garment> = {}): Garment {
  return {
    id,
    name: id,
    category,
    seasons: ['summer', 'winter'],
    colors: ['cream'],
    styles: ['relaxed'],
    warmth: 1,
    notes: '',
    imageUrl: '',
    originalUrl: '',
    thumbnailUrl: '',
    recipe: { brightness: 100, contrast: 100, background: '#fffefa', crop: null, rotation: 0 },
    recognition: null,
    revision: 1,
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
    ...extra,
  };
}
const options = { date: '2026-11-08', season: 'summer' as const, weather: { apparent: 25 } };
test('filter combines dimensions with AND, choices within one dimension with OR', () => {
  const items = [
    garment('a', 'top', { colors: ['blue'] }),
    garment('b', 'top', { colors: ['cream'] }),
    garment('c', 'trousers', { colors: ['blue'] }),
    garment('d', 'top', { seasons: ['winter'], colors: ['blue'] }),
  ];
  assert.deepEqual(
    filterGarments(items, {
      ...emptyFilters,
      categories: ['top'],
      seasons: ['summer'],
      colors: ['blue', 'cream'],
    }).map((g) => g.id),
    ['a', 'b'],
  );
});
test('search uses Chinese color and category names, not just a file name', () => {
  assert.equal(
    filterGarments([garment('a', 'top', { colors: ['blue'] })], { ...emptyFilters, q: '天空蓝' })
      .length,
    1,
  );
  assert.equal(
    filterGarments([garment('a', 'camisole')], { ...emptyFilters, q: '吊带' }).length,
    1,
  );
});
test('no outfits invented when wardrobe has only accessories', () => {
  assert.deepEqual(generateOutfits([garment('bag', 'bag'), garment('shoe', 'shoes')], options), []);
});
test('dress makes complete outfit; never adds an unrelated top or bottom', () => {
  const result = generateOutfits(
    [garment('dress', 'dress'), garment('top', 'top'), garment('bag', 'bag')],
    options,
  );
  assert.equal(result.length, 1);
  assert.ok(result[0].garmentIds.includes('dress'));
  assert.ok(!result[0].garmentIds.includes('top'));
});
test('camisole pairs with trousers using top role', () => {
  const result = generateOutfits(
    [garment('tank', 'camisole'), garment('pants', 'trousers')],
    options,
  );
  assert.equal(result.length, 1);
  assert.deepEqual(new Set(result[0].garmentIds), new Set(['tank', 'pants']));
});
test('cold day rejects a thin combination without outerwear', () => {
  const items = [garment('a', 'top'), garment('b', 'trousers')];
  assert.equal(generateOutfits(items, { ...options, weather: { apparent: 10 } }).length, 0);
  items.push(garment('c', 'outerwear', { warmth: 3 }));
  const result = generateOutfits(items, { ...options, weather: { apparent: 10 } });
  assert.ok(result[0].garmentIds.includes('c'));
});
test('season filter excludes summer-only items in winter', () => {
  assert.equal(
    generateOutfits([garment('a', 'dress', { seasons: ['summer'] })], {
      ...options,
      season: 'winter',
    }).length,
    0,
  );
});
test('thick trousers cannot compensate for a thin top on a cold day', () => {
  assert.equal(
    generateOutfits(
      [garment('tank', 'camisole', { warmth: 0 }), garment('pants', 'trousers', { warmth: 3 })],
      { ...options, weather: { apparent: 8 } },
    ).length,
    0,
  );
});
test('a lightweight outer layer does not qualify as winter protection', () => {
  assert.equal(
    generateOutfits(
      [garment('a', 'top'), garment('b', 'trousers'), garment('c', 'outerwear', { warmth: 0 })],
      { ...options, weather: { apparent: 8 } },
    ).length,
    0,
  );
});
test('lock requires the selected item and never produces duplicates', () => {
  const items = [
    garment('a', 'top'),
    garment('b', 'top'),
    garment('c', 'trousers'),
    garment('d', 'trousers'),
    garment('e', 'bag'),
  ];
  const outfits = generateOutfits(items, { ...options, lockedId: 'a' });
  assert.ok(outfits.length > 0);
  for (const outfit of outfits) {
    assert.ok(outfit.garmentIds.includes('a'));
    assert.equal(outfit.garmentIds.length, new Set(outfit.garmentIds).size);
  }
  assert.equal(generateOutfits(items, { ...options, lockedId: 'deleted' }).length, 0);
});
test('same day is stable; revision changes wardrobe version', () => {
  const items = [garment('a', 'top'), garment('b', 'trousers'), garment('c', 'top')];
  assert.deepEqual(
    generateOutfits(items, options).map((o) => o.garmentIds),
    generateOutfits(items, options).map((o) => o.garmentIds),
  );
  assert.notEqual(
    wardrobeVersion(items),
    wardrobeVersion(items.map((g) => ({ ...g, revision: 2 }))),
  );
});
test('Shanghai day changes before UTC midnight', () => {
  assert.equal(dateInZone('Asia/Shanghai', new Date('2026-11-07T18:00:00Z')), '2026-11-08');
});
