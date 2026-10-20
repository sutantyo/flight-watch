// Tropical cyclones (hurricanes, typhoons, cyclones: the same kind of storm, named by ocean), for the whole world,
// from GDACS, the Global Disaster Alert and Coordination System run by the UN and the European Commission
// (https://www.gdacs.org). It gives every event a Green, Orange or Red alert level.
//
// We ask for the event list GDACS's own map uses. As far as I can tell it returns every current event
// (earthquakes, floods, droughts, volcanoes and cyclones), so we keep only the tropical cyclones (eventtype TC).
// The answer is GeoJSON: points are [lon, lat], longitude first, so we swap them.

import { log } from '../log.js';

const FEED_URL = 'https://www.gdacs.org/gdacsapi/api/events/geteventlist/MAP';
const HEADERS = { 'User-Agent': 'flight-watch (teaching project)' };

// Fetch the current tropical cyclones. Returns a feed result:
//   { status: 'ok', fetchedAt, items }            GDACS answered 200 with a list, even one with no cyclones in it
//   { status: 'no-data', fetchedAt: null, items: [] }   a 204: it told us nothing (logged as a WARN, issue #23)
// items are Warnings:
//   { id, kind: 'cyclone', hazard: 'TC', level, name, validFrom, validTo,
//     shape: { type: 'point', center: [lat, lon] } }
// level is GDACS's alert level in capitals: GREEN, ORANGE or RED.
// Throws an Error with .status for any other answer but 200.
// Pass your own fetch to test without the network.
//
// TODO: the point is only the storm's centre. GDACS has the wind zones as polygons from its geometry endpoint
// (each event's url.geometry); use those so the route check can tell if a flight goes through the storm.
export async function fetchCyclones({ fetch = globalThis.fetch } = {}) {
  const res = await fetch(FEED_URL, { headers: HEADERS });
  if (res.status === 204) {
    log.warn('cyclone feed returned 204 (no data), we have no cyclones right now');
    return { status: 'no-data', fetchedAt: null, items: [] };
  }
  if (res.status !== 200) {
    // Keep the start of GDACS's answer in the log: its error messages say what was wrong with the request.
    const body = (await res.text().catch(() => '')).slice(0, 200);
    log.warn(`cyclone feed returned ${res.status}: ${body}`);
    const err = new Error(`gdacs.org returned ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const fetchedAt = new Date().toISOString();
  const { features = [] } = await res.json();
  return { status: 'ok', fetchedAt, items: features.filter(isCyclone).map(toWarning) };
}

function isCyclone(feature) {
  return feature.properties?.eventtype === 'TC';
}

// One GDACS event becomes one Warning: "Tropical cyclone ARNAB (Red)".
function toWarning({ geometry, properties: p }) {
  const [lon, lat] = geometry.coordinates;
  return {
    id: `cyclone-${p.eventid}`,
    kind: 'cyclone',
    hazard: 'TC',
    level: p.alertlevel.toUpperCase(),
    name: `Tropical cyclone ${p.eventname} (${p.alertlevel})`,
    // GDACS gives times in UTC without the Z on the end ("2026-10-20T06:00:00").
    validFrom: p.fromdate ? utc(p.fromdate) : null,
    validTo: p.todate ? utc(p.todate) : null,
    shape: { type: 'point', center: [lat, lon] },
  };
}

function utc(time) {
  return new Date(/(Z|[+-]\d\d:\d\d)$/.test(time) ? time : `${time}Z`).toISOString();
}
