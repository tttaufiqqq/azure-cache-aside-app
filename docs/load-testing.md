# Load testing with k6

This article shows how to run a k6 load test against the deployed app and read the results. The test compares the latency of cache hits and cache misses and checks that the cache holds up under concurrent traffic.

## Before you begin

- Deploy the infrastructure and the app, and confirm that `GET /health` returns `"schemaReady":true`.
- Install k6. On Windows, run `winget install k6`. For other platforms, see [Install k6](https://grafana.com/docs/k6/latest/set-up/install-k6/).

## Run the test

Get the app URL, then run the script from the repository root.

```powershell
$APP_URL = az deployment group show -g rg-cache-aside-lab -n cache-aside --query properties.outputs.appUrl.value -o tsv
k6 run -e BASE_URL=$APP_URL loadtests/read-heavy.js
```

In Bash, use `APP_URL=$(az deployment group show ... -o tsv)` and `-e BASE_URL="$APP_URL"`.

The default run takes about 75 seconds.

## What the test does

1. Checks `GET /health` and stops if the schema isn't ready.
1. Ramps up to 10 virtual users over 10 seconds, holds for 60 seconds, then ramps down over 5 seconds.
1. Sends about 95% reads and 5% writes across product IDs 1 to 5.
1. Reads the `X-Cache` header on every read and records its latency under `HIT`, `MISS`, or `BYPASS`.
1. Prints the server's `GET /stats` counters when it finishes.

## Options

Pass options with `-e NAME=value`.

| Option | Default | Description |
|---|---|---|
| `BASE_URL` | None, required | App URL, without a trailing slash |
| `VUS` | `10` | Number of virtual users |
| `DURATION` | `60s` | How long to hold the load |
| `WRITE_RATIO` | `0.05` | Share of requests that are writes |

Example with more writes:

```powershell
k6 run -e BASE_URL=$APP_URL -e WRITE_RATIO=0.2 loadtests/read-heavy.js
```

## Custom metrics

| Metric | Meaning |
|---|---|
| `cache_hit_duration` | Latency of reads answered from Redis |
| `cache_miss_duration` | Latency of reads that queried PostgreSQL |
| `cache_bypass_duration` | Latency of reads served while Redis was unavailable |
| `cache_hit_rate` | Share of reads that were hits |
| `cache_bypasses` | Number of reads that bypassed the cache |
| `invalidation_failures` | Number of writes whose cache invalidation failed |

## Thresholds

The test fails if any threshold is crossed.

| Threshold | Limit |
|---|---|
| `http_req_failed` | Below 1% |
| `checks` | Above 99% |
| `cache_hit_rate` | Above 80% |
| `cache_hit_duration` | p95 below 500 ms |

Adjust the limits in the `options` block of `loadtests/read-heavy.js` to fit your network.

## Read the results

- **Hit and miss latency:** A miss includes a PostgreSQL query and a Redis write, so it should be slower than a hit. Both include the round trip from your computer to Azure, which can be larger than the difference between them. Compare hits and misses within the same run.
- **Hit rate:** With five keys and a 60-second TTL, most reads are hits. Each write deletes a key, so the next read of that key is a miss. A higher `WRITE_RATIO` lowers the hit rate.
- **Bypasses:** Any value above zero in `cache_bypasses` means Redis was unreachable and reads went to PostgreSQL.
- **Server counters:** The counters printed at the end come from `GET /stats`. They live in memory on one instance and cover everything since the last restart, not only this test.

## Example results

This run used the default settings from a laptop in Malaysia against the app in Malaysia West.

| Metric | Result |
|---|---|
| Requests | 2,876, about 38 per second |
| Failed requests | 0% |
| Reads | 2,730: 2,579 hits, 150 misses, 1 bypass |
| Cache hit rate | 94.46% |
| Hit latency | Median 23.6 ms, p95 67.0 ms |
| Miss latency | Median 30.3 ms, p95 95.6 ms |

All thresholds passed. The `cache_hit_duration` limit of 500 ms was far above the measured p95, so you can tighten it for your own network.

The server counters printed at the end showed 146 database reads for 153 reads that weren't hits. The difference is reads that shared a query already in flight.

## Limits

> [!WARNING]
> The test writes to the `products` table and changes prices. The app has no other data, so this is safe here, but don't point the script at a real system.

- App Service B1 has one small core. Keep the load modest. This test measures the effect of the cache, not maximum throughput.
- Azure Managed Redis `Balanced_B0` is the smallest size.
- Results from your computer include your own network latency.

## Troubleshooting

**The test stops with "The app is not ready."** Wait for `schemaReady` to become `true` in `GET /health`, then run the test again.

**The test stops with "Set BASE_URL."** Pass the app URL with `-e BASE_URL=<url>`.

**A threshold fails.** Check the failed metric in the summary. Latency thresholds often fail on a slow network, so raise the limit. A low hit rate with many `cache_bypasses` means Redis is unreachable, so see [Troubleshooting](troubleshooting.md).
