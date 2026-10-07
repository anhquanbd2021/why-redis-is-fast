import { createStore } from '/store.mjs';
import { createDb } from '/db.mjs';
import { cacheAside, createSingleFlight } from '/cache.mjs';
import { uniform, hotspot, runWorkload } from '/workload.mjs';
import { topScorersScan, topScorersZset } from '/types.mjs';
import { PRODUCTS, SCENARIOS, seededRng } from '/examples.mjs';

const $ = (id) => document.getElementById(id);
const KEYS = PRODUCTS.map((p) => p.id);
const fmtMs = (v) => `${v < 1 ? v.toFixed(2) : v.toFixed(1)} ms`;

/* ---------- Latency lab ---------- */
const latKey = $('lat-key');
for (const p of PRODUCTS) latKey.add(new Option(`${p.id} — ${p.name}`, p.id));
const latRange = $('lat-dbms');
latRange.addEventListener('input', () => { $('lat-dbms-out').textContent = `${latRange.value} ms`; });

$('lat-run').addEventListener('click', async () => {
  const key = latKey.value;
  const latencyMs = Number(latRange.value);
  $('lat-badge').textContent = 'Running…';

  const dbOnly = createDb(PRODUCTS, { latencyMs });
  const dbStats = await runWorkload(uniform([key], 20), (k) => dbOnly.fetch(k).then((v) => ({ value: v, source: 'miss', dbHit: true })), { concurrency: 1 });

  const store = createStore();
  const dbCached = createDb(PRODUCTS, { latencyMs });
  const cacheStats = await runWorkload(uniform([key], 20), (k) => cacheAside(store, dbCached, k, { ttlMs: 60000 }), { concurrency: 1 });

  $('lat-db-avg').textContent = fmtMs(dbStats.avgLatencyMs);
  $('lat-db-detail').textContent = `${dbStats.dbQueries} DB queries · ${dbStats.requests} reads`;
  $('lat-cache-avg').textContent = fmtMs(cacheStats.avgLatencyMs);
  $('lat-cache-detail').textContent = `${dbCached.queryCount} DB quer${dbCached.queryCount === 1 ? 'y' : 'ies'} + ${cacheStats.hits} cache hits · ${cacheStats.requests} reads`;

  const max = Math.max(dbStats.avgLatencyMs, cacheStats.avgLatencyMs, 0.001);
  $('lat-bar-db').style.width = `${(dbStats.avgLatencyMs / max) * 100}%`;
  $('lat-bar-cache').style.width = `${Math.max(2, (cacheStats.avgLatencyMs / max) * 100)}%`;
  const speedup = dbStats.avgLatencyMs / Math.max(cacheStats.avgLatencyMs, 0.01);
  $('lat-badge').textContent = `~${Math.round(speedup)}× faster cached`;
});

/* ---------- Cache-aside lab ---------- */
let vnow = 0;
let store;
let db;
let scenario;
const scenarioSel = $('scenario');
for (const [name, s] of Object.entries(SCENARIOS)) scenarioSel.add(new Option(name, name));

function resetLab() {
  vnow = 0;
  scenario = SCENARIOS[scenarioSel.value];
  store = createStore({ now: () => vnow });
  db = createDb(PRODUCTS, { latencyMs: scenario.dbLatencyMs });
  $('scenario-desc').textContent = `${scenario.description} (TTL ${scenario.ttlMs / 1000}s, ${scenario.requests} requests, concurrency ${scenario.concurrency})`;
  $('event-log').replaceChildren();
  for (const id of ['st-hits', 'st-misses', 'st-db', 'st-peak', 'st-avg', 'st-p95']) $(id).textContent = '—';
  $('aside-badge').textContent = 'Ready';
}
scenarioSel.addEventListener('change', resetLab);

function scenarioKeys() {
  const rng = seededRng(scenario.seed);
  return scenario.hotKey
    ? hotspot(KEYS, scenario.requests, { hotKey: scenario.hotKey, hotFrac: scenario.hotFrac }, rng)
    : uniform(KEYS, scenario.requests, rng);
}

async function runLab(mode) {
  const handler = mode === 'naive'
    ? (k) => cacheAside(store, db, k, { ttlMs: scenario.ttlMs })
    : createSingleFlight(store, db, { ttlMs: scenario.ttlMs });
  const log = $('event-log');
  log.replaceChildren();
  const dbBefore = db.queryCount;
  db.resetPeak();
  $('aside-badge').textContent = 'Running…';

  const stream = scenarioKeys();
  const stats = await runWorkload(stream, async (k) => {
    const res = await handler(k);
    const li = document.createElement('li');
    li.className = `result ${res.source === 'hit' ? 'pass' : res.dbHit ? 'fail' : 'warn'}`;
    li.innerHTML = `<div class="result-head"><span class="badge ${res.source === 'hit' ? 'pass' : res.dbHit ? 'fail' : 'warn'}">${res.source === 'hit' ? 'HIT' : res.shared ? 'MISS·shared' : 'MISS→DB'}</span><code>${k}</code></div>`;
    log.appendChild(li);
    return res;
  }, { concurrency: scenario.concurrency });

  const dbRun = db.queryCount - dbBefore;
  const peakRun = db.maxConcurrent;
  $('st-hits').textContent = stats.hits;
  $('st-misses').textContent = stats.misses;
  $('st-db').textContent = dbRun;
  $('st-peak').textContent = peakRun;
  $('st-avg').textContent = fmtMs(stats.avgLatencyMs);
  $('st-p95').textContent = fmtMs(stats.p95LatencyMs);
  $('aside-badge').textContent = mode === 'naive'
    ? `naive — ${dbRun} DB queries this run, peak ${peakRun} concurrent`
    : `single-flight — ${dbRun} DB quer${dbRun === 1 ? 'y' : 'ies'} this run, peak ${peakRun}`;
}

$('run-naive').addEventListener('click', () => runLab('naive'));
$('run-safe').addEventListener('click', () => runLab('safe'));
$('advance').addEventListener('click', () => {
  vnow += scenario.ttlMs + 1;
  $('aside-badge').textContent = `clock +${scenario.ttlMs + 1} ms — every TTL'd key is now expired`;
});
$('reset').addEventListener('click', resetLab);
resetLab();

/* ---------- Type lab ---------- */
$('type-run').addEventListener('click', () => {
  const rng = seededRng(2026);
  const rows = PRODUCTS.map((p) => ({ ...p }));           // the "table"
  const lb = createStore({ now: () => vnow });
  for (const p of PRODUCTS) lb.zincrby('board', p.id, p.score);
  for (let i = 0; i < 120; i += 1) {
    const idx = Math.floor(rng() * rows.length);
    const delta = Math.floor(rng() * 25);
    rows[idx].score += delta;                             // UPDATE row
    lb.zincrby('board', rows[idx].id, delta);             // ZINCRBY
  }
  const scan = topScorersScan(rows, 10);
  const zset = topScorersZset(lb, 'board', 10);

  $('type-scan-cost').textContent = scan.rowsTouched;
  $('type-zset-cost').textContent = zset.rowsTouched;
  $('type-badge').textContent = `${rows.length} players · 120 updates`;
  const board = $('board');
  board.replaceChildren();
  for (const { member, score } of zset.top) {
    const p = PRODUCTS.find((r) => r.id === member);
    const li = document.createElement('li');
    li.innerHTML = `<strong>${p ? p.name : member}</strong> <span class="muted">${member} · ${score} pts</span>`;
    board.appendChild(li);
  }
});
