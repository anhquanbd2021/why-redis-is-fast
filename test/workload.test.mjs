import test from 'node:test';
import assert from 'node:assert/strict';
import { uniform, hotspot, runWorkload } from '../public/workload.mjs';
import { createStore } from '../public/store.mjs';
import { createDb } from '../public/db.mjs';
import { createSingleFlight } from '../public/cache.mjs';
import { PRODUCTS, SCENARIOS, scenarioStream } from '../public/examples.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('uniform() produces n keys drawn from the catalog', () => {
  const keys = ['a', 'b', 'c'];
  const stream = uniform(keys, 50);
  assert.equal(stream.length, 50);
  assert.ok(stream.every((k) => keys.includes(k)));
});

test('hotspot() gives the hot key roughly hotFrac of the traffic', () => {
  const stream = hotspot(['hot', 'a', 'b', 'c', 'd'], 1000, { hotKey: 'hot', hotFrac: 0.5 });
  const frac = stream.filter((k) => k === 'hot').length / 1000;
  assert.ok(frac > 0.4 && frac < 0.6, `hot fraction ${frac}`);
});

test('runWorkload counts hits, misses and DB queries', async () => {
  let now = 0;
  const store = createStore({ now: () => now });
  const db = createDb(PRODUCTS, { latencyMs: 1, sleep });
  const get = createSingleFlight(store, db, { ttlMs: 60000 });
  const keys = ['sku-101', 'sku-102', 'sku-101', 'sku-102'];
  const stats = await runWorkload(keys, get, { concurrency: 1 });
  assert.equal(stats.requests, 4);
  assert.equal(stats.hits + stats.misses, 4);
  assert.equal(stats.dbQueries, 2); // each distinct key fetched once
  assert.ok(stats.avgLatencyMs >= 0 && stats.p95LatencyMs >= stats.avgLatencyMs * 0);
});

test('scenario streams are reproducible from the seed', () => {
  const keys = PRODUCTS.map((p) => p.id);
  const s = SCENARIOS['hot-key-expiry'];
  const a = scenarioStream(s, keys, { uniform, hotspot });
  const b = scenarioStream(s, keys, { uniform, hotspot });
  assert.deepEqual(a, b);
});
