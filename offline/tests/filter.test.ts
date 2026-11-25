import test from 'node:test';
import assert from 'node:assert/strict';
import { database, input, assets } from './helpers.ts';
const { filterGarments, emptyFilters } = await import('../src/filter.ts');
test('spring/autumn clothing can be saved, combined with another season, and filtered separately', async () => {
  const db = database();
  const spring = await db.save({ ...input, name: '春秋薄衬衫', seasons: ['spring-autumn'] }, assets());
  const cross = await db.save({ ...input, name: '跨季开衫', seasons: ['spring-autumn', 'winter'] }, assets());
  await db.save(input, assets());
  const all = await db.list();
  assert.deepEqual(new Set(filterGarments(all, { ...emptyFilters, seasons: ['spring-autumn'] }).map(g => g.id)), new Set([spring.id, cross.id]));
  assert.equal(filterGarments(all, { ...emptyFilters, seasons: ['summer'] }).length, 0);
  await db.close();
});
test('filters intersect dimensions, allow alternatives within a group, and search Chinese labels', async () => {
  const db = database();
  const a = await db.save(input, assets());
  await db.save(
    { ...input, name: '蓝色裙子', category: 'skirt', colors: ['blue'], seasons: ['summer'] },
    assets(),
  );
  const all = await db.list(true);
  assert.deepEqual(
    filterGarments(all, {
      ...emptyFilters,
      categories: ['top', 'dress'],
      seasons: ['winter'],
      colors: ['oat'],
      styles: ['relaxed'],
    }).map((g) => g.id),
    [a.id],
  );
  assert.equal(filterGarments(all, { ...emptyFilters, q: '天空蓝' })[0].name, '蓝色裙子');
  await db.changeTrash(a.id, true);
  const changed = await db.list(true);
  assert.equal(filterGarments(changed, emptyFilters).length, 1);
  assert.equal(filterGarments(changed, emptyFilters, true)[0].id, a.id);
  await db.close();
});
