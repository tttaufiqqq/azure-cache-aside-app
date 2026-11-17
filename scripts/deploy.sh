#!/usr/bin/env bash
set -euo pipefail

RESOURCE_GROUP="${RESOURCE_GROUP:-rg-cache-aside-lab}"
DEPLOYMENT_NAME="${DEPLOYMENT_NAME:-cache-aside}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PACKAGE="$(mktemp -d)/app.zip"

echo "Reading outputs from deployment ${DEPLOYMENT_NAME} in ${RESOURCE_GROUP}..."
APP_NAME="$(az deployment group show \
  --resource-group "${RESOURCE_GROUP}" \
  --name "${DEPLOYMENT_NAME}" \
  --query properties.outputs.appName.value -o tsv)"
APP_URL="$(az deployment group show \
  --resource-group "${RESOURCE_GROUP}" \
  --name "${DEPLOYMENT_NAME}" \
  --query properties.outputs.appUrl.value -o tsv)"

echo "Packaging the app..."
(cd "${ROOT}" && zip -qr "${PACKAGE}" src package.json package-lock.json)

echo "Deploying to ${APP_NAME}..."
az webapp deploy \
  --resource-group "${RESOURCE_GROUP}" \
  --name "${APP_NAME}" \
  --src-path "${PACKAGE}" \
  --type zip

echo "Deployed. Check ${APP_URL}/health"
