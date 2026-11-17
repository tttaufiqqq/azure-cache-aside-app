import { cacheKey, deleteCached, getCached, setCached } from './cache.js';
import { getProductById, updateProductById } from './db.js';
import { log, metrics } from './metrics.js';

const inflight = new Map();

// Read path: Redis first, PostgreSQL on a miss, then a best-effort cache fill.
export async function readProduct(id) {
  const key = cacheKey(id);

  let cached = null;
  let cacheAvailable = true;
  try {
    cached = await getCached(key);
  } catch (err) {
    cacheAvailable = false;
    metrics.inc('cacheReadErrors');
    log('cache_read_error', { key, message: err.message });
  }

  if (cached) {
    metrics.inc('hits');
    return { product: cached, cache: 'HIT' };
  }

  metrics.inc(cacheAvailable ? 'misses' : 'bypasses');
  const product = await loadAndFill(id, key, cacheAvailable);
  return { product, cache: cacheAvailable ? 'MISS' : 'BYPASS' };
}

// Share one database query between concurrent misses for the same key.
function loadAndFill(id, key, cacheAvailable) {
  if (inflight.has(key)) return inflight.get(key);

  const promise = (async () => {
    metrics.inc('dbReads');
    const product = await getProductById(id);
    if (product && cacheAvailable) {
      try {
        await setCached(key, product);
      } catch (err) {
        metrics.inc('fillFailures');
        log('cache_fill_error', { key, message: err.message });
      }
    }
    return product;
  })().finally(() => inflight.delete(key));

  inflight.set(key, promise);
  return promise;
}

// Write path: commit to PostgreSQL first, then invalidate the cached key.
export async function writeProduct(id, changes) {
  metrics.inc('dbWrites');
  const product = await updateProductById(id, changes);
  if (!product) return null;

  const key = cacheKey(id);
  let invalidated = false;
  for (let attempt = 1; attempt <= 2 && !invalidated; attempt += 1) {
    try {
      await deleteCached(key);
      invalidated = true;
    } catch (err) {
      log('cache_invalidation_error', { key, attempt, message: err.message });
    }
  }

  if (!invalidated) {
    // The commit stands. The TTL limits how long the stale value can live.
    metrics.inc('invalidationFailures');
  }
  return { product, invalidated };
}
