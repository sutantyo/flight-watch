# Flight Watch

Type a flight number and see where it's going: its path on a world map, plus the aviation warnings near it
(storms, turbulence, icing, volcanic ash and volcano alerts).

**For learning only, not for flight planning.**

## What it does

- **Search by flight number**, as it appears on a booking (`QF25`). The server asks
  [adsbdb](https://github.com/mrjackwills/adsbdb) which airports that flight usually flies between (Sydney and
  Tokyo Haneda for QF25).
- **Draws the route** on the map along the great circle between the two airports, the way planes fly between
  far-apart places, with large airports shown as dots. It's the flight's usual route, drawn as the shortest
  path: not its flight plan, which can be hundreds of km off it on the day.
- **Draws the warnings**: SIGMETs (official warnings to pilots about storms, turbulence, icing, volcanic ash and
  more) as shapes, and US volcano alerts as circles sized by their colour code.
- **"On your route"** lists the warnings the route passes through or comes within 50 km of.
- **Says when it doesn't know.** If a warning feed has no data, the map and the route panel say
  "Warning data unavailable" and name the feed, instead of "Nothing on your route right now".

- **Dark map mode** follows your system setting by default, with a remembered toggle. It darkens the OpenStreetMap tiles without changing tile providers or aviation warning colours.

## Run it

You need Node 22 or later.

```
npm install
npm start
```

Then open http://localhost:3000. Set `PORT` to use a different port.

## Replay mode

To run on saved data instead of the live feeds (for a demo, or when the feeds are quiet or the network is bad):

```
REPLAY=tasman npm start
```

(in PowerShell: `$env:REPLAY = "tasman"; npm start`), then search for `QF145`. This reads the folder
`replay/tasman/`. Each feed is replayed only if its file is in the folder (`route-<CALLSIGN>.json`,
`sigmets.json`, `volcanoes.json`); the others stay live, and the log says which is which when the server
starts. See `replay/tasman/README.md` for what's in that scenario.

## Test it

```
npm test
```

Tests use Node's built-in test runner and live in `test/`. They read saved samples from `test/fixtures/`, so
they don't need the network.

## Logs

The server writes one plain line per event, to the screen and to `logs/app.log` (set `LOG_FILE` to use another
file):

```
2026-10-12 07:40:12 WARN  sigmet feed returned 204 (no data), we have no SIGMETs right now
```

## Data sources

| What | From | Licence |
|---|---|---|
| Flight routes (from and to airports) | [adsbdb](https://github.com/mrjackwills/adsbdb) | Free to ask, no key. The route data is the work of David Taylor and Jim Mason and may not be copied or published, so we don't save it |
| Airports | [OurAirports](https://ourairports.com) | Public domain |
| SIGMET warnings | [aviationweather.gov](https://aviationweather.gov) | US government work |
| Volcano alerts | [USGS](https://volcanoes.usgs.gov/hans-public/) | US government work |

Thanks to all of them. The saved files, and how to refresh them, are described in
[`data/README.md`](data/README.md).

## More

The project wiki has the rest: getting started, who owns what, each data source's limits and quirks, how the
map layers work, what to do when a feed goes quiet, and how to read the logs.

## Licence

The code is under the MIT licence (see `LICENSE`). The data files keep their own licences: see `data/README.md`.
