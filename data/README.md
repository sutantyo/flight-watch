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
