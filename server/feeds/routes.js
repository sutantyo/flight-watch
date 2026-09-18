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
// Returns null if adsbdb doesn't know the flight: it answers 404 "unknown callsign", or 400 "invalid callsign"
// for numbers it won't take, like QF1 (it wants at least 4 characters in this form; QFA1 works).
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
  const from = findAirport(flightroute.origin.iata_code);
  const to = findAirport(flightroute.destination.iata_code);
  return {
    callsign: flightroute.callsign_icao,
    from,
    to,
    points: [
      { lat: from.lat, lon: from.lon },
      { lat: to.lat, lon: to.lon },
    ],
  };
}
