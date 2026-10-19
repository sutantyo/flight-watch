// Replay mode: run the app on saved data instead of the live feeds, for demos and testing when the feeds are
// quiet or the network is bad. Start the server with REPLAY=<name> and it reads the scenario folder
// replay/<name>/. Each feed is replayed only if its file is there; any feed without a file stays live.
//
//   route-<CALLSIGN>.json    a flight's route, in our own small format (not an adsbdb answer: we can't store
//                            those, see data/README.md), e.g. route-QFA145.json:
//                              { "number": "QF145", "callsign": "QFA145", "from": "SYD", "to": "AKL" }
//   sigmets.json             the raw answer from aviationweather.gov's isigmet feed
//   volcanoes.json           the raw answer from USGS's getElevatedVolcanoes
//
// Saved data goes through the same code as live data (routeBetween, parseSigmets, parseVolcanoes), so
// replayed data looks exactly like live data to the rest of the app.
//
//   const replay = applyReplay('tasman', { lookupRoute, sources });
//   startPolling({ log, sources: replay.sources });
//   buildServer({ lookupRoute: replay.lookupRoute, poller });

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { log } from './log.js';
import { findAirport } from './feeds/airports.js';
import { routeBetween } from './feeds/routes.js';
import { parseSigmets } from './feeds/sigmets.js';
import { parseVolcanoes } from './feeds/volcanoes.js';

const REPLAY_FOLDER = fileURLToPath(new URL('../replay/', import.meta.url));

// The warning feeds we can replay: the file to look for, and the parser that turns it into Warnings.
const FEED_FILES = {
  sigmets: { file: 'sigmets.json', parse: parseSigmets },
  volcanoes: { file: 'volcanoes.json', parse: parseVolcanoes },
};

// The same clean-up the live lookup does: ' qf 145 ' and 'QF145' are the same flight.
const tidy = (number) => number.replace(/\s+/g, '').toUpperCase();

// Read scenario <name> and swap in its saved data.
// lookupRoute and sources are the live ones (as server.js sets them up). The result has the same shape,
// { lookupRoute, sources }, with the replayed parts swapped in.
// root is the folder that holds the scenarios (replay/ by default; tests use a temporary one).
// Throws if there's no such scenario, or a saved route can't be drawn: better to stop than to quietly run on
// live data during a demo.
export function applyReplay(name, { lookupRoute, sources, root = REPLAY_FOLDER }) {
  const folder = join(root, name);
  if (!existsSync(folder)) throw new Error(`replay scenario "${name}" not found (looked in ${folder})`);
  const files = readdirSync(folder);
  const readJson = (file) => JSON.parse(readFileSync(join(folder, file), 'utf8'));

  // Saved routes, found by either way of writing the flight: its number (QF145) or its callsign (QFA145).
  const routes = new Map();
  const routeNames = [];
  for (const file of files) {
    const match = /^route-([A-Z0-9]+)\.json$/.exec(file);
    if (!match) continue;
    const saved = readJson(file);
    const missing = [saved.from, saved.to].filter((iata) => !findAirport(iata));
    if (missing.length) {
      throw new Error(`replay scenario "${name}": ${file}: ${missing.join(' and ')} isn't in data/airports.csv`);
    }
    const route = routeBetween(saved.callsign, saved.from, saved.to);
    for (const number of [saved.number, saved.callsign].filter(Boolean)) routes.set(tidy(number), route);
    routeNames.push(`route-${match[1]}`);
  }

  // fetchedAt is when we loaded the scenario: the page reads it as "when this answer arrived".
  const loadedAt = new Date().toISOString();
  const replayed = [];
  const live = [];
  const replaySources = sources.map((source) => {
    const feed = FEED_FILES[source.name];
    if (!feed || !files.includes(feed.file)) {
      live.push(source.name);
      return source;
    }
    replayed.push(source.name);
    const result = { status: 'ok', fetchedAt: loadedAt, items: feed.parse(readJson(feed.file)) };
    // Still goes through the poller like a live feed; it just gets the same answer every time.
    return { ...source, fetch: async () => result };
  });

  const replayedNames = [...routeNames, ...replayed];
  log.info(
    `replay "${name}": replaying ${replayedNames.join(', ') || 'nothing'}; live: ${[...live, 'other flights'].join(', ')}`,
  );

  return {
    // A saved route comes from the scenario; any other flight goes to adsbdb as usual.
    lookupRoute: async (number) => routes.get(tidy(number)) ?? lookupRoute(number),
    sources: replaySources,
  };
}
