import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildServer } from '../server/server.js';
import { clearCache } from '../server/cache.js';
import { densify } from '../core/route-check.js';

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
  // No poller, so no warnings on the route, and every feed says they have no data.
  const noDataFeed = { status: 'no-data', fetchedAt: null };
  assert.deepEqual(res.json(), {
    ...qfa25,
    points: densify(qfa25.points),
    onRoute: [],
    feeds: { sigmets: noDataFeed, volcanoes: noDataFeed, cyclones: noDataFeed },
  });
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

// Route check (core/route-check.js): the answer says which warnings the route passes near.
const fakePoller = (results) => ({ latest: (name) => results[name] });
const ok = (items) => ({ status: 'ok', fetchedAt: '2026-10-12T00:00:00.000Z', items });

const sigmet = (id, coords) => ({
  id,
  kind: 'sigmet',
  hazard: 'TS',
  level: null,
  name: 'Thunderstorms, MELBOURNE FIR',
  validFrom: '2026-09-28T00:00:00.000Z',
  validTo: '2026-09-28T04:00:00.000Z',
  shape: { type: 'polygon', coords },
});

test('GET /api/flight/:number includes onRoute: the warnings the route passes near', async () => {
  // qfa25 leaves Sydney heading north. One storm sits across its route, one is far out over the Tasman.
  const onRoute = sigmet('YMMM-1', [[-32.5, 150.5], [-32.5, 151.5], [-33.5, 151.5], [-33.5, 150.5]]);
  const farAway = sigmet('YMMM-2', [[-36, 158], [-36, 160], [-38, 160], [-38, 158]]);
  const app = buildServer({
    lookupRoute: async () => qfa25,
    poller: fakePoller({ sigmets: ok([onRoute, farAway]) }),
  });
  const res = await app.inject({ method: 'GET', url: '/api/flight/QF25' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json().onRoute, [onRoute]);
  assert.deepEqual(res.json().points, densify(qfa25.points)); // the route itself, along the great circle
  await app.close();
});

test('GET /api/flight/:number gives onRoute [] before the poller has fetched any warnings', async () => {
  const app = buildServer({ lookupRoute: async () => qfa25, poller: fakePoller({}) });
  const res = await app.inject({ method: 'GET', url: '/api/flight/QF25' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json().onRoute, []);
  await app.close();
});

test('GET /api/flight/:number includes volcano alerts near the route in onRoute, after the SIGMETs', async () => {
  // A made-up alert for the test: 30 km around a point about 19 km off qfa25's route.
  const nearRoute = {
    id: 'volcano-test',
    kind: 'volcano',
    hazard: 'VA',
    level: 'ORANGE',
    name: 'Test volcano',
    validFrom: '2026-09-28T00:00:00.000Z',
    validTo: '2026-09-29T00:00:00.000Z',
    shape: { type: 'circle', center: [-33.0, 150.82], radiusKm: 30 },
  };
  const onRoute = sigmet('YMMM-1', [[-32.5, 150.5], [-32.5, 151.5], [-33.5, 151.5], [-33.5, 150.5]]);
  const app = buildServer({
    lookupRoute: async () => qfa25,
    poller: fakePoller({ sigmets: ok([onRoute]), volcanoes: ok([nearRoute]) }),
  });
  const res = await app.inject({ method: 'GET', url: '/api/flight/QF25' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json().onRoute, [onRoute, nearRoute]);
  await app.close();
});

test('GET /api/flight/:number sends the route along the great circle, so the map draws the way planes fly (#22)', async () => {
  const app = buildServer({ lookupRoute: async () => qfa25 });
  const res = await app.inject({ method: 'GET', url: '/api/flight/QF25' });
  const { points } = res.json();
  // Sydney to Haneda is about 7,800 km: many points, starting and ending at the two airports.
  assert.ok(points.length > 30, `got ${points.length} points`);
  assert.deepEqual(points[0], { lat: qfa25.from.lat, lon: qfa25.from.lon });
  assert.deepEqual(points.at(-1), { lat: qfa25.to.lat, lon: qfa25.to.lon });
  await app.close();
});
