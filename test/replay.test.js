import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildServer } from '../server/server.js';
import { clearCache } from '../server/cache.js';
import { startPolling } from '../server/poller.js';
import { applyReplay } from '../server/replay.js';
import { lookupRoute as lookupFromAdsbdb } from '../server/feeds/routes.js';
import { fetchSigmets, parseSigmets } from '../server/feeds/sigmets.js';
import { fetchVolcanoes, parseVolcanoes } from '../server/feeds/volcanoes.js';

// Replay mode: REPLAY=<name> runs the app on saved data from replay/<name>/ instead of the live feeds.
// Each feed is replayed only if its file is in the folder; the others stay live.

beforeEach(() => clearCache());

const fixture = (name) => new URL(`./fixtures/${name}`, import.meta.url);
const readFixture = (name) => JSON.parse(readFileSync(fixture(name), 'utf8'));

// A saved route is our own small file, not an adsbdb answer (we can't store those, see data/README.md).
const QF145 = { number: 'QF145', callsign: 'QFA145', from: 'SYD', to: 'AKL' };

// Make a scenario folder in a temporary place. Each file is either copied from test/fixtures (a string) or
// written from an object:
//   scenario(t, { 'route-QFA145.json': QF145, 'sigmets.json': 'sigmets-sample.json' })
// Returns the folder that holds the scenarios (what applyReplay calls root), with the scenario named 'test'.
function scenario(t, files) {
  const root = mkdtempSync(join(tmpdir(), 'flight-watch-replay-'));
  mkdirSync(join(root, 'test'));
  for (const [name, from] of Object.entries(files)) {
    if (typeof from === 'string') copyFileSync(fixture(from), join(root, 'test', name));
    else writeFileSync(join(root, 'test', name), JSON.stringify(from));
  }
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

// Send the log to a temporary file for one test, so we can read the lines back.
function captureLog(t) {
  const folder = mkdtempSync(join(tmpdir(), 'flight-watch-replay-log-'));
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

// A stand-in for fetch that answers every outside feed from the test fixtures, and remembers each URL asked.
function fakeFetch() {
  const urls = [];
  const answers = [
    ['api.adsbdb.com', 'adsbdb-route-sample.json'],
    ['aviationweather.gov', 'sigmets-sample.json'],
    ['volcanoes.usgs.gov', 'volcanoes-sample.json'],
  ];
  const fetch = async (url) => {
    urls.push(String(url));
    const [, file] = answers.find(([part]) => String(url).includes(part));
    return new Response(readFileSync(fixture(file), 'utf8'), { status: 200 });
  };
  return { fetch, urls };
}

// The live feeds, as server.js sets them up, but asking the fake fetch instead of the network.
function liveFeeds(fetch) {
  return {
    lookupRoute: (number) => lookupFromAdsbdb(number, { fetch }),
    sources: [
      { name: 'sigmets', everySeconds: 300, fetch: () => fetchSigmets({ fetch }) },
      { name: 'volcanoes', everySeconds: 600, fetch: () => fetchVolcanoes({ fetch }) },
    ],
  };
}

// Start the poller and wait until every feed has its first answer.
async function poll(t, sources) {
  const poller = startPolling({ sources, log: { info() {}, warn() {} } });
  t.after(() => poller.stopPolling());
  for (let i = 0; i < 100 && sources.some((s) => poller.latest(s.name).fetchedAt === null); i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  return poller;
}

async function get(app, url) {
  const res = await app.inject({ method: 'GET', url });
  assert.equal(res.statusCode, 200);
  return res.json();
}

test('replay: /api/flight/QF145 gives the saved route, without asking adsbdb', async (t) => {
  captureLog(t);
  const root = scenario(t, { 'route-QFA145.json': QF145 });
  const { fetch, urls } = fakeFetch();
  const replay = applyReplay('test', { root, ...liveFeeds(fetch) });

  const app = buildServer({ lookupRoute: replay.lookupRoute });
  const flight = await get(app, '/api/flight/QF145');
  // Typed the other way, or with a space and in lower case, it's the same saved route.
  const again = await get(app, '/api/flight/qfa%20145');
  await app.close();

  assert.equal(flight.callsign, 'QFA145');
  assert.equal(flight.from.iata, 'SYD');
  assert.equal(flight.to.iata, 'AKL');
  assert.equal(flight.to.name, 'Auckland International Airport');
  // Drawn along the great circle like a live route: starts at Sydney, ends at Auckland.
  assert.ok(flight.points.length > 2);
  assert.deepEqual(flight.points[0], { lat: flight.from.lat, lon: flight.from.lon });
  assert.deepEqual(flight.points.at(-1), { lat: flight.to.lat, lon: flight.to.lon });
  assert.equal(again.callsign, 'QFA145');
  assert.deepEqual(urls, []); // adsbdb was never asked
});

test('replay: /api/warnings gives the saved SIGMETs and volcano alerts, with status ok', async (t) => {
  captureLog(t);
  const root = scenario(t, { 'sigmets.json': 'sigmets-sample.json', 'volcanoes.json': 'volcanoes-sample.json' });
  const { fetch, urls } = fakeFetch();
  const replay = applyReplay('test', { root, ...liveFeeds(fetch) });

  const app = buildServer({ poller: await poll(t, replay.sources) });
  const answer = await get(app, '/api/warnings');
  await app.close();

  const sigmets = parseSigmets(readFixture('sigmets-sample.json'));
  const volcanoes = parseVolcanoes(readFixture('volcanoes-sample.json'));
  assert.ok(sigmets.length > 0 && volcanoes.length > 0);
  assert.deepEqual(answer.warnings, [...sigmets, ...volcanoes]);
  assert.equal(answer.feeds.sigmets.status, 'ok');
  assert.equal(answer.feeds.volcanoes.status, 'ok');
  assert.equal(typeof answer.feeds.sigmets.fetchedAt, 'string');
  assert.deepEqual(urls, []); // neither feed was asked
});

test('replay: a feed with no file in the scenario stays live', async (t) => {
  captureLog(t);
  // Only the route is saved, so the SIGMETs, the volcano alerts and any other flight come from the feeds.
  const root = scenario(t, { 'route-QFA145.json': QF145 });
  const { fetch, urls } = fakeFetch();
  const replay = applyReplay('test', { root, ...liveFeeds(fetch) });

  const app = buildServer({ lookupRoute: replay.lookupRoute, poller: await poll(t, replay.sources) });
  const answer = await get(app, '/api/warnings');
  assert.equal(answer.feeds.sigmets.status, 'ok');
  assert.equal(answer.feeds.volcanoes.status, 'ok');
  assert.ok(urls.some((u) => u.includes('aviationweather.gov')));
  assert.ok(urls.some((u) => u.includes('volcanoes.usgs.gov')));

  // QF25 isn't in the scenario, so we ask adsbdb as usual.
  const flight = await get(app, '/api/flight/QF25');
  assert.equal(flight.callsign, 'QFA25');
  assert.ok(urls.some((u) => u.includes('api.adsbdb.com/v0/callsign/QF25')));
  await app.close();
});

test('replay: logs which feeds are replayed and which stay live', async (t) => {
  const readLog = captureLog(t);
  const { fetch } = fakeFetch();

  const all = scenario(t, {
    'route-QFA145.json': QF145,
    'sigmets.json': 'sigmets-sample.json',
    'volcanoes.json': 'volcanoes-sample.json',
  });
  applyReplay('test', { root: all, ...liveFeeds(fetch) });
  assert.match(readLog(), /INFO  replay "test": replaying route-QFA145, sigmets, volcanoes; live: other flights\n/);

  const routeOnly = scenario(t, { 'route-QFA145.json': QF145 });
  applyReplay('test', { root: routeOnly, ...liveFeeds(fetch) });
  assert.match(readLog(), /INFO  replay "test": replaying route-QFA145; live: sigmets, volcanoes, other flights\n/);
});

test('replay: an unknown scenario stops with a clear error instead of quietly going live', (t) => {
  captureLog(t);
  const root = scenario(t, {});
  const { fetch } = fakeFetch();
  assert.throws(() => applyReplay('nope', { root, ...liveFeeds(fetch) }), /replay scenario "nope" not found/);
});

test('replay: a saved route to an airport missing from our file stops with a clear error', (t) => {
  captureLog(t);
  const root = scenario(t, { 'route-QFA145.json': { ...QF145, to: 'ZZZ' } });
  const { fetch } = fakeFetch();
  assert.throws(() => applyReplay('test', { root, ...liveFeeds(fetch) }), /route-QFA145\.json: ZZZ isn't in data\/airports\.csv/);
});
