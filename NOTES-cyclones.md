# Cyclones (#26): handover notes

Mei, Fri 23 Oct. I'm moving to another project today, so this branch (`feature/cyclones`) stops here. It does
not work against the real feed yet. Sorry for leaving it half done.

## Done

- `server/feeds/cyclones.js`: `fetchCyclones()` asks GDACS for
  `https://www.gdacs.org/gdacsapi/api/events/geteventlist/MAP`, keeps only tropical cyclones (`eventtype` TC)
  and turns each into a Warning (`kind: 'cyclone'`, level GREEN/ORANGE/RED, name like
  "Tropical cyclone ARNAB (Red)"). Same `{ status, fetchedAt, items }` result as the other feeds.
  GDACS points are GeoJSON, so [lon, lat]; the code swaps them.
- Tests in `test/cyclones.test.js`, against a hand-made response (I never got a real one, see below).
- Polled every 15 minutes as `cyclones` in `server/server.js`, and added to `/api/warnings` as a third feed.

## Not done

- **GDACS answers 400 to the MAP list.** Ran out of time to look into it. Running `npm start` on Thu gave a
  `WARN  cyclone feed returned 400: ...` line straight away; the log has GDACS's own message after the colon.
  Check the GDACS API docs too, then save a real answer under `test/fixtures/` and check my hand-made sample
  matches it.
- **Wind zones.** Each cyclone is only its centre point for now. GDACS has the wind areas as polygons from its
  geometry endpoint (the event's `url.geometry`). TODO in `cyclones.js`.
- **Route check.** `core/route-check.js` only knows volcano circles and SIGMET polygons, so cyclones never
  show in On your route. TODO in `server.js`. Needs the wind zones first, or a circle like the volcanoes.
- **The page.** Nothing in `public/` yet: the map doesn't draw cyclones, and the "no data" banner and route
  panel only list SIGMETs and volcano alerts (`WARNING_FEEDS` in `public/route-message.js`), so with the 400
  above, cyclones having no data isn't shown anywhere on the page. Liam would need to add a third entry.
- Wiki page for GDACS as a data source.

## Who to ask

Gaurav knows the route check; Josh the poller.
