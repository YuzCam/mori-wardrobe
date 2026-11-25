import assert from 'node:assert/strict';
const origin = process.env.MORI_TEST_ORIGIN ?? 'http://localhost:5173';
assert.ok(
  ['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname),
  'Integration fixtures may only run on a local development origin',
);
const unauth = await fetch(origin + '/api/garments', { redirect: 'manual' });
assert.equal(unauth.status, 401);
const signin = await fetch(origin + '/signin-with-chatgpt?return_to=/', { redirect: 'manual' });
const cookie = signin.headers
  .getSetCookie()
  .map((v) => v.split(';')[0])
  .join('; ');
assert.ok(cookie, 'development sign-in cookie');
const request = (path, options = {}) =>
  fetch(origin + path, {
    ...options,
    headers: { Cookie: cookie, Origin: origin, ...options.headers },
  });
const root = await request('/');
assert.equal(root.status, 200);
assert.ok(
  (await root.text()).includes('今天，也穿得喜欢'),
  'server renders the page, not only an empty hydration shell',
);
console.log('PASS protected server-rendered page and anonymous rejection');
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jE1kAAAAASUVORK5CYII=',
  'base64',
);
const base = {
  name: 'TEST-燕麦色针织衫',
  category: 'top',
  seasons: ['winter', 'summer'],
  colors: ['oat'],
  styles: ['relaxed'],
  notes: 'Disposable local integration fixture',
  warmth: 2,
  recipe: { brightness: 100, contrast: 100, background: '#f2eee8', crop: null, rotation: 0 },
  recognition: null,
};
const created = [];
async function create(input, key) {
  const form = new FormData();
  form.set('metadata', JSON.stringify(input));
  if (key) form.set('importKey', key);
  for (const kind of ['original', 'image', 'thumbnail', 'mask'])
    form.set(kind, new Blob([png], { type: 'image/png' }), `${kind}.png`);
  const r = await request('/api/garments', { method: 'POST', body: form });
  const body = await r.json();
  assert.equal(r.status, 201, JSON.stringify(body));
  if (!created.includes(body.id)) created.push(body.id);
  return body;
}
try {
  const missingOrigin = await fetch(origin + '/api/garments', {
    method: 'POST',
    headers: { Cookie: cookie },
  });
  assert.equal(missingOrigin.status, 403);
  console.log('PASS cross-origin write rejection');
  const a = await create(base);
  const b = await create({ ...base, name: 'TEST-直筒裤', category: 'trousers' });
  const c = await create({ ...base, name: 'TEST-冬季外套', category: 'outerwear', warmth: 3 });
  const image = await request(a.imageUrl);
  assert.equal(image.status, 200);
  assert.equal(image.headers.get('cache-control'), 'private, no-store');
  assert.equal((await fetch(origin + a.imageUrl)).status, 401);
  console.log('PASS atomic image persistence and private assets');
  const filter = await (
    await request('/api/garments?category=top&season=summer&color=oat&q=燕麦')
  ).json();
  assert.ok(filter.items.some((g) => g.id === a.id));
  assert.ok(!filter.items.some((g) => g.id === b.id));
  console.log('PASS multidimensional persisted filters');
  const edit = await request(`/api/garments/${a.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...base, name: 'TEST-已修改', revision: 1 }),
  });
  assert.equal(edit.status, 200);
  const conflict = await request(`/api/garments/${a.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...base, revision: 1 }),
  });
  assert.equal(conflict.status, 409);
  console.log('PASS manual edit and stale revision conflict');
  const outfits = await (
    await request('/api/outfits/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh: true, weather: { apparent: 10 } }),
    })
  ).json();
  assert.ok(outfits.items.length > 0);
  const o = outfits.items.find((o) => o.garmentIds.includes(a.id));
  assert.ok(o);
  const favorite = await request(`/api/outfits/${o.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ favorite: true, worn: true }),
  });
  assert.equal(favorite.status, 200);
  console.log('PASS real-inventory daily outfit and history');
  const backupId = crypto.randomUUID();
  const importKey = `${backupId}:${a.id}`;
  const imported = await create({ ...base, name: 'TEST-恢复单品' }, importKey);
  const repeated = await create({ ...base, name: 'TEST-恢复单品' }, importKey);
  assert.equal(imported.id, repeated.id);
  const importedBottom = await create(
    { ...base, name: 'TEST-恢复裤子', category: 'trousers' },
    `${backupId}:${b.id}`,
  );
  const restore = await request('/api/backup/restore', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      backupId,
      outfits: [
        {
          id: crypto.randomUUID(),
          garmentIds: [a.id, b.id],
          date: '2026-11-08',
          title: '恢复搭配',
          reason: '备份恢复测试',
          favorite: true,
          worn: false,
          createdAt: new Date().toISOString(),
        },
      ],
    }),
  });
  assert.equal(restore.status, 200);
  assert.equal((await restore.json()).restored, 1);
  const restored = await (await request('/api/outfits')).json();
  assert.ok(
    restored.items.some(
      (o) =>
        o.title === '恢复搭配' &&
        o.garmentIds.includes(imported.id) &&
        o.garmentIds.includes(importedBottom.id),
    ),
  );
  console.log('PASS backup retry idempotence and outfit ID remapping');
  const backup = await (await request('/api/backup')).json();
  assert.ok(backup.garments.some((g) => g.id === a.id));
  assert.ok(backup.outfits.some((x) => x.id === o.id));
  console.log('PASS complete backup metadata');
  await request(`/api/garments/${a.id}`, { method: 'DELETE' });
  const after = await (await request('/api/outfits')).json();
  assert.ok(!after.items.some((x) => x.garmentIds.includes(a.id)));
  assert.equal((await request(a.imageUrl)).status, 404);
  console.log('PASS deletion removes image access and invalid outfits');
} finally {
  for (const id of created) await request(`/api/garments/${id}`, { method: 'DELETE' });
}
console.log('HTTP integration checks complete; only local test records removed.');
