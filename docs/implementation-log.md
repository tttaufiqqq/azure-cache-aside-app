# Implementation log

This log records how the web app was built, deployed, and tested on 17 November 2026. It lists what happened, what was verified, and why each decision was made.

## 1. Goal

Build the smallest app that shows the cache-aside pattern from the [Azure Architecture Center article](https://learn.microsoft.com/en-us/azure/architecture/databases/architecture/cache-aside-azure-managed-redis-postgresql) running on the infrastructure from the [cache-aside-infra](https://github.com/tttaufiqqq/azure-cache-aside-infra-architecture) repository.

## 2. Decisions

| Decision | Choice | Reason |
|---|---|---|
| Runtime and framework | Node.js 22 with Fastify | One small server with no build step |
| Libraries | `pg`, `redis`, `@redis/entraid`, `@azure/identity` | The minimum for Microsoft Entra authentication to both services |
| Frontend | None | The `X-Cache` header and `curl` show the pattern |
| Cache rules | One module owns the key format, TTL, and invalidation | Changes happen in one place |
| Key format | `product:{id}:v1` | Bumping the version invalidates every old key |
| TTL | Configurable, with up to 10% jitter | Keys filled together don't expire together |
| Cache failures | Reads fall back to PostgreSQL, and writes never roll back | Redis is never the source of truth |
| Concurrent misses | One shared database query per key | Prevents a stampede on a cold key |
| Metrics | In-memory counters and structured console logs | No extra service or dependency |
| Packaging in PowerShell | `tar -a`, not `Compress-Archive` | `tar` writes forward-slash paths that Linux App Service needs |
| Load testing | k6 | JavaScript scripts, and no extra Azure resources |

## 3. Timeline

| Step | What happened | Result |
|---|---|---|
| 1 | Wrote the app and checked every file with `node --check` | No errors |
| 2 | Tested the cache logic with mocked cache and database modules | Passed: miss then hit, write then invalidate, invalidation retry and failure, Redis-down fallback, and the stampede guard |
| 3 | Started the server with fake settings | `/health` and `/stats` responded, and invalid input returned 400 |
| 4 | Packaged the app with `tar` and ran `az webapp deploy` | `RuntimeSuccessful`, and the site started after about 94 seconds |
| 5 | Checked `/health` | `schemaReady: true` |
| 6 | Read `/products/1` twice | `X-Cache: MISS`, then `X-Cache: HIT` |
| 7 | Updated the product with `PUT` | `x-cache-invalidated: true` and the new price |
| 8 | Read the product again | `X-Cache: MISS` with the new price |
| 9 | Read `/stats` | 1 hit, 2 misses, 2 database reads, 1 database write |
| 10 | Streamed the app log | Request logs only, with no `redis_error` or `schema_init_error` lines |
| 11 | Wrote the k6 script and checked it against a local mock server | Hit and miss latency were recorded separately, and the thresholds and the missing-`BASE_URL` error behaved as designed |
| 12 | Ran the k6 test against the deployed app with 10 virtual users for 75 seconds | All thresholds passed: 2,876 requests, 0% failed, and a 94.46% hit rate |

## 4. What was verified

| Check | Evidence |
|---|---|
| The app reaches PostgreSQL through the private endpoint with its managed identity | `schemaReady: true` |
| The app reaches Redis through the private endpoint with its managed identity | `X-Cache: HIT` on the second read |
| A write invalidates the cached key | A read after the write returned `X-Cache: MISS` with the new price |
| The counters are consistent | Two database reads, one write, and one hit matched the requests sent |
| The cache holds up under concurrent load | A 94.46% hit rate across 2,730 reads, with 0% failed requests |
| Hits are faster than misses | Median 23.6 ms for hits and 30.3 ms for misses, measured from a laptop |
| Writes explain the misses | 144 writes in the run and 150 misses, because each write deletes a key |
| The stampede guard shares queries | 146 database reads for 153 reads that weren't hits, so seven reads shared a running query |
| A cache read failure falls back to PostgreSQL | One bypassed read returned 200 in 377 ms, and `cacheReadErrors` showed 1 |

## 5. Notes

- `GET /` returns 404 because the app has no root route. The routes are `/health`, `/products`, `/products/:id`, and `/stats`.
- Application Insights is not instrumented. The infrastructure creates the resource, but the app sends only structured console logs to Log Analytics.
- The `/stats` counters live in memory on one instance and reset on restart.
- The latency numbers include the round trip from a laptop to Azure, so only compare hits and misses within the same run.
- The cause of the single bypassed read wasn't investigated. The app logs a `cache_read_error` event for each one.

## 6. Related resources

- [Deploy and test](deploy.md)
- [Load testing with k6](load-testing.md)
- [Architecture](architecture.md)
- [Troubleshooting](troubleshooting.md)
