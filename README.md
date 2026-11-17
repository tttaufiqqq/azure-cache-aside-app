# Cache-aside on Azure: web app

This is a learning project. It is a small Node.js API that implements the cache-aside pattern from the Azure Architecture Center article [Cache-aside caching using Azure Managed Redis and Azure Database for PostgreSQL](https://learn.microsoft.com/en-us/azure/architecture/databases/architecture/cache-aside-azure-managed-redis-postgresql).

> [!NOTE]
> This is a personal learning implementation. It is not official Microsoft guidance.

This repository contains the web app. The Azure infrastructure lives in a separate repository, `cache-aside-infra`. Deploy that repository first.

![Architecture diagram of the cache-aside pattern with Azure Managed Redis and Azure Database for PostgreSQL](diagrams/architecture.png)

Diagram source: [Azure Architecture Center](https://learn.microsoft.com/en-us/azure/architecture/databases/architecture/cache-aside-azure-managed-redis-postgresql).

## Learning goals

- Implement the read path and write path of the cache-aside pattern in code.
- Handle cache failures without failing requests.
- Connect to Redis and PostgreSQL with a managed identity and Microsoft Entra ID.
- Observe cache hits and misses with a response header and counters.

## Stack

| Layer | Choice |
|---|---|
| Runtime | Node.js 22 |
| Web framework | Fastify |
| Database client | `pg` |
| Cache client | `redis` with `@redis/entraid` |
| Authentication | `@azure/identity` managed identity |

The app has no frontend. You test it with `curl`.

## Prerequisites

- The `cache-aside-infra` deployment is running.
- [Azure CLI](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli), signed in to the same subscription.
- `zip` installed on your computer.

> [!NOTE]
> You can't run the app on your computer. Redis and PostgreSQL accept only private traffic, so the app works only inside Azure.

## Quickstart

1. Deploy the app.

   ```bash
   ./scripts/deploy.sh
   ```

1. Request a product twice and compare the `X-Cache` header.

   ```bash
   APP_URL=$(az deployment group show \
     --resource-group rg-cache-aside-lab \
     --name cache-aside \
     --query properties.outputs.appUrl.value -o tsv)

   curl -i "$APP_URL/products/1"
   curl -i "$APP_URL/products/1"
   ```

   The first response has `X-Cache: MISS`. The second has `X-Cache: HIT`.

For the full walkthrough, see [Deploy and test](docs/deploy.md).

## Endpoints

| Method and path | Description |
|---|---|
| `GET /health` | Returns app status and whether the schema is ready |
| `GET /products` | Lists products from PostgreSQL, uncached |
| `GET /products/:id` | Reads a product with cache-aside and sets `X-Cache` |
| `PUT /products/:id` | Updates a product, then invalidates its cache key |
| `GET /stats` | Returns hit, miss, and failure counters |

## Differences from the reference architecture

| Reference architecture | This project | Reason |
|---|---|---|
| Durable invalidation, such as an outbox | Retry twice, then rely on the TTL | Keeps the code small |
| Shared metrics across instances | In-memory counters on each instance | No extra service needed |
| Negative caching for missing rows | Not cached | Keeps the rules simple |
| Application Insights instrumentation | Structured console logs only | Avoids another dependency |

## What I learned

Add your own notes here as you work through the project.

## Related resources

- `cache-aside-infra`: the infrastructure repository
- [Architecture](docs/architecture.md)
- [Troubleshooting](docs/troubleshooting.md)
