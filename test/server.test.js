import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildServer } from '../server/server.js';

test('GET / serves the home page', async () => {
  const app = buildServer();
  const res = await app.inject({ method: 'GET', url: '/' });
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /Flight Watch/);
  await app.close();
});
