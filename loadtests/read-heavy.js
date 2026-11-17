import http from 'k6/http';
import { check, fail, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL;
if (!BASE_URL) {
  throw new Error('Set BASE_URL, for example: k6 run -e BASE_URL=https://<app>.azurewebsites.net loadtests/read-heavy.js');
}

const VUS = Number(__ENV.VUS || 10);
const DURATION = __ENV.DURATION || '60s';
const WRITE_RATIO = Number(__ENV.WRITE_RATIO || 0.05);
const PRODUCT_IDS = [1, 2, 3, 4, 5];

// Latency split by cache outcome, taken from the X-Cache response header.
const hitDuration = new Trend('cache_hit_duration', true);
const missDuration = new Trend('cache_miss_duration', true);
const bypassDuration = new Trend('cache_bypass_duration', true);
const hitRate = new Rate('cache_hit_rate');
const bypasses = new Counter('cache_bypasses');
const invalidationFailures = new Counter('invalidation_failures');

export const options = {
  scenarios: {
    read_heavy: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: VUS },
        { duration: DURATION, target: VUS },
        { duration: '5s', target: 0 },
      ],
      gracefulRampDown: '5s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.99'],
    cache_hit_rate: ['rate>0.8'],
    cache_hit_duration: ['p(95)<500'],
  },
};

// k6 may canonicalize header names, so match them case-insensitively.
function header(res, name) {
  const wanted = name.toLowerCase();
  for (const key of Object.keys(res.headers)) {
    if (key.toLowerCase() === wanted) return res.headers[key];
  }
  return null;
}

function read(id) {
  const res = http.get(`${BASE_URL}/products/${id}`, { tags: { name: 'GET /products/:id' } });
  const cache = header(res, 'X-Cache');

  check(res, {
    'read returns 200': (r) => r.status === 200,
    'X-Cache header is present': () => cache !== null,
  });

  if (cache === 'HIT') {
    hitDuration.add(res.timings.duration);
    hitRate.add(true);
  } else if (cache === 'MISS') {
    missDuration.add(res.timings.duration);
    hitRate.add(false);
  } else if (cache === 'BYPASS') {
    bypassDuration.add(res.timings.duration);
    bypasses.add(1);
    hitRate.add(false);
  }
}

function write(id) {
  const body = JSON.stringify({ priceCents: 100 + Math.floor(Math.random() * 9900) });
  const res = http.put(`${BASE_URL}/products/${id}`, body, {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'PUT /products/:id' },
  });

  check(res, { 'write returns 200': (r) => r.status === 200 });

  if (header(res, 'X-Cache-Invalidated') === 'false') {
    invalidationFailures.add(1);
  }
}

export function setup() {
  const res = http.get(`${BASE_URL}/health`);
  if (res.status !== 200 || !res.json('schemaReady')) {
    fail('The app is not ready. Check GET /health and wait for schemaReady to be true.');
  }
}

export default function () {
  const id = PRODUCT_IDS[Math.floor(Math.random() * PRODUCT_IDS.length)];
  if (Math.random() < WRITE_RATIO) {
    write(id);
  } else {
    read(id);
  }
  sleep(0.1 + Math.random() * 0.2);
}

export function teardown() {
  const res = http.get(`${BASE_URL}/stats`);
  console.log(`Server counters: ${res.body}`);
}
