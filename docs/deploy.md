# Deploy and test

This article shows how to deploy the app and watch the cache-aside pattern work.

## 1. Before you begin

Deploy the [cache-aside-infra](https://github.com/tttaufiqqq/azure-cache-aside-infra-architecture) repository first. The deployment named `cache-aside` must exist in the resource group.

## 2. Deploy the app with Bash

Run the deploy script from the repository root in Git Bash or WSL. It needs `zip`.

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

## 3. Deploy the app with PowerShell

PowerShell has no `zip` command, so use the built-in `tar`. The `-a` option writes forward-slash paths that Linux App Service needs.

```powershell
$RG = "rg-cache-aside-lab"
$APP = az deployment group show -g $RG -n cache-aside --query properties.outputs.appName.value -o tsv
tar -a -c -f app.zip src package.json package-lock.json
az webapp deploy --resource-group $RG --name $APP --src-path app.zip --type zip
```

> [!NOTE]
> Don't use `Compress-Archive` here. Some versions write backslash paths that break the deployment on Linux.

## 4. Check that the app is ready

Get the app URL.

```powershell
$APP_URL = az deployment group show -g $RG -n cache-aside --query properties.outputs.appUrl.value -o tsv
```

In Bash, use `APP_URL=$(az deployment group show ... -o tsv)` with the same arguments.

Check the health endpoint.

```powershell
curl.exe "$APP_URL/health"
```

Wait until the response shows `"schemaReady":true`. The first start can take a few minutes.

## 5. Test the pattern

1. Read a product twice.

   ```powershell
   curl.exe -i "$APP_URL/products/1"
   curl.exe -i "$APP_URL/products/1"
   ```

   The first response has `X-Cache: MISS`. The second has `X-Cache: HIT`.

1. Update the product.

   ```powershell
   curl.exe -i -X PUT "$APP_URL/products/1" -H "content-type: application/json" -d '{\"priceCents\": 500}'
   ```

   The response has an `x-cache-invalidated: true` header. In Bash, use `-d '{"priceCents": 500}'` without the backslashes.

1. Read the product again.

   ```powershell
   curl.exe -i "$APP_URL/products/1"
   ```

   The response has `X-Cache: MISS` and the new price.

1. Check the counters.

   ```powershell
   curl.exe "$APP_URL/stats"
   ```

## 6. Run a load test

After the pattern works, measure it under load. See [Load testing with k6](load-testing.md).

## 7. Redeploy

Deploy again after any code change. After you destroy and recreate the infrastructure, deploy the app again.
