import assert from 'node:assert/strict';

const origin = process.env.MORI_TEST_ORIGIN ?? 'http://localhost:5173';
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname));
const signin = await fetch(`${origin}/signin-with-chatgpt?return_to=/`, { redirect: 'manual' });
const cookie = signin.headers
  .getSetCookie()
  .map((value) => value.split(';')[0])
  .join('; ');
assert.ok(cookie, 'local sign-in is available');
const request = (path) => fetch(origin + path, { headers: { Cookie: cookie }, redirect: 'manual' });
const destinations = new Map([
  ['/', '今天，也穿得喜欢'],
  ['/wardrobe', '我的衣橱'],
  ['/upload', '把喜欢，收进衣橱'],
  ['/favorites', '收藏的搭配'],
]);

// Follow the actual links emitted for both navigation surfaces, then verify the
// destination and its active state. This also works without a hydrated router.
for (const [path, heading] of destinations) {
  const response = await request(path);
  assert.equal(response.status, 200, path);
  const html = await response.text();
  const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)?.[1].replace(/<[^>]*>/g, '');
  assert.ok(h1?.includes(heading), `${path} renders its own page heading`);
  for (const label of ['主导航', '手机导航']) {
    const nav = html.match(
      new RegExp(`<nav[^>]*aria-label="${label}"[^>]*>([\\s\\S]*?)<\\/nav>`),
    )?.[1];
    assert.ok(nav, `${path}: ${label}`);
    const links = [...nav.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map((match) => ({
      href: match[1].match(/\bhref="([^"]*)"/)?.[1],
      active: /aria-current="page"/.test(match[1]),
    }));
    assert.deepEqual(
      links.map((link) => link.href),
      [...destinations.keys()],
    );
    assert.deepEqual(
      links.filter((link) => link.active).map((link) => link.href),
      [path],
    );
    for (const link of links) {
      const target = await request(link.href);
      assert.equal(target.status, 200, `${label}: ${path} -> ${link.href}`);
      assert.ok((await target.text()).includes(destinations.get(link.href)));
    }
  }
  console.log(`PASS desktop and mobile navigation to ${path}`);
}
const legacy = await request('/?saved=1');
assert.ok([302, 303, 307, 308].includes(legacy.status));
assert.equal(new URL(legacy.headers.get('location'), origin).pathname, '/favorites');
console.log('PASS legacy saved link redirects to the dedicated favorites page');
