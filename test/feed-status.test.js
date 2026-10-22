import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildServer } from '../server/server.js';
import { clearCache } from '../server/cache.js';

// Issue #23: on 12 October the SIGMET feed answered 204 for 20 minutes. We stored that as "no warnings", and the
// page told people "Nothing on your route right now", even on routes through volcanic ash. Silence looked like
// safety. These tests describe what we want instead: every answer says, per feed, whether we actually have data.
//
// Heads-up, Liam and Josh: this changes GET /api/warnings from a bare list to an object:
//   { warnings: [...], feeds: { sigmets: { status, fetchedAt }, volcanoes: { status, fetchedAt } } }
// (cyclones joined as a third feed in issue #26)
// and GET /api/flight/:number gets the same `feeds` next to `onRoute`.
// status is 'ok' (the feed answered with a list, even an empty one) or 'no-data' (a 204, or no answer yet).
// fetchedAt is when that answer arrived (an ISO time), or null before the first one.

beforeEach(() => clearCache());

// A stand-in for the poller. latest(name) now gives the whole feed result, not just the list.
const fakePoller = (results) => ({ latest: (name) => results[name] });

const ash = { id: 'LIRR-1-1760220000', kind: 'sigmet', hazard: 'VA', name: 'Volcanic ash, ROMA FIR' };
const etna = { id: 'volcano-1', kind: 'volcano', hazard: 'VA', level: 'ORANGE', name: 'Etna' };

const at0739 = '2026-10-11T20:39:12.000Z'; // 07:39 in Sydney
const at0740 = '2026-10-11T20:40:12.000Z';

const ok = (items, fetchedAt = at0739) => ({ status: 'ok', fetchedAt, items });
const noData = (fetchedAt = at0740) => ({ status: 'no-data', fetchedAt, items: [] });

async function get(app, url) {
  const res = await app.inject({ method: 'GET', url });
  assert.equal(res.statusCode, 200);
  return res.json();
}

test('GET /api/warnings says both feeds are ok when both have data', async () => {
  const app = buildServer({ poller: fakePoller({ sigmets: ok([ash]), volcanoes: ok([etna]) }) });
  assert.deepEqual(await get(app, '/api/warnings'), {
    warnings: [ash, etna],
    feeds: {
      sigmets: { status: 'ok', fetchedAt: at0739 },
      volcanoes: { status: 'ok', fetchedAt: at0739 },
      cyclones: { status: 'no-data', fetchedAt: null },
    },
  });
  await app.close();
});

const arnab = {
  id: 'cyclone-1001234',
  kind: 'cyclone',
  hazard: 'TC',
  level: 'RED',
  name: 'Tropical cyclone ARNAB (Red)',
  shape: { type: 'point', center: [14.2, 88.4] },
};

test('GET /api/warnings adds the cyclones after the volcano alerts, with their own feed status (issue #26)', async () => {
  const app = buildServer({ poller: fakePoller({ sigmets: ok([ash]), volcanoes: ok([etna]), cyclones: ok([arnab]) }) });
  assert.deepEqual(await get(app, '/api/warnings'), {
    warnings: [ash, etna, arnab],
    feeds: {
      sigmets: { status: 'ok', fetchedAt: at0739 },
      volcanoes: { status: 'ok', fetchedAt: at0739 },
      cyclones: { status: 'ok', fetchedAt: at0739 },
    },
  });
  await app.close();
});

test('GET /api/warnings says no-data for SIGMETs when that feed answered 204 (issue #23)', async () => {
  const app = buildServer({ poller: fakePoller({ sigmets: noData(), volcanoes: ok([etna]) }) });
  assert.deepEqual(await get(app, '/api/warnings'), {
    warnings: [etna], // the volcano alerts still come through
    feeds: {
      sigmets: { status: 'no-data', fetchedAt: at0740 },
      volcanoes: { status: 'ok', fetchedAt: at0739 },
      cyclones: { status: 'no-data', fetchedAt: null },
    },
  });
  await app.close();
});

test('GET /api/warnings says no-data, not "no warnings", before the first fetch is in', async () => {
  const app = buildServer({ poller: fakePoller({}) });
  assert.deepEqual(await get(app, '/api/warnings'), {
    warnings: [],
    feeds: {
      sigmets: { status: 'no-data', fetchedAt: null },
      volcanoes: { status: 'no-data', fetchedAt: null },
      cyclones: { status: 'no-data', fetchedAt: null },
    },
  });
  await app.close();
});

// A route; the route check isn't what we're testing here, only that `feeds` comes with it.
const qfa25 = {
  callsign: 'QFA25',
  from: { iata: 'SYD', name: 'Sydney Kingsford Smith International Airport', lat: -33.95, lon: 151.18 },
  to: { iata: 'HND', name: 'Tokyo Haneda International Airport', lat: 35.55, lon: 139.79 },
  points: [
    { lat: -33.95, lon: 151.18 },
    { lat: 35.55, lon: 139.79 },
  ],
};

test('GET /api/flight/:number sends the same feeds next to onRoute, so the page can tell "clear" from "unknown"', async () => {
  const app = buildServer({
    lookupRoute: async () => qfa25,
    poller: fakePoller({ sigmets: noData(), volcanoes: ok([]) }),
  });
  const body = await get(app, '/api/flight/QF25');
  assert.deepEqual(body.onRoute, []);
  assert.deepEqual(body.feeds, {
    sigmets: { status: 'no-data', fetchedAt: at0740 },
    volcanoes: { status: 'ok', fetchedAt: at0739 },
    cyclones: { status: 'no-data', fetchedAt: null },
  });
  await app.close();
});
