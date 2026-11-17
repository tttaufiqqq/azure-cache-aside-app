import { createClient } from 'redis';
import { EntraIdCredentialsProviderFactory, REDIS_SCOPE_DEFAULT } from '@redis/entraid';
import { config } from './config.js';
import { log } from './metrics.js';

const KEY_VERSION = 'v1';

const credentialsProvider = EntraIdCredentialsProviderFactory.createForUserAssignedManagedIdentity({
  clientId: config.azureClientId,
  userAssignedClientId: config.azureClientId,
  scopes: [REDIS_SCOPE_DEFAULT],
  tokenManagerConfig: { expirationRefreshRatio: 0.8 },
});

const client = createClient({
  credentialsProvider,
  socket: {
    host: config.redisHost,
    port: config.redisPort,
    tls: true,
    connectTimeout: 3000,
    reconnectStrategy: (retries) => Math.min(retries * 500, 10000),
  },
  // Fail fast while disconnected so reads fall back to PostgreSQL.
  disableOfflineQueue: true,
});

client.on('error', (err) => log('redis_error', { message: err.message }));
client.on('ready', () => log('redis_ready'));

function withTimeout(promise, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${config.cacheTimeoutMs} ms`)),
      config.cacheTimeoutMs,
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Add up to 10% jitter so keys filled together do not expire together.
function ttlWithJitter() {
  const jitter = 0.9 + Math.random() * 0.2;
  return Math.max(1, Math.round(config.cacheTtlSeconds * jitter));
}

export function cacheKey(id) {
  return `product:${id}:${KEY_VERSION}`;
}

export function connectCache() {
  // Do not await: the client keeps retrying and the app serves from PostgreSQL meanwhile.
  client.connect().catch((err) => log('redis_connect_error', { message: err.message }));
}

export async function getCached(key) {
  const value = await withTimeout(client.get(key), 'redis get');
  return value === null ? null : JSON.parse(value);
}

export async function setCached(key, value) {
  await withTimeout(
    client.set(key, JSON.stringify(value), { expiration: { type: 'EX', value: ttlWithJitter() } }),
    'redis set',
  );
}

export async function deleteCached(key) {
  await withTimeout(client.del(key), 'redis del');
}

export async function closeCache() {
  if (client.isOpen) await client.close();
}
