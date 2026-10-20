# Replay scenario: tasman

Qantas QF145 (callsign `QFA145`) from Sydney to Auckland over the Tasman Sea, with the SIGMETs and volcano
alerts saved one morning. Run it with:

```
REPLAY=tasman npm start
```

then search for `QF145`. Every feed in this scenario is replayed; only other flights go to adsbdb.

| File | What it is | Where it came from | Captured |
|---|---|---|---|
| `route-QFA145.json` | Our own file: the flight number, callsign and the two airport codes | Written by hand. QF145 flies Sydney to Auckland; adsbdb says the same, but we don't store its answers (see `data/README.md`) | — |
| `sigmets.json` | Copy of `test/fixtures/sigmets-sample.json` | https://aviationweather.gov/api/data/isigmet?format=json, 9 real SIGMETs trimmed from 133 | 2026-10-30 15:18 AEDT (04:18 UTC) |
| `volcanoes.json` | Copy of `test/fixtures/volcanoes-sample.json` | https://volcanoes.usgs.gov/hans-public/api/volcano/getElevatedVolcanoes, the whole list of elevated US volcanoes as USGS gave it | 2026-10-30 15:18 AEDT (04:18 UTC); still the same at 04:55 UTC |

What you'll see:

- **The route:** Sydney to Auckland, about 2,160 km, drawn along the great circle (10 points), the same way as
  a live route.
- **Warnings:** 9 SIGMET areas (Etna's ash over Rome, now and forecast; mountain waves over Ireland;
  turbulence over Western Australia; tropical cyclone In-Fa near Guam; thunderstorms over Brazzaville, sent
  twice and kept once; icing over Magadan in 3 pieces, as it crosses the date line. The Sakurajima ash cloud is
  a single point, so it's left out) and 4 volcano alerts (Great Sitkin, Shishaldin, Kilauea, Ahyi Seamount).
- **On your route:** none of these warnings are near QF145's route, so the panel says "Nothing on your route
  right now", with every feed ok. To demo a warning on the route, a scenario needs a SIGMET over the Tasman.

Licences and credits are as in `data/README.md`: "Routes from adsbdb", "Warnings from aviationweather.gov",
"Volcano alerts from the USGS", airports from OurAirports.
