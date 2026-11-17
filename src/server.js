import Fastify from 'fastify';
import { config } from './config.js';
import { closeCache, connectCache } from './cache.js';
import { closeDb, initSchema, listProducts } from './db.js';
import { log, metrics } from './metrics.js';
import { readProduct, writeProduct } from './products.js';

const app = Fastify({ logger: true });
let schemaReady = false;

const idParams = {
  type: 'object',
  properties: { id: { type: 'integer', minimum: 1 } },
  required: ['id'],
};

app.get('/health', async () => ({ status: 'ok', schemaReady }));

app.get('/stats', async () => metrics.snapshot());

app.get('/products', async () => listProducts());

app.get('/products/:id', { schema: { params: idParams } }, async (request, reply) => {
  const { product, cache } = await readProduct(request.params.id);
  reply.header('X-Cache', cache);
  if (!product) {
    return reply.code(404).send({ error: 'Product not found' });
  }
  return product;
});

app.put(
  '/products/:id',
  {
    schema: {
      params: idParams,
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 200 },
          priceCents: { type: 'integer', minimum: 0 },
        },
        additionalProperties: false,
        minProperties: 1,
      },
    },
  },
  async (request, reply) => {
    const result = await writeProduct(request.params.id, request.body);
    if (!result) {
      return reply.code(404).send({ error: 'Product not found' });
    }
    reply.header('X-Cache-Invalidated', String(result.invalidated));
    return result.product;
  },
);

// The private endpoints can take a moment to become reachable, so retry.
async function initSchemaWithRetry() {
  for (let attempt = 1; !schemaReady; attempt += 1) {
    try {
      await initSchema();
      schemaReady = true;
      log('schema_ready', { attempt });
    } catch (err) {
      log('schema_init_error', { attempt, message: err.message });
      await new Promise((resolve) => setTimeout(resolve, Math.min(attempt * 2000, 30000)));
    }
  }
}

async function shutdown(signal) {
  log('shutdown', { signal });
  await app.close();
  await Promise.allSettled([closeCache(), closeDb()]);
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

await app.listen({ port: config.port, host: '0.0.0.0' });
connectCache();
initSchemaWithRetry();
