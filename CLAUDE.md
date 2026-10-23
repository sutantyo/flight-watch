# Flight Watch

A web app: type a flight number, see its path on a world map and the aviation warnings near it (storms,
turbulence, icing, volcanic ash, volcano alerts). For learning only, not for flight planning.

The path is the flight's usual route: adsbdb says which airports it flies between, and we draw the great circle
between them. It's approximate (not the flight plan), and we never save adsbdb's answers: its licence doesn't
allow it (see `data/README.md`).

Stack: Node 22, Fastify 5, plain JavaScript (ES modules), Leaflet on the front end, tests with `node:test`.
Keep dependencies to a minimum; add one only with a reason in the pull request.

## Run and test

- `npm install`, then `npm start` and open http://localhost:3000 (`PORT` changes the port).
- `npm test` runs everything in `test/`.

## Layout

| Path | What's there |
|---|---|
| `server/` | The Fastify server (`server.js`) and its helpers |
| `server/feeds/` | One file per outside data source (flight routes, airports, warnings, volcanoes) |
| `core/` | Plain logic with no web or network code, e.g. `route-check.js` (is a warning near the route?) |
| `public/` | The page the browser loads: HTML, CSS, front-end JavaScript |
| `data/` | Saved data files used by the feeds and tests (sources and licences in `data/README.md`) |
| `scripts/` | Scripts that rebuild the files in `data/` from their sources |
| `replay/` | Saved data for replay mode (`REPLAY=<name> npm start`), one folder per scenario |
| `test/` | Tests, one file per module (`<name>.test.js`); `test/fixtures/` holds small samples of each feed |
| `tools/` | Helpers for running things, e.g. keeping test log lines out of `logs/app.log` |

More (data sources, replay mode, reading the logs, when a feed goes quiet) is in the project wiki.

## Team rules

- Every change starts from an issue, goes on its own branch and comes in through a pull request.
- Never push to `main` directly.
- A bug fix comes with a test that failed before the fix.
- All logging goes through `server/log.js`, not `console.log`. Logs go to `logs/app.log` (or `LOG_FILE`).
- Plain English in commit messages, comments and docs. Say what changed and why.
- `buildServer()` in `server/server.js` returns the app without listening; tests use `app.inject()`.
