import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { log } from './log.js';
import { loadAirports } from './feeds/airports.js';

const here = dirname(fileURLToPath(import.meta.url));

// The real route lookup lives in feeds/routes.js. It's loaded the first time a flight is asked for,
// so the server starts (and tests run) without it.
const lookupFromAdsbdb = async (number) => (await import('./feeds/routes.js')).lookupRoute(number);

// Build the app without starting it, so tests can call app.inject().
// Tests can pass their own lookupRoute, so they don't call adsbdb.
export function buildServer(options = {}) {
  const lookupRoute = options.lookupRoute ?? lookupFromAdsbdb;
  const app = Fastify();
  app.register(fastifyStatic, { root: join(here, '..', 'public') });

  // Large airports only, for the map to draw as dots (about 1,200; medium ones would add 3,400 more).
  app.get('/api/airports', async () =>
    loadAirports()
      .filter((a) => a.type === 'large_airport')
      .map(({ iata, name, lat, lon }) => ({ iata, name, lat, lon })),
  );

  // A flight's usual route: { callsign, from, to, points: [{ lat, lon }] }.
  // The number goes to the lookup exactly as typed.
  app.get('/api/flight/:number', async (request, reply) => {
    const { number } = request.params;
    const route = await lookupRoute(number);
    if (!route) return reply.code(404).send({ error: 'not-found' });
    return route;
  });

  return app;
}

// Only listen when this file is run directly (npm start), not when a test imports it.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 3000;
  const app = buildServer();
  await app.listen({ port, host: '0.0.0.0' });
  log.info(`Flight Watch running at http://localhost:${port}`);
}
