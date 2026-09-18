import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lookupRoute } from '../server/feeds/routes.js';

const sample = JSON.parse(readFileSync(new URL('./fixtures/adsbdb-route-sample.json', import.meta.url), 'utf8'));

// A stand-in for fetch: remembers what was asked and answers with the given status and body.
function fakeFetch(status, body) {
  const calls = [];
  const fetch = async (url, options) => {
    calls.push({ url, options });
    return { status, json: async () => body };
  };
  return { fetch, calls };
}

test('lookupRoute asks adsbdb for the flight number, with our User-Agent', async () => {
  const { fetch, calls } = fakeFetch(200, sample);
  await lookupRoute('QF25', { fetch });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.adsbdb.com/v0/callsign/QF25');
  assert.equal(calls[0].options.headers['User-Agent'], 'flight-watch (teaching project)');
});

test('lookupRoute gives the callsign, both airports and a line between them', async () => {
  const { fetch } = fakeFetch(200, sample);
  const route = await lookupRoute('QF25', { fetch });
  const syd = { iata: 'SYD', name: 'Sydney Kingsford Smith International Airport', lat: -33.946098, lon: 151.177002 };
  const hnd = { iata: 'HND', name: 'Tokyo Haneda International Airport', lat: 35.549678, lon: 139.786958 };
  assert.deepEqual(route, {
    callsign: 'QFA25',
    from: syd,
    to: hnd,
    points: [
      { lat: syd.lat, lon: syd.lon },
      { lat: hnd.lat, lon: hnd.lon },
    ],
  });
});

test('lookupRoute throws with the status, and logs a WARN, when adsbdb answers with anything but 200', async (t) => {
  // Send the log to a temporary file so we can read it back.
  const folder = mkdtempSync(join(tmpdir(), 'flight-watch-routes-'));
  const file = join(folder, 'test.log');
  const before = process.env.LOG_FILE;
  process.env.LOG_FILE = file;
  t.mock.method(console, 'log', () => {}); // keep test output clean
  t.after(() => {
    if (before === undefined) delete process.env.LOG_FILE;
    else process.env.LOG_FILE = before;
    rmSync(folder, { recursive: true, force: true });
  });

  const { fetch } = fakeFetch(503, {});
  await assert.rejects(lookupRoute('QF25', { fetch }), (err) => err.status === 503);
  assert.match(readFileSync(file, 'utf8'), /WARN  adsbdb returned 503 for https:\/\/api\.adsbdb\.com\/v0\/callsign\/QF25/);
});

test('lookupRoute gives null when adsbdb doesn\'t know the flight (404 "unknown callsign")', async (t) => {
  t.mock.method(console, 'log', () => {});
  const { fetch } = fakeFetch(404, { response: 'unknown callsign' });
  assert.equal(await lookupRoute('QFA6', { fetch }), null);
});

test('lookupRoute gives null when adsbdb won\'t take the flight number (400 "invalid callsign", e.g. QF1)', async (t) => {
  t.mock.method(console, 'log', () => {});
  const { fetch } = fakeFetch(400, { response: 'invalid callsign: QF1' });
  assert.equal(await lookupRoute('QF1', { fetch }), null);
});

test('lookupRoute tidies the flight number before asking: no spaces, upper case', async () => {
  const { fetch, calls } = fakeFetch(200, sample);
  await lookupRoute(' qf 25 ', { fetch });
  assert.equal(calls[0].url, 'https://api.adsbdb.com/v0/callsign/QF25');
});

test('lookupRoute gives null without asking adsbdb for something that can\'t be a flight number', async () => {
  for (const input of ['', 'Qantas', 'QF/25', 'QF25?x=1', '25']) {
    const { fetch, calls } = fakeFetch(200, sample);
    assert.equal(await lookupRoute(input, { fetch }), null, input);
    assert.equal(calls.length, 0, input);
  }
});

test('lookupRoute gives null, and logs a WARN, when an airport isn\'t in our airports file', async (t) => {
  const folder = mkdtempSync(join(tmpdir(), 'flight-watch-routes-'));
  const file = join(folder, 'test.log');
  const before = process.env.LOG_FILE;
  process.env.LOG_FILE = file;
  t.mock.method(console, 'log', () => {});
  t.after(() => {
    if (before === undefined) delete process.env.LOG_FILE;
    else process.env.LOG_FILE = before;
    rmSync(folder, { recursive: true, force: true });
  });

  // The sample, but going to an airport code we don't have (our file has large and medium airports only).
  const elsewhere = structuredClone(sample);
  elsewhere.response.flightroute.destination.iata_code = 'ZZZ';
  const { fetch } = fakeFetch(200, elsewhere);
  assert.equal(await lookupRoute('QF25', { fetch }), null);
  assert.match(readFileSync(file, 'utf8'), /WARN  route for QFA25 goes from SYD to ZZZ, and ZZZ isn't in data\/airports\.csv/);
});
