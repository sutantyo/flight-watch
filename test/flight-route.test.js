import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildServer } from '../server/server.js';

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
