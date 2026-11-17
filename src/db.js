import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { ManagedIdentityCredential } from '@azure/identity';
import { config } from './config.js';
import { log } from './metrics.js';

const TOKEN_SCOPE = 'https://ossrdbms-aad.database.windows.net/.default';
const credential = new ManagedIdentityCredential({ clientId: config.azureClientId });

const pool = new pg.Pool({
  host: config.pgHost,
  port: 5432,
  database: config.pgDatabase,
  user: config.pgUser,
  // A fresh Microsoft Entra token is the password for each new connection.
  password: async () => (await credential.getToken(TOKEN_SCOPE)).token,
  ssl: true,
  max: 5,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => log('postgres_pool_error', { message: err.message }));

const COLUMNS = 'id, name, price_cents AS "priceCents", updated_at AS "updatedAt"';

export async function initSchema() {
  const sql = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');
  await pool.query(sql);
}

export async function listProducts() {
  const { rows } = await pool.query(`SELECT ${COLUMNS} FROM products ORDER BY id`);
  return rows;
}

export async function getProductById(id) {
  const { rows } = await pool.query(`SELECT ${COLUMNS} FROM products WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

export async function updateProductById(id, { name, priceCents }) {
  const { rows } = await pool.query(
    `UPDATE products
        SET name = COALESCE($2, name),
            price_cents = COALESCE($3, price_cents),
            updated_at = now()
      WHERE id = $1
      RETURNING ${COLUMNS}`,
    [id, name ?? null, priceCents ?? null],
  );
  return rows[0] ?? null;
}

export async function closeDb() {
  await pool.end();
}
