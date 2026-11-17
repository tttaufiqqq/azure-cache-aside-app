# Deploy and test

This article shows how to deploy the app and watch the cache-aside pattern work.

## Before you begin

Deploy the `cache-aside-infra` repository first. The deployment named `cache-aside` must exist in the resource group.

## Deploy the app

Run the deploy script from the repository root.

```bash
./scripts/deploy.sh
```

The script:

1. Reads the app name from the infrastructure deployment outputs.
1. Zips `src`, `package.json`, and `package-lock.json`.
1. Runs `az webapp deploy`. App Service installs dependencies during deployment.

You can override the resource group with an environment variable.

```bash
RESOURCE_GROUP=my-rg ./scripts/deploy.sh
```

## Check that the app is ready

Get the app URL.

```bash
APP_URL=$(az deployment group show \
  --resource-group rg-cache-aside-lab \
  --name cache-aside \
  --query properties.outputs.appUrl.value -o tsv)
```

Check the health endpoint.

```bash
curl "$APP_URL/health"
```

Wait until the response shows `"schemaReady":true`. The first start can take a few minutes.

## Test the pattern

1. Read a product twice.

   ```bash
   curl -i "$APP_URL/products/1"
   curl -i "$APP_URL/products/1"
   ```

   The first response has `X-Cache: MISS`. The second has `X-Cache: HIT`.

1. Update the product.

   ```bash
   curl -i -X PUT "$APP_URL/products/1" \
     -H "content-type: application/json" \
     -d '{"priceCents": 500}'
   ```

   The response has `X-Cache-Invalidated: true`.

1. Read the product again.

   ```bash
   curl -i "$APP_URL/products/1"
   ```

   The response has `X-Cache: MISS` and the new price.

1. Check the counters.

   ```bash
   curl "$APP_URL/stats"
   ```

## Redeploy

Run `./scripts/deploy.sh` again after any code change. After you destroy and recreate the infrastructure, deploy the app again.
