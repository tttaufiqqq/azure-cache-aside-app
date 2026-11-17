# Architecture

This article explains how the app implements the cache-aside pattern. For the Azure resources, see the `cache-aside-infra` repository.

## Code map

| File | Responsibility |
|---|---|
| `src/server.js` | Routes, input validation, startup, and shutdown |
| `src/products.js` | The cache-aside read path and write path |
| `src/cache.js` | Redis client, key format, TTL, and timeouts |
| `src/db.js` | PostgreSQL pool, queries, and schema setup |
| `src/metrics.js` | Counters and structured logs |
| `src/config.js` | Environment variables |
| `src/schema.sql` | Table definition and seed rows |

All cache rules live in `cache.js` and `products.js`, so you can change them in one place.

## Read path

`GET /products/:id` follows these steps:

1. Look up `product:{id}:v1` in Redis.
1. On a hit, return the value with `X-Cache: HIT`.
1. On a miss, query PostgreSQL, store the result in Redis, and return it with `X-Cache: MISS`.
1. If Redis fails, query PostgreSQL and return the result with `X-Cache: BYPASS`.

Concurrent misses for the same key share one database query.

## Write path

`PUT /products/:id` follows these steps:

1. Commit the change to PostgreSQL.
1. Delete the cache key. The app tries twice.
1. Return the updated row.

If both deletes fail, the commit still stands. The response sets `X-Cache-Invalidated: false`, and the TTL limits how long the stale value lives.

## Cache rules

| Rule | Value |
|---|---|
| Key format | `product:{id}:v1`, so you can change the format by bumping the version |
| TTL | `CACHE_TTL_SECONDS`, with up to 10% random jitter |
| Operation timeout | `CACHE_TIMEOUT_MS`, 250 ms by default |
| Offline behavior | Commands fail fast and reads fall back to PostgreSQL |
| Missing rows | Not cached |

## Authentication

The app uses the user-assigned managed identity that the infrastructure creates.

- **Redis:** `@redis/entraid` requests a token and refreshes it before it expires.
- **PostgreSQL:** the connection pool requests a fresh token for each new connection. The identity name is the database role.

No password or key is stored anywhere.

## Startup

The server starts first, then runs `schema.sql` in the background and retries until PostgreSQL is reachable. `GET /health` reports `schemaReady`.

## Observability

The app writes structured JSON logs to the console. App Service sends them to Log Analytics.

`GET /stats` returns counters for hits, misses, bypasses, cache errors, fill failures, invalidation failures, and database reads and writes. The counters live in memory on each instance and reset when the app restarts.

> [!NOTE]
> The app doesn't include the Application Insights SDK. The infrastructure creates the resource so you can add instrumentation later.
