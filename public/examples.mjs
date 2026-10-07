// Fixtures mirrored from examples/*.json — tests assert they stay in sync.

export const PRODUCTS = [
  { id: 'sku-101', name: 'Trail runner sneakers', price: 89.99, score: 412 },
  { id: 'sku-102', name: 'Merino base layer', price: 64.5, score: 388 },
  { id: 'sku-103', name: 'Insulated bottle 1L', price: 29.95, score: 356 },
  { id: 'sku-104', name: 'Ultralight daypack', price: 119, score: 301 },
  { id: 'sku-105', name: 'Camping headlamp', price: 42, score: 274 },
  { id: 'sku-106', name: 'Trekking poles (pair)', price: 79.99, score: 240 },
  { id: 'sku-107', name: 'Rain shell jacket', price: 149, score: 233 },
  { id: 'sku-108', name: 'Wool hiking socks x3', price: 24.99, score: 198 },
  { id: 'sku-109', name: 'Portable stove kit', price: 59.5, score: 175 },
  { id: 'sku-110', name: 'Sleeping pad', price: 99, score: 150 },
  { id: 'sku-111', name: 'Water filter straw', price: 34.95, score: 121 },
  { id: 'sku-112', name: 'Dry bag 10L', price: 19.99, score: 96 },
];

export const SCENARIOS = {
  'hot-key-expiry': {
    name: 'hot-key-expiry',
    description: 'One viral product: half the traffic hits a single key. Naive cache-aside stampedes the DB when the key expires; single-flight collapses it to one query.',
    requests: 60,
    concurrency: 12,
    hotKey: 'sku-101',
    hotFrac: 0.5,
    ttlMs: 8000,
    dbLatencyMs: 60,
    seed: 42,
  },
  'catalog-browse': {
    name: 'catalog-browse',
    description: 'Uniform browsing across the whole catalog: misses only for keys never seen before, then steady hits until TTL.',
    requests: 60,
    concurrency: 8,
    hotKey: null,
    hotFrac: 0,
    ttlMs: 8000,
    dbLatencyMs: 60,
    seed: 7,
  },
};

// mulberry32 — tiny seeded PRNG so workload streams are reproducible.
export function seededRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Build the key stream a scenario describes (hotspot or uniform catalog).
export function scenarioStream(scenario, keys, { uniform, hotspot }) {
  const rng = seededRng(scenario.seed);
  if (scenario.hotKey) {
    return hotspot(keys, scenario.requests, { hotKey: scenario.hotKey, hotFrac: scenario.hotFrac }, rng);
  }
  return uniform(keys, scenario.requests, rng);
}
