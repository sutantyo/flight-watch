import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildServer } from '../server/server.js';
import { clearCache } from '../server/cache.js';

// Route lookups are cached, so every test starts with an empty cache.
beforeEach(() => clearCache());

// A made-up route, in the same shape the routes feed gives us.
const qfa25 = {
  callsign: 'QFA25',
  from: { iata: 'SYD', name: 'Sydney Kingsford Smith International Airport', lat: -33.95, lon: 151.18 },
  to: { iata: 'HND', name: 'Tokyo Haneda International Airport', lat: 35.55, lon: 139.79 },
  points: [
    { lat: -33.95, lon: 151.18 },
    { lat: 35.55, lon: 139.79 },
  ],
};

test('GET /api/flight/:number returns the route from lookupRoute', async () => {
  const asked = [];
  const app = buildServer({
    lookupRoute: async (number) => {
      asked.push(number);
      return qfa25;
    },
  });
  const res = await app.inject({ method: 'GET', url: '/api/flight/QF25' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), qfa25);
  assert.deepEqual(asked, ['QF25']); // passed on as given
  await app.close();
});

test('GET /api/flight/:number gives 404 when the flight is not found', async () => {
  const app = buildServer({ lookupRoute: async () => null });
  const res = await app.inject({ method: 'GET', url: '/api/flight/QF9999' });
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.json(), { error: 'not-found' });
  await app.close();
});

test('GET /api/flight/:number gives 502 and logs an error when adsbdb fails', async (t) => {
  // Send the log to a temporary file so we can read it back.
  const folder = mkdtempSync(join(tmpdir(), 'flight-watch-route-'));
  const file = join(folder, 'test.log');
  const before = process.env.LOG_FILE;
  process.env.LOG_FILE = file;
  t.mock.method(console, 'log', () => {}); // keep test output clean
  t.after(() => {
    if (before === undefined) delete process.env.LOG_FILE;
    else process.env.LOG_FILE = before;
    rmSync(folder, { recursive: true, force: true });
  });

  const app = buildServer({
    lookupRoute: async () => {
      const err = new Error('adsbdb returned 503');
      err.status = 503;
      throw err;
    },
  });
  const res = await app.inject({ method: 'GET', url: '/api/flight/QF25' });
  assert.equal(res.statusCode, 502);
  assert.deepEqual(res.json(), { error: 'feed-unavailable' });

  // The server is still fine afterwards.
  const home = await app.inject({ method: 'GET', url: '/' });
  assert.equal(home.statusCode, 200);

  const log = readFileSync(file, 'utf8');
  assert.match(log, /ERROR .*QF25.*503/);
  await app.close();
});

test('the same flight asked twice (any spacing or case) asks adsbdb once: routes are cached', async () => {
  let asked = 0;
  const app = buildServer({
    lookupRoute: async () => {
      asked += 1;
      return qfa25;
    },
  });
  for (const number of ['QF25', 'qf25', 'QF%2025']) {
    const res = await app.inject({ method: 'GET', url: `/api/flight/${number}` });
    assert.equal(res.statusCode, 200);
  }
  assert.equal(asked, 1);
  await app.close();
});

test('a failed lookup is not cached: the next search asks adsbdb again', async () => {
  let asked = 0;
  const app = buildServer({
    lookupRoute: async () => {
      asked += 1;
      if (asked === 1) throw Object.assign(new Error('adsbdb returned 503'), { status: 503 });
      return qfa25;
    },
  });
  assert.equal((await app.inject({ method: 'GET', url: '/api/flight/QF25' })).statusCode, 502);
  assert.equal((await app.inject({ method: 'GET', url: '/api/flight/QF25' })).statusCode, 200);
  assert.equal(asked, 2);
  await app.close();
});
