// Workload streams + a concurrency-limited runner that collects the stats
// the article makes claims about: hit/miss counts, DB query count, and
// observed latency per request.

const defaultRng = () => Math.random();

// uniform(keys, n) — every key equally likely (catalog browsing).
export function uniform(keys, n, rng = defaultRng) {
  return Array.from({ length: n }, () => keys[Math.floor(rng() * keys.length)]);
}

// hotspot(keys, n, { hotKey, hotFrac }) — one key gets `hotFrac` of the
// traffic, the rest spreads uniformly (a viral product page).
export function hotspot(keys, n, { hotKey, hotFrac = 0.5 } = {}, rng = defaultRng) {
  const rest = keys.filter((k) => k !== hotKey);
  return Array.from({ length: n }, () => (
    rng() < hotFrac ? hotKey : rest[Math.floor(rng() * rest.length)]
  ));
}

// runWorkload(stream, handler, { concurrency }) — workers pull keys until
// the stream is drained; handler is (key) => Promise<{source, dbHit}>.
export async function runWorkload(stream, handler, {
  concurrency = 8,
  now = () => performance.now(),
} = {}) {
  const latencies = [];
  let hits = 0;
  let misses = 0;
  let dbQueries = 0;
  let i = 0;

  async function worker() {
    while (i < stream.length) {
      const key = stream[i];
      i += 1;
      const start = now();
      const res = await handler(key);
      latencies.push(now() - start);
      if (res.source === 'hit') hits += 1; else misses += 1;
      if (res.dbHit) dbQueries += 1;
    }
  }

  const workers = Array.from(
    { length: Math.max(1, Math.min(concurrency, stream.length)) },
    worker,
  );
  await Promise.all(workers);
  latencies.sort((a, b) => a - b);

  const sum = latencies.reduce((acc, v) => acc + v, 0);
  const p95 = latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))] ?? 0;
  return {
    requests: stream.length,
    hits,
    misses,
    dbQueries,
    hitRate: stream.length ? hits / stream.length : 0,
    avgLatencyMs: stream.length ? sum / stream.length : 0,
    p95LatencyMs: p95,
  };
}
