# Data files

Saved data the feeds and tests read. Each file says where it came from and how to refresh it.

## airports.csv

Large and medium airports that have an IATA code (the three-letter code on a boarding pass, like SYD).

- **Source:** [OurAirports](https://ourairports.com/data/), file
  https://davidmegginson.github.io/ourairports-data/airports.csv
- **Downloaded:** 2026-09-08
- **Licence:** public domain. OurAirports asks for credit, so please keep this note: "Airport data from
  OurAirports (ourairports.com)".
- **Columns:** `iata,name,lat,lon,type,country`
  - `lat`, `lon`: degrees, rounded to 6 decimal places (about 10 cm)
  - `type`: `large_airport` or `medium_airport`, as OurAirports labels them
  - `country`: two-letter ISO code, e.g. `AU`
- **Size:** 4,569 airports, of which 1,173 are large (out of 86,311 rows in the source, most of them small
  airfields, heliports and closed airports).

To refresh it, download the source file and run:

```
node scripts/build-airports.js path/to/airports.csv
```

Quirks worth knowing about the source:

- Some names contain quotes, e.g. `Kefalonia International Airport "Anna Pollatou"`, so read the file with a
  proper CSV reader (`server/feeds/csv.js`), not by splitting on commas.
- IATA codes are not unique across the whole source: a small airstrip in Papua New Guinea also has `WLG`
  (Wellington's code). Keeping only large and medium airports leaves no duplicates in this file.
- Some small airfields have a three-letter `local_code` that looks like an IATA code. We only use the
  `iata_code` column.
- "Large" and "medium" are OurAirports' own labels, roughly based on traffic, not an official category.

## Flight routes (adsbdb), not saved here

We don't keep a file of flight routes. The server asks adsbdb each time someone searches:
https://api.adsbdb.com/v0/callsign/QF25 gives the flight's usual **from** and **to** airports (Sydney and
Tokyo Haneda for QF25). It's free and needs no account or key.

- **Source:** [adsbdb](https://github.com/mrjackwills/adsbdb), a public aircraft, airline and flight route API.
- **Licence, and why there's no file:** adsbdb's README says the flight route data "is the work of David Taylor,
  Edinburgh and Jim Mason, Glasgow, and may not be copied, published, or incorporated into other databases
  without the explicit permission of David J Taylor, Edinburgh." So we ask for one route when someone searches and
  don't store or commit its answers. The test sample `test/fixtures/adsbdb-route-sample.json` is written by hand
  in the same shape, with only the fields we use.
- **What we use from the answer:** `callsign_icao` (e.g. `QFA25`) and the two airports' IATA codes. Positions
  and names come from `airports.csv` above, so the map and the airport dots agree.
- **It's the usual route, not today's flight plan.** adsbdb knows which airports a flight number normally flies
  between, not the exact path on a given day. We draw a line between the two airports, so treat it as
  approximate.

## SIGMET sample (test fixture)

A SIGMET is an official warning to pilots about dangerous weather or volcanic ash in one area for a few hours.
Each country's weather office issues them for its own airspace regions, called FIRs (flight information
regions, e.g. "ROMA FIR" for central and southern Italy).

`test/fixtures/sigmets-sample.json`: 9 real SIGMETs from the aviationweather.gov international SIGMET feed,
trimmed from 133. Fetched 2026-10-30 15:18 AEDT (04:18 UTC).

- **Source:** https://aviationweather.gov/api/data/isigmet?format=json (the
  [Aviation Weather Center](https://aviationweather.gov/data/api/), part of the US National Weather Service).
- **Licence:** US government work, free to use. We credit it as "Warnings from aviationweather.gov".
- **Kept:** volcanic ash from Etna over Rome (the observed area `1` and the forecast area `1F`), mountain waves
  over Ireland (Shannon), turbulence over Western Australia (Melbourne, its polygon isn't closed), tropical
  cyclone In-Fa near Guam (Oakland Oceanic), thunderstorms over Brazzaville (sent twice), volcanic ash from
  Sakurajima given as a single point, and icing over Magadan, which crosses the date line.

Each SIGMET is an object. The fields we use:

| Field | Example | Notes |
|---|---|---|
| `firId`, `firName` | `LIRR`, `LIRR ROMA` | `firName` usually starts with the FIR code, but not always (`OAKLAND OCEANIC`) |
| `seriesId` | `1`, `1F`, `TANGO 31` | The SIGMET's number within its FIR. Not unique on its own |
| `hazard` | `VA` | `TS` thunderstorms, `TURB` turbulence, `ICE` icing, `VA` volcanic ash, `TC` tropical cyclone, `MTW` mountain waves |
| `qualifier` | `ERUPTION MT ETNA`, `SEV`, `IN-FA` | Severity (`SEV`, `EMBD`...), the volcano, or the cyclone's name. Can be `null` |
| `validTimeFrom`, `validTimeTo` | `1793319000` | **Unix seconds**, not ISO strings |
| `geom` | `AREA` | `AREA` (one shape) or `AREAS` (several) |
| `coords` | `[{ "lon": 15.45, "lat": 37.367 }, ...]` | See the quirks below |
| `base`, `top` | `0`, `13000` | Feet. Either can be `null` |
| `rawSigmet` | | The original text message, as pilots read it |

Quirks worth knowing about the source:

- **Longitude comes first** in each point (`{ "lon": ..., "lat": ... }`), while Leaflet and the rest of our
  code use `[lat, lon]`. The feed module swaps them.
- **Most polygons repeat their first point at the end** (117 of 133), but not all: Melbourne's `V15` stops
  one corner short. Leaflet closes a polygon by itself, so the feed module drops the repeated point.
- **`geom: "AREAS"` gives a list of polygons**, not a list of points. 3 of 133 used it.
- **The date line:** Magadan's `AREAS` warnings are cut at 180°. Part of the area is given with longitudes
  above 180 (up to 190.5, which is -169.5 the usual way), so longitudes have to be brought back into
  -180 to 180.
- **Some warnings are a single point**, not an area: the Sakurajima ash cloud (`RJJJ` `R02`) has one point
  in `coords`, even though `geom` says `AREA`. There's nothing to draw as a polygon.
- **A forecast area has its own entry.** When a SIGMET gives both where the hazard is now and where it's
  expected to be, the feed sends two entries with the same `rawSigmet`: `1` (now) and `1F` (forecast).
- **The same SIGMET can come twice.** Brazzaville's `A1` arrived twice, four minutes apart (`receiptTime`),
  the first with a mistake in its header. Same FIR, number and valid time, so we keep the later one.
- A **204** (No Content) means there are no SIGMETs to give, with an empty body (so don't read it as JSON).
- **Limits:** the API asks for at most 100 requests a minute and a User-Agent naming the app. It doesn't allow
  calls from a browser, so we fetch it from the server.

## us-volcanoes.csv

Where each US volcano is. The volcano alert feed (below) names a volcano and its USGS number but doesn't say
where it is, so `server/feeds/volcanoes.js` looks the position up here.

- **Source:** the USGS Hazard Notification System (HANS), list of US volcanoes:
  https://volcanoes.usgs.gov/hans-public/api/volcano/getUSVolcanoes
- **Downloaded:** 2026-10-30 04:55 UTC
- **Licence:** US government work, free to use. We credit it as "Volcano alerts from the USGS".
- **Columns:** `vnum,name,lat,lon,region`, sorted by `vnum`
  - `vnum`: the volcano's number in the Smithsonian's Global Volcanism Program list, e.g. `311120` for Great
    Sitkin. The alert feed uses the same number.
  - `lat`, `lon`: degrees, as USGS gives them (up to 5 decimal places)
  - `region`: as USGS writes it, e.g. `Alaska - Aleutians`, `Northern Mariana Islands`
- **Size:** 170 volcanoes: Alaska, the Cascades, California, Hawaii, Yellowstone and other western states,
  American Samoa and the Northern Mariana Islands.

To refresh it, download the source file and run:

```
node scripts/build-volcanoes.js path/to/getUSVolcanoes.json
```

Volcanoes don't move, so this only needs doing when USGS adds one.

Quirks worth knowing about the source:

- **"US" includes territories:** American Samoa and the Northern Mariana Islands (near Guam) are in the list.
- **Some longitudes are east (positive):** the western Aleutians cross the date line (Semisopochnoi is at
  179.6, Great Sitkin next to it at -176.1), and the Mariana volcanoes are around 145.
- **One vnum is `0`:** Ungulungwak Hill-Ingrichuak Hill in southwest Alaska has no proper number. It's kept,
  and it's still unique.
- **One vnum is `999999`:** the Maclaren River volcanic field (central Alaska). It looks like a placeholder,
  not a real number. Don't use 999999 as a made-up number in tests.
- Each volcano also comes with a long description (`boilerplate`, in HTML), a photo link and an ICAO-style
  position (`N5205 W17607`). We don't keep those.

`test/fixtures/usgs-us-volcanoes-sample.json`: 6 real volcanoes from the same download (the 4 with alerts on
2026-10-30, plus Akutan and Semisopochnoi), with the long `boilerplate` text emptied to keep the file small.

## Volcano alert sample (test fixture)

USGS gives every US volcano an **aviation colour code**, for pilots and airlines:

| Code | Means | Our circle |
|---|---|---|
| GREEN | Normal, nothing unusual | not shown |
| YELLOW | Restless: more activity than normal | 50 km |
| ORANGE | Unrest is rising, or a small eruption with little or no ash | 100 km |
| RED | An eruption is under way or expected soon, with a lot of ash | 200 km |

Each volcano also has a ground **alert level** for people nearby: NORMAL, ADVISORY, WATCH or WARNING. They
usually go together (GREEN with NORMAL, YELLOW with ADVISORY, and so on), but not always.

The circle sizes are **our choice, not USGS's**: the higher the alert, the bigger the area to stay clear of.
USGS doesn't say how far ash will reach; for an actual ash cloud, the SIGMETs (above) draw its real shape.

`test/fixtures/volcanoes-sample.json`: the whole list of elevated US volcanoes, as USGS gave it. Fetched
2026-10-30 15:18 AEDT (04:18 UTC); still the same at 04:55 UTC.

- **Source:** https://volcanoes.usgs.gov/hans-public/api/volcano/getElevatedVolcanoes (the USGS
  [Hazard Notification System](https://volcanoes.usgs.gov/hans-public/), HANS).
- **Licence:** US government work, free to use. We credit it as "Volcano alerts from the USGS".
- **US volcanoes only**, including American Samoa and the Northern Mariana Islands. Volcanoes elsewhere
  (Etna, Sakurajima...) aren't in it; their ash reaches us as SIGMETs.
- **In the sample:** Great Sitkin (ORANGE, WATCH) in the Aleutians; Shishaldin (YELLOW, ADVISORY) on the Alaska
  Peninsula; Kilauea (YELLOW, ADVISORY) in Hawaii; Ahyi Seamount (YELLOW, ADVISORY), an underwater volcano in
  the Northern Mariana Islands.

Each volcano is an object. The fields we use:

| Field | Example | Notes |
|---|---|---|
| `vnum` | `311120` | The volcano's number, a string. We look its position up in `us-volcanoes.csv` |
| `volcano_name` | `Great Sitkin` | |
| `color_code` | `ORANGE` | The aviation colour code |
| `alert_level` | `WATCH` | The ground alert level |
| `sent_unixtime` | `1793302774` | When the latest notice for it was sent, **Unix seconds**. `sent_utc` is the same time as text |
| `notice_url` | | The notice itself, for people to read |

Quirks worth knowing about the source:

- **No positions.** The answer names each volcano but doesn't say where it is. Positions come from USGS's
  `getUSVolcanoes` list instead, saved as `data/us-volcanoes.csv` (above). We tried the others:
  `getMonitoredVolcanoes` has no positions either, and `getCapElevated` has them but only listed 2 of the 4
  elevated volcanoes (it seems to hold only alerts that changed recently).
- **The notice time isn't when the alert started.** `sent_unixtime` is the latest notice about the volcano,
  often a daily update ("DU" in `notice_type_cd`), so it moves forward every day even when the level hasn't
  changed. We use it as `validFrom` anyway; it's the only time given.
- **No end time.** An alert lasts until USGS sends a notice that changes it, so `validTo` is `null`.
- **Several volcanoes can share one notice.** Great Sitkin and Shishaldin both point to the same AVO daily
  update (`notice_identifier`), so the notice can't be used as an id. We use `vnum`.
- **No GREEN in the elevated list**, as you'd expect, but the code still skips GREEN in case. The tests add a
  real GREEN row (Akutan) from `getMonitoredVolcanoes`, the list of all monitored volcanoes, fetched
  2026-10-30 04:55 UTC.
- `getMonitoredVolcanoes` also has two rows that aren't volcanoes, `Alaskan Volcanoes` and `Cascade Range`,
  with no `vnum` (notices about a whole region). If one ever turns up in the elevated list, it isn't in
  `us-volcanoes.csv`, so the feed leaves it out with a WARN.
- **Slashes are escaped** in URLs (`https:\/\/volcanoes...`). That's valid JSON and reads back as a plain `/`.
