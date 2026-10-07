// SlowDb — a teaching model of the database Redis usually sits in front of.
// Every fetch pays `latencyMs` (simulated disk I/O), every fetch is logged,
// and in-flight/max-concurrent counters make a cache stampede measurable.

const realSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function createDb(rows, { latencyMs = 60, sleep = realSleep } = {}) {
  const table = new Map(rows.map((row) => [row.id, row]));
  const queryLog = [];
  let inFlight = 0;
  let maxConcurrent = 0;

  return {
    latencyMs,

    async fetch(key) {
      queryLog.push(key);
      inFlight += 1;
      if (inFlight > maxConcurrent) maxConcurrent = inFlight;
      try {
        await sleep(latencyMs);
        return table.get(key) ?? null;
      } finally {
        inFlight -= 1;
      }
    },

    get queryCount() { return queryLog.length; },
    get inFlight() { return inFlight; },
    get maxConcurrent() { return maxConcurrent; },
    resetPeak() { maxConcurrent = inFlight; },
    queryLog() { return [...queryLog]; },
    rowCount() { return table.size; },
    rows() { return [...table.values()]; },
  };
}
