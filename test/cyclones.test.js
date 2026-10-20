import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fetchCyclones } from '../server/feeds/cyclones.js';

// A hand-made GDACS event list in the shape of its GeoJSON answer (made-up events; no saved real one yet):
// one tropical cyclone, and one earthquake that should be left out.
const sample = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [88.4, 14.2] }, // [lon, lat]
      properties: {
        eventtype: 'TC',
        eventid: 1001234,
        episodeid: 7,
        eventname: 'ARNAB',
        name: 'Tropical Cyclone ARNAB-26',
        alertlevel: 'Red',
        fromdate: '2026-10-18T00:00:00',
        todate: '2026-10-21T06:00:00',
      },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [140.1, 35.6] },
      properties: {
        eventtype: 'EQ',
        eventid: 1500321,
        eventname: '',
        name: 'Earthquake in Japan',
        alertlevel: 'Green',
        fromdate: '2026-10-20T03:12:00',
        todate: '2026-10-20T03:12:00',
      },
    },
  ],
};

// A stand-in for fetch that answers with the given status and body, and remembers what it was asked.
function fakeFetch(status = 200, body = JSON.stringify(sample)) {
  const calls = [];
  const fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return new Response(status === 204 ? null : body, { status });
  };
  return { fetch, calls };
}

// Send the log to a temporary file for one test, so we can read the lines back.
function captureLog(t) {
  const folder = mkdtempSync(join(tmpdir(), 'flight-watch-cyclones-'));
  const before = process.env.LOG_FILE;
  process.env.LOG_FILE = join(folder, 'test.log');
  t.mock.method(console, 'log', () => {}); // keep test output clean
  t.after(() => {
    if (before === undefined) delete process.env.LOG_FILE;
    else process.env.LOG_FILE = before;
    rmSync(folder, { recursive: true, force: true });
  });
  return () => readFileSync(process.env.LOG_FILE, 'utf8');
}

test('fetchCyclones asks GDACS for its map event list and says who is asking', async (t) => {
  captureLog(t);
  const { fetch, calls } = fakeFetch();
  await fetchCyclones({ fetch });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://www.gdacs.org/gdacsapi/api/events/geteventlist/MAP');
  assert.match(calls[0].options.headers['User-Agent'], /flight-watch/);
});

test('fetchCyclones keeps the tropical cyclone, leaves out the earthquake, and swaps [lon, lat]', async (t) => {
  captureLog(t);
  const { fetch } = fakeFetch();
  const result = await fetchCyclones({ fetch });
  assert.equal(result.status, 'ok');
  assert.deepEqual(result.items, [
    {
      id: 'cyclone-1001234',
      kind: 'cyclone',
      hazard: 'TC',
      level: 'RED',
      name: 'Tropical cyclone ARNAB (Red)',
      validFrom: '2026-10-18T00:00:00.000Z',
      validTo: '2026-10-21T06:00:00.000Z',
      shape: { type: 'point', center: [14.2, 88.4] },
    },
  ]);
});

test('fetchCyclones gives an ok, empty list when GDACS has no cyclones right now', async (t) => {
  captureLog(t);
  const { fetch } = fakeFetch(200, JSON.stringify({ type: 'FeatureCollection', features: [sample.features[1]] }));
  const result = await fetchCyclones({ fetch });
  assert.equal(result.status, 'ok');
  assert.deepEqual(result.items, []);
});

test('fetchCyclones says no-data on a 204 and logs a WARN (issue #23)', async (t) => {
  const readLog = captureLog(t);
  const { fetch } = fakeFetch(204);
  assert.deepEqual(await fetchCyclones({ fetch }), { status: 'no-data', fetchedAt: null, items: [] });
  assert.match(readLog(), /WARN  cyclone feed returned 204/);
});

test('fetchCyclones throws with the status on any other answer, and logs a WARN', async (t) => {
  const readLog = captureLog(t);
  const { fetch } = fakeFetch(503, 'Service Unavailable');
  await assert.rejects(fetchCyclones({ fetch }), (err) => err.status === 503);
  assert.match(readLog(), /WARN  cyclone feed returned 503/);
});
