import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PRODUCTS, SCENARIOS, seededRng, scenarioStream } from '../public/examples.mjs';
import { uniform, hotspot } from '../public/workload.mjs';

const read = (name) => JSON.parse(readFileSync(new URL(`../examples/${name}`, import.meta.url), 'utf8'));

test('examples/products.json mirrors the PRODUCTS fixture', () => {
  assert.deepEqual(read('products.json'), PRODUCTS);
});

test('scenario JSON files mirror the SCENARIOS fixture', () => {
  assert.deepEqual(read('scenario-hotkey.json'), SCENARIOS['hot-key-expiry']);
  assert.deepEqual(read('scenario-catalog.json'), SCENARIOS['catalog-browse']);
});

test('every scenario key resolves to a real product', () => {
  const ids = new Set(PRODUCTS.map((p) => p.id));
  for (const s of Object.values(SCENARIOS)) {
    if (s.hotKey) assert.ok(ids.has(s.hotKey), `${s.name} hotKey must exist`);
    const stream = scenarioStream(s, [...ids], { uniform, hotspot });
    assert.ok(stream.every((k) => ids.has(k)), `${s.name} stream stays in the catalog`);
  }
});

test('seeded rng is deterministic and bounded', () => {
  const a = seededRng(42);
  const b = seededRng(42);
  for (let i = 0; i < 100; i += 1) {
    const v = a();
    assert.equal(v, b());
    assert.ok(v >= 0 && v < 1);
  }
});
