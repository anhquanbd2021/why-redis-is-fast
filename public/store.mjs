// Mini Redis — a teaching model of the real thing.
// Two structures only: strings with optional TTL, and sorted sets.
// Expiry is lazy (checked on access, like Redis's active+lazy mix) and the
// clock is injectable so tests and the UI can advance time deterministically.

export function createStore({ now = () => Date.now() } = {}) {
  const strings = new Map(); // key -> { value, expiresAt: number|null }
  const zsets = new Map();   // key -> Map(member -> score)
  const commands = Object.create(null);

  const count = (name) => { commands[name] = (commands[name] || 0) + 1; };
  const live = (key) => {
    const entry = strings.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt <= now()) {
      strings.delete(key);
      return null;
    }
    return entry;
  };

  const store = {
    get(key) {
      count('GET');
      const entry = live(key);
      return entry ? entry.value : null;
    },

    // set(key, value, { ttlMs, nx }) — nx mirrors SET key val NX:
    // returns 'OK' on write, null when nx refused because the key exists.
    set(key, value, { ttlMs = null, nx = false } = {}) {
      count('SET');
      if (nx && live(key)) return null;
      strings.set(key, {
        value,
        expiresAt: ttlMs === null ? null : now() + ttlMs,
      });
      return 'OK';
    },

    del(...keys) {
      count('DEL');
      let removed = 0;
      for (const key of keys) if (strings.delete(key) || zsets.delete(key)) removed += 1;
      return removed;
    },

    expire(key, ttlMs) {
      count('EXPIRE');
      const entry = live(key);
      if (!entry) return 0;
      entry.expiresAt = now() + ttlMs;
      return 1;
    },

    // ttl(key) — mirrors Redis: ms remaining, -1 no expiry, -2 missing.
    ttl(key) {
      count('TTL');
      const entry = live(key);
      if (!entry) return -2;
      return entry.expiresAt === null ? -1 : Math.max(0, entry.expiresAt - now());
    },

    incr(key) {
      count('INCR');
      const entry = live(key);
      const next = (entry ? Number.parseInt(entry.value, 10) : 0) + 1;
      strings.set(key, { value: String(next), expiresAt: entry ? entry.expiresAt : null });
      return next;
    },

    zincrby(key, member, delta) {
      count('ZINCRBY');
      let z = zsets.get(key);
      if (!z) zsets.set(key, (z = new Map()));
      const score = (z.get(member) || 0) + delta;
      z.set(member, score);
      return score;
    },

    // zrevrange(key, start, stop) — top scores first; cost is O(log n +
    // topN) in real Redis, here a sort over the fixture members.
    zrevrange(key, start, stop) {
      count('ZREVRANGE');
      const z = zsets.get(key);
      if (!z) return [];
      return [...z.entries()]
        .map(([member, score]) => ({ member, score }))
        .sort((a, b) => b.score - a.score)
        .slice(start, stop + 1);
    },

    zcard(key) {
      count('ZCARD');
      return zsets.get(key)?.size || 0;
    },

    // dbsize — number of live string keys + sorted-set keys.
    dbsize() {
      count('DBSIZE');
      for (const key of [...strings.keys()]) live(key);
      return strings.size + zsets.size;
    },

    stats() {
      return { commands: { ...commands }, keyspace: store.dbsize() };
    },
  };

  return store;
}
