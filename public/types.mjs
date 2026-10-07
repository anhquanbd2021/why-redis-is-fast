// The data structure IS the performance — a leaderboard two ways.
// Both return the same top-N result; `rowsTouched` is the honest cost meter.

// Fetch-all-and-sort: read every row, sort in the app, slice the top.
// Cost grows with the table — 50,000 players = 50,000 rows read per view.
export function topScorersScan(rows, topN) {
  const sorted = [...rows].sort((a, b) => b.score - a.score).slice(0, topN);
  return { top: sorted.map(({ id, score }) => ({ member: id, score })), rowsTouched: rows.length };
}

// Sorted set: updates are ZINCRBY (log n each), the read is ZREVRANGE
// 0 topN-1 — fixed small cost no matter how many members exist.
export function topScorersZset(store, key, topN) {
  const top = store.zrevrange(key, 0, topN - 1);
  return { top, rowsTouched: top.length };
}
