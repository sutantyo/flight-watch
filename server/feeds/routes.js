// A flight's usual route from adsbdb (https://github.com/mrjackwills/adsbdb), asked anonymously (no key).
// adsbdb gives the from and to airports; positions and names come from our own airports file.
// Its route data may not be copied or published, so we only ask for it, never save it: see data/README.md.

import { log } from '../log.js';
import { findAirport } from './airports.js';

const API = 'https://api.adsbdb.com/v0/callsign';
const HEADERS = { 'User-Agent': 'flight-watch (teaching project)' };

// An airline code (2 or 3 letters or digits, e.g. QF, QFA, G3), then 1 to 4 digits, maybe a letter at the end.
const FLIGHT_NUMBER = /^[A-Z0-9]{2,3}[0-9]{1,4}[A-Z]?$/;

// Look up a flight number (e.g. 'QF25', or ' qf 25 ' as typed) and return its route:
//   { callsign, from: { iata, name, lat, lon }, to: { ... }, points: [{ lat, lon }] }
// callsign is the ICAO form adsbdb gives (QF25 flies as 'QFA25'). points is the line we draw: for now
// just the two airports.
// Returns null if one of the airports isn't in our file, or if adsbdb doesn't know the flight: it answers 404
// "unknown callsign", or 400 "invalid callsign" for numbers it won't take, like QF1 (it wants at least 4
// characters in this form; QFA1 works).
// Throws an Error with .status (e.g. 503) if adsbdb answers with anything else but 200.
// Pass your own fetch to test without the network.
export async function lookupRoute(input, { fetch = globalThis.fetch } = {}) {
  // People type ' qf 25 ': remove the spaces and upper-case it. Anything that still doesn't look like a flight
  // number (a name, a slash, a '?') isn't sent to adsbdb at all, since it would end up in the URL.
  const number = input.replace(/\s+/g, '').toUpperCase();
  if (!FLIGHT_NUMBER.test(number)) return null;
  const url = `${API}/${number}`;
  const res = await fetch(url, { headers: HEADERS });
  if (res.status === 404 || res.status === 400) {
    const { response } = await res.json();
    log.info(`adsbdb has no route for ${number} (${res.status}: ${response})`);
    return null;
  }
  if (res.status !== 200) {
    log.warn(`adsbdb returned ${res.status} for ${url}`);
    const err = new Error(`adsbdb returned ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const { flightroute } = (await res.json()).response;
  return routeBetween(flightroute.callsign_icao, flightroute.origin.iata_code, flightroute.destination.iata_code);
}

// Build a route from a callsign and two airport codes, e.g. routeBetween('QFA25', 'SYD', 'HND'), with positions
// and names from our own airports file. lookupRoute uses it on adsbdb's answer; replay mode (server/replay.js)
// uses it on a saved route, so a replayed route looks exactly like a live one.
// Returns null, with a WARN, if one of the airports isn't in our file.
export function routeBetween(callsign, fromIata, toIata) {
  const from = findAirport(fromIata);
  const to = findAirport(toIata);
  // Our file only has large and medium airports, so a route to a small airfield can't be drawn.
  if (!from || !to) {
    const missing = [!from && fromIata, !to && toIata].filter(Boolean);
    log.warn(
      `route for ${callsign} goes from ${fromIata} to ${toIata}, and ${missing.join(' and ')} isn't in ` +
        `data/airports.csv: left out`,
    );
    return null;
  }
  return {
    callsign,
    from,
    to,
    points: [
      { lat: from.lat, lon: from.lon },
      { lat: to.lat, lon: to.lon },
    ],
  };
}
