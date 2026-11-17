function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function integer(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

export const config = {
  port: integer('PORT', 8080),
  azureClientId: required('AZURE_CLIENT_ID'),
  pgHost: required('PGHOST'),
  pgDatabase: required('PGDATABASE'),
  pgUser: required('PGUSER'),
  redisHost: required('REDIS_HOST'),
  redisPort: integer('REDIS_PORT', 10000),
  cacheTtlSeconds: integer('CACHE_TTL_SECONDS', 60),
  cacheTimeoutMs: integer('CACHE_TIMEOUT_MS', 250),
};
