# Troubleshooting

This article lists common problems and how to resolve them.

## 1. View the app logs

Stream the console logs.

```bash
az webapp log tail \
  --resource-group rg-cache-aside-lab \
  --name <appName>
```

You can also query the `AppServiceConsoleLogs` table in Log Analytics.

## 2. The health endpoint shows `schemaReady: false`

**Symptom:** `GET /health` keeps returning `"schemaReady":false`.

**Fix:** Look for `schema_init_error` entries in the logs. The app retries automatically.

- A connection timeout or DNS error means the private endpoint or private DNS isn't ready. See the infrastructure troubleshooting guide.
- An authentication error means the managed identity isn't a PostgreSQL Entra administrator.
- A certificate error means Node doesn't trust the server certificate chain. Check the error text before you change TLS settings.

## 3. Every response has `X-Cache: BYPASS`

**Symptom:** The app works but never caches.

**Fix:** The app can't use Redis. Look for `redis_error` and `cache_read_error` entries in the logs.

- Confirm that `REDIS_HOST` matches the `redisHost` deployment output.
- Confirm that the identity has the `default` data access policy on the Redis database.
- Confirm that the Redis private DNS zone is linked to the virtual network.

## 4. Every response is `MISS` and never `HIT`

**Symptom:** The cache is reachable but values don't stay.

**Fix:** Check `CACHE_TTL_SECONDS`. A very small value expires keys before the next request. Also check `fillFailures` in `GET /stats`.

## 5. The app returns 502 or 503 after deployment

**Symptom:** The site doesn't respond after you deploy.

**Fix:**

1. Confirm that the build finished. The `SCM_DO_BUILD_DURING_DEPLOYMENT` setting makes App Service run `npm install`.
1. Check the logs for a `Missing required environment variable` error.
1. Wait a minute and retry. The health check can delay traffic to a new instance.

## 6. A write returns `X-Cache-Invalidated: false`

**Symptom:** The update succeeded but Redis couldn't delete the key.

**Fix:** This is expected during a Redis outage. The stale value expires when its TTL ends. Check `invalidationFailures` in `GET /stats`.
