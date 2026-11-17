const counters = {
  hits: 0,
  misses: 0,
  bypasses: 0,
  cacheReadErrors: 0,
  fillFailures: 0,
  invalidationFailures: 0,
  dbReads: 0,
  dbWrites: 0,
};

export const metrics = {
  inc(name) {
    counters[name] += 1;
  },
  snapshot() {
    const lookups = counters.hits + counters.misses;
    return {
      ...counters,
      hitRatio: lookups === 0 ? null : Number((counters.hits / lookups).toFixed(3)),
    };
  },
};

export function log(event, fields = {}) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...fields }));
}
