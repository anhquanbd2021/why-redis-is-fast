# Cache Lab — companion demo

Interactive lab for the article *Why Redis Is Actually Fast — "In-Memory" Is
Only a Third of the Answer*. A simulated slow database (60 ms per query)
sits behind a miniature Redis, and the lab makes the speed story visible:
one miss pays the database once, every hit after skips it — until a hot key
expires and a naive cache stampedes the DB while single-flight sends
exactly one query.

Zero dependencies — Node 20+ only. The store, cache-aside logic, workload
runner, and leaderboard comparison are plain ES modules shared by the
browser UI, the CLI report, and the test suite.

## Three labs

| Lab | What it proves |
|---|---|
| **Latency** | 20 reads of one key through the DB vs. through cache-aside — the miss pays latency once, the 19 hits don't. |
| **Cache-aside** | A request stream over a hot key with a TTL: hits/misses, DB query count, peak concurrent fetches. Run it naive, advance the virtual clock past TTL, run it with single-flight — the same cold wave collapses to one query per key. |
| **Type** | A leaderboard two ways: fetch-all-and-sort touches every row; `ZINCRBY` + `ZREVRANGE 0 9` touches only the top ten. |

## Run it

```text
npm start        # serve the lab on :3000
npm test         # store + cache-aside + workload + server + fixture sync
npm run report   # side-by-side CLI report with hard assertions
npm run check    # both
```

## Examples

- `examples/products.json` — 12-row catalog fixture (id, name, price,
  score) used by every lab and test.
- `examples/scenario-hotkey.json` — one viral product, 50% of traffic on a
  single key: the stampede scenario.
- `examples/scenario-catalog.json` — uniform browsing: misses only for
  first-seen keys.

## Honest limits

- Latencies are **modeled, not measured** — a configurable sleep stands in
  for disk I/O and ~0 ms for RAM. The ratio is honest; the numbers are
  illustrative, not a benchmark.
- The store implements two types (strings + TTL, sorted sets) — not the
  full Redis surface, eviction policies, replication, or persistence.
- Single-flight here is an in-process promise map; real deployments use a
  lock key (`SET NX`), request coalescing middleware, or client-side
  deduplication — same mechanics, distributed coordination.
- TTL expiry is lazy-on-access (as Redis also does) driven by an
  injectable clock; the UI advances it manually so expiry is observable.
- This is an educational demo, not production infrastructure.
