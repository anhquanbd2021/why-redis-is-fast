import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../public/store.mjs';

test('set/get round-trips a value', () => {
  const s = createStore();
  s.set('k', 'v');
  assert.equal(s.get('k'), 'v');
});

test('SET NX refuses to overwrite an existing key', () => {
  const s = createStore();
  assert.equal(s.set('k', 'v1', { nx: true }), 'OK');
  assert.equal(s.set('k', 'v2', { nx: true }), null);
  assert.equal(s.get('k'), 'v1');
});

test('TTL expiry: key lives, then dies when the clock passes', () => {
  let now = 1000;
  const s = createStore({ now: () => now });
  s.set('k', 'v', { ttlMs: 500 });
  assert.equal(s.get('k'), 'v');
  assert.ok(s.ttl('k') <= 500 && s.ttl('k') > 0);
  now += 501;
  assert.equal(s.get('k'), null);
  assert.equal(s.ttl('k'), -2);
});

test('expire() sets a TTL on a live key; missing key returns 0', () => {
  let now = 0;
  const s = createStore({ now: () => now });
  s.set('k', 'v');
  assert.equal(s.ttl('k'), -1);
  assert.equal(s.expire('k', 100), 1);
  now += 101;
  assert.equal(s.get('k'), null);
  assert.equal(s.expire('gone', 100), 0);
});

test('INCR is an atomic counter starting at 1', () => {
  const s = createStore();
  assert.equal(s.incr('n'), 1);
  assert.equal(s.incr('n'), 2);
  assert.equal(s.get('n'), '2');
});

test('sorted set: ZINCRBY accumulates, ZREVRANGE returns top scores first', () => {
  const s = createStore();
  s.zincrby('board', 'a', 10);
  s.zincrby('board', 'b', 30);
  s.zincrby('board', 'a', 5);
  s.zincrby('board', 'c', 20);
  const top2 = s.zrevrange('board', 0, 1);
  assert.deepEqual(top2, [{ member: 'b', score: 30 }, { member: 'c', score: 20 }]);
  assert.equal(s.zcard('board'), 3);
});

test('stats() counts commands', () => {
  const s = createStore();
  s.set('a', 1);
  s.get('a');
  s.get('a');
  const { commands } = s.stats();
  assert.equal(commands.SET, 1);
  assert.equal(commands.GET, 2);
});
