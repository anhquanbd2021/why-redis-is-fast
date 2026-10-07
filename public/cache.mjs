// Cache-aside — the default pattern for putting a store in front of a
// database. Two implementations: naive (every concurrent miss fetches) and
// single-flight (the first miss fetches, concurrent callers share it).

// Naive cache-aside: check cache → on miss, fetch DB → populate → return.
// Under concurrency, N simultaneous misses all reach the DB — the stampede.
export async function cacheAside(store, db, key, { ttlMs = 5000 } = {}) {
  const cached = store.get(key);
  if (cached !== null) return { value: cached, source: 'hit', dbHit: false };

  const value = await db.fetch(key);
  if (value !== null) store.set(key, value, { ttlMs });
  return { value, source: 'miss', dbHit: true };
}

// Single-flight cache-aside: an in-flight map makes the first misser own
// the DB fetch; later misses await the same promise. One query, N readers.
export function createSingleFlight(store, db, { ttlMs = 5000 } = {}) {
  const inflight = new Map();

  return async function get(key) {
    const cached = store.get(key);
    if (cached !== null) return { value: cached, source: 'hit', dbHit: false };

    const pending = inflight.get(key);
    if (pending) {
      const value = await pending;
      return { value, source: 'miss', dbHit: false, shared: true };
    }

    const fetching = db.fetch(key)
      .then((value) => {
        if (value !== null) store.set(key, value, { ttlMs });
        return value;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, fetching);

    const value = await fetching;
    return { value, source: 'miss', dbHit: true };
  };
}
