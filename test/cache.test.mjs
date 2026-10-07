import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../public/store.mjs';
import { createDb } from '../public/db.mjs';
import { cacheAside, createSingleFlight } from '../public/cache.mjs';

const ROWS = [{ id: 'sku-1', name: 'Widget', price: 1, score: 1 }];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('hit-after-set: first read misses to the DB, the rest are cache hits', async () => {
  const store = createStore();
  const db = createDb(ROWS, { latencyMs: 1, sleep });
  const r1 = await cacheAside(store, db, 'sku-1');
  const r2 = await cacheAside(store, db, 'sku-1');
  assert.equal(r1.source, 'miss');
  assert.equal(r1.dbHit, true);
  assert.equal(r2.source, 'hit');
  assert.equal(db.queryCount, 1);
});

test('TTL expiry forces a refetch', async () => {
  let now = 0;
  const store = createStore({ now: () => now });
  const db = createDb(ROWS, { latencyMs: 1, sleep });
  await cacheAside(store, db, 'sku-1', { ttlMs: 100 });
  now += 101;
  const r = await cacheAside(store, db, 'sku-1', { ttlMs: 100 });
  assert.equal(r.source, 'miss');
  assert.equal(db.queryCount, 2);
});

test('naive cache-aside stampedes: 5 concurrent cold misses = 5 DB queries', async () => {
  const store = createStore();
  const db = createDb(ROWS, { latencyMs: 10, sleep });
  const results = await Promise.all(
    Array.from({ length: 5 }, () => cacheAside(store, db, 'sku-1')),
  );
  assert.equal(db.queryCount, 5);
  assert.equal(db.maxConcurrent, 5);
  assert.ok(results.every((r) => r.dbHit));
});

test('single-flight collapses the stampede: 5 misses share 1 DB query', async () => {
  const store = createStore();
  const db = createDb(ROWS, { latencyMs: 10, sleep });
  const get = createSingleFlight(store, db, { ttlMs: 1000 });
  const results = await Promise.all(Array.from({ length: 5 }, () => get('sku-1')));
  assert.equal(db.queryCount, 1);
  assert.equal(db.maxConcurrent, 1);
  assert.equal(results.filter((r) => r.dbHit).length, 1);
  assert.equal(results.filter((r) => r.shared).length, 4);
  assert.ok(results.every((r) => r.value.id === 'sku-1'));
});

test('single-flight waiters become hits once the fetch resolves', async () => {
  const store = createStore();
  const db = createDb(ROWS, { latencyMs: 5, sleep });
  const get = createSingleFlight(store, db, { ttlMs: 1000 });
  await get('sku-1');
  const r = await get('sku-1');
  assert.equal(r.source, 'hit');
  assert.equal(db.queryCount, 1);
});

test('a missing key is not cached (cache-penetration guard)', async () => {
  const store = createStore();
  const db = createDb(ROWS, { latencyMs: 1, sleep });
  const r = await cacheAside(store, db, 'nope');
  assert.equal(r.value, null);
  assert.equal(store.get('nope'), null);
});
