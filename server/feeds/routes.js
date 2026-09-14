// A flight's usual route from adsbdb (https://github.com/mrjackwills/adsbdb), asked anonymously (no key).
// adsbdb gives the from and to airports; positions and names come from our own airports file.
// Its route data may not be copied or published, so we only ask for it, never save it: see data/README.md.

import { findAirport } from './airports.js';

const API = 'https://api.adsbdb.com/v0/callsign';
const HEADERS = { 'User-Agent': 'flight-watch (teaching project)' };

// Look up a flight number (e.g. 'QF25') and return its route:
//   { callsign, from: { iata, name, lat, lon }, to: { ... }, points: [{ lat, lon }] }
// callsign is the ICAO form adsbdb gives (QF25 flies as 'QFA25'). points is the line we draw: for now
// just the two airports.
// Pass your own fetch to test without the network.
export async function lookupRoute(number, { fetch = globalThis.fetch } = {}) {
  const res = await fetch(`${API}/${number}`, { headers: HEADERS });
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
