import test from 'node:test';
import assert from 'node:assert/strict';
import { startProduction } from '../app/server.js';

async function withServer(fn) {
  const { server, close } = await startProduction({ port: 0 });
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await fn(base); } finally { await close(); }
}

test('/health, /version, static allowlist, and 404s', async () => {
  await withServer(async (base) => {
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    assert.equal(await health.text(), 'ok');

    const version = await fetch(`${base}/version`);
    assert.equal(version.status, 200);
    const meta = await version.json();
    assert.equal(meta.name, 'why-redis-is-fast-demo');

    for (const path of ['/', '/guide.html', '/styles.css', '/app.js', '/store.mjs', '/cache.mjs']) {
      const res = await fetch(`${base}${path}`);
      assert.equal(res.status, 200, `${path} should serve`);
      assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    }

    for (const path of ['/package.json', '../app/server.js', '/nope', '/test/store.test.mjs']) {
      const res = await fetch(`${base}/${path.replace(/^\//, '')}`);
      assert.equal(res.status, 404, `${path} must 404`);
    }
  });
});

test('HEAD / serves headers with no body', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/`, { method: 'HEAD' });
    assert.equal(res.status, 200);
    assert.equal(await res.text(), '');
  });
});
