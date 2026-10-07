// Side-by-side CLI report: same workload, three paths.
// Prints the numbers the article claims, then asserts them — exit 1 on any
// broken claim so `npm run check` gates a deploy on the story being true.

import { createStore } from '../public/store.mjs';
import { createDb } from '../public/db.mjs';
import { cacheAside, createSingleFlight } from '../public/cache.mjs';
import { uniform, hotspot, runWorkload } from '../public/workload.mjs';
import { topScorersScan, topScorersZset } from '../public/types.mjs';
import { PRODUCTS, SCENARIOS, seededRng, scenarioStream } from '../public/examples.mjs';

const KEYS = PRODUCTS.map((p) => p.id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const failures = [];
const check = (label, cond, detail) => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label} ${detail ? `(${detail})` : ''}`);
  if (!cond) failures.push(label);
};
const row = (label, { requests, hits, misses, dbQueries, avgLatencyMs, p95LatencyMs }, peak) =>
  console.log(
    `${label.padEnd(22)} reqs=${String(requests).padStart(3)} ` +
    `hits=${String(hits).padStart(3)} misses=${String(misses).padStart(3)} ` +
    `db=${String(dbQueries).padStart(3)} peakDb=${String(peak).padStart(2)} ` +
    `avg=${avgLatencyMs.toFixed(2).padStart(6)}ms p95=${p95LatencyMs.toFixed(2).padStart(6)}ms`,
  );

/* 1 — Latency: same key, DB-only vs cached ------------------------------ */
console.log('\n== Latency: 20 reads of sku-101 ==');
{
  const db = createDb(PRODUCTS, { latencyMs: 5, sleep });
  const dbStats = await runWorkload(uniform(['sku-101'], 20), async (k) => ({
    value: await db.fetch(k), source: 'miss', dbHit: true,
  }), { concurrency: 1 });
  const store = createStore();
  const db2 = createDb(PRODUCTS, { latencyMs: 5, sleep });
  const cacheStats = await runWorkload(uniform(['sku-101'], 20), (k) =>
    cacheAside(store, db2, k, { ttlMs: 60000 }), { concurrency: 1 });
  row('database only', dbStats, db.maxConcurrent);
  row('cache-aside', cacheStats, db2.maxConcurrent);
  check('cache-aside queries the DB exactly once', db2.queryCount === 1, `${db2.queryCount} query`);
  check('cached reads are faster on average', cacheStats.avgLatencyMs < dbStats.avgLatencyMs,
    `${cacheStats.avgLatencyMs.toFixed(2)}ms vs ${dbStats.avgLatencyMs.toFixed(2)}ms`);
}

/* 2 — Stampede: hot key, cold cache, concurrent wave -------------------- */
console.log('\n== Stampede: hot-key-expiry scenario, cold cache ==');
const scenario = SCENARIOS['hot-key-expiry'];
const stream = scenarioStream(scenario, KEYS, { uniform, hotspot });
const distinct = new Set(stream).size;
{
  let vnow = 0;
  const store = createStore({ now: () => vnow });
  const db = createDb(PRODUCTS, { latencyMs: 5, sleep });
  const naive = await runWorkload(stream, (k) => cacheAside(store, db, k, { ttlMs: scenario.ttlMs }),
    { concurrency: scenario.concurrency });
  row('naive cache-aside', naive, db.maxConcurrent);

  vnow = 0;
  const store2 = createStore({ now: () => vnow });
  const db2 = createDb(PRODUCTS, { latencyMs: 5, sleep });
  const sf = await runWorkload(stream, createSingleFlight(store2, db2, { ttlMs: scenario.ttlMs }),
    { concurrency: scenario.concurrency });
  row('single-flight', sf, db2.maxConcurrent);

  check('naive stampedes: more DB queries than distinct keys', db.queryCount > distinct,
    `${db.queryCount} queries vs ${distinct} distinct keys`);
  check('single-flight collapses to one query per key', db2.queryCount === distinct,
    `${db2.queryCount} queries, ${distinct} distinct keys`);
  check('single-flight never duplicates an in-flight hot-key fetch', db2.maxConcurrent <= distinct,
    `peak ${db2.maxConcurrent} concurrent fetches`);
}

/* 3 — TTL expiry: a key must die on schedule ---------------------------- */
console.log('\n== TTL expiry ==');
{
  let vnow = 0;
  const store = createStore({ now: () => vnow });
  store.set('sku-101', { cached: true }, { ttlMs: 100 });
  check('key is live before TTL', store.get('sku-101') !== null);
  vnow += 101;
  check('key is gone after TTL', store.get('sku-101') === null, `ttl now ${store.ttl('sku-101')}`);
}

/* 4 — Types: leaderboard cost ------------------------------------------- */
console.log('\n== Type lab: top 10 of 12 players ==');
{
  const store = createStore();
  for (const p of PRODUCTS) store.zincrby('board', p.id, p.score);
  const scan = topScorersScan(PRODUCTS.map((p) => ({ id: p.id, score: p.score })), 10);
  const zset = topScorersZset(store, 'board', 10);
  console.log(`  fetch-all-and-sort: ${scan.rowsTouched} rows touched · sorted set: ${zset.rowsTouched} rows touched`);
  check('sorted set reads only the top N', zset.rowsTouched === 10, `${zset.rowsTouched} vs ${scan.rowsTouched}`);
  check('both return the same #1', scan.top[0].member === zset.top[0].member, zset.top[0].member);
}

/* ---- verdict ----------------------------------------------------------- */
if (failures.length) {
  console.error(`\n${failures.length} claim(s) failed:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('\nAll claims hold. The lab tells the truth.');
