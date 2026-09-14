import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
