import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { log } from './log.js';
import { loadAirports } from './feeds/airports.js';
import { startPolling } from './poller.js';

const here = dirname(fileURLToPath(import.meta.url));

// The real route lookup lives in feeds/routes.js. It's loaded the first time a flight is asked for,
// so the server starts (and tests run) without it.
const lookupFromAdsbdb = async (number) => (await import('./feeds/routes.js')).lookupRoute(number);

// Build the app without starting it, so tests can call app.inject().
// Tests can pass their own lookupRoute, so they don't call adsbdb, and their own poller (anything with
// latest(name)). Without a poller there are no warnings.
export function buildServer(options = {}) {
  const lookupRoute = options.lookupRoute ?? lookupFromAdsbdb;
  const poller = options.poller;
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
    let route;
    try {
      route = await lookupRoute(number);
    } catch (err) {
      // Catch it here: left alone, Fastify sends adsbdb's own status (a 503, say) back to the browser,
      // which reads as if our server were down. 502 says "the server is fine, the service behind it isn't".
      log.error(`flight lookup for ${number} failed: adsbdb status ${err.status ?? 'unknown'} (${err.message})`);
      return reply.code(502).send({ error: 'feed-unavailable' });
    }
    if (!route) return reply.code(404).send({ error: 'not-found' });
    return route;
  });

  // The latest SIGMET warnings (storms, turbulence, icing, volcanic ash), [] until the first fetch is in.
  app.get('/api/warnings', async () => poller?.latest('sigmets') ?? []);

  return app;
}

// Only listen when this file is run directly (npm start), not when a test imports it.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 3000;

  // Keep the warnings fresh in the background, loaded when first used like the route lookup.
  // SIGMETs every 5 minutes: they're issued for hours at a time, so that's plenty. aviationweather.gov allows
  // 100 requests a minute, and that counts every copy of the app on our office network together (see #11).
  const poller = startPolling({
    log,
    sources: [
      {
        name: 'sigmets',
        everySeconds: 5 * 60,
        fetch: async () => (await import('./feeds/sigmets.js')).fetchSigmets(),
      },
    ],
  });

  const app = buildServer({ poller });
  await app.listen({ port, host: '0.0.0.0' });
  log.info(`Flight Watch running at http://localhost:${port}`);
}
