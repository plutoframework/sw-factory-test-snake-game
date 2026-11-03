# Snake Arcade

A dependency-free static browser shell in cobalt, ivory, and orange. This is the
engine increment: a deterministic standalone engine is included, but **no gameplay
UI is wired yet**. The winding path is decorative artwork, not a playable board.
All browser gameplay and future capabilities are
unavailable, including when explicitly requested by feature flags.

## Run locally

Use Node.js 22 or newer and npm.

```sh
npm ci
npm start
# Visit http://127.0.0.1:3000
```

Set `PORT` to choose another port. Stop with Ctrl-C. There is no build step or
runtime network dependency; the browser loads only local HTML, CSS, and ES modules.
The app can also be hosted on a static server serving this directory's public
assets (`index.html`, `styles.css`, `app.mjs`, `features.mjs`).

## Validate

Playwright **1.64.1** is the exact locked development dependency.

```sh
npm ci
npx playwright install --with-deps chromium
SNAKE_FEATURES=none npm test
SNAKE_FEATURES=none npm run qa
SNAKE_FEATURES=all npm test
SNAKE_FEATURES=all npm run qa
```

`npm test` uses Node's built-in test runner. `npm run qa` starts its own ephemeral
localhost server, launches headless Chromium, and checks the default page, selected
profile, and unknown-profile fallback at 1440px desktop and 390px mobile widths.
It verifies branding, unavailable gameplay, no horizontal overflow, no browser
errors/failed assets, and no remote runtime requests. It writes full-page
screenshots to `artifacts/qa/{none,all}/{desktop,mobile}.png` and closes both browser
and server on success or failure. These generated files are ignored by Git.

Optional QA environment settings:

| Variable | Meaning |
| --- | --- |
| `SNAKE_FEATURES` | `none` (default) or `all`; maps to the visited URL's feature profile |
| `PLUTO_PLAYWRIGHT_MODULE` | Existing absolute path to a Playwright module; otherwise uses installed `playwright` |
| `PLUTO_BROWSER_CHANNEL` | Optional installed Chromium channel, e.g. `chrome`; otherwise uses Playwright's Chromium |
| `PLUTO_QA_ARTIFACT_DIR` | Screenshot output directory override |

GitHub Actions has a job/status named **validate**, installs Node and Chromium
with OS dependencies, runs both commands for both profiles, and uploads screenshots.

## Feature controls

Open `/?features=none` or `/?features=all` to explicitly request a profile. No query
means all flags default off. Unknown profiles never enable a feature. For module
callers, `resolveFeatures({ gameplay: true })` supports individual boolean overrides.
The four known flags are `gameplay`, `savedProgress`, `challenges`, and `replay`.
Requests do not imply readiness: all four capabilities are unavailable in this
increment, so every profile safely renders the same shell without importing absent
modules. There is no feature persistence.

## Files and future seams

- `index.html`, `styles.css`: responsive, semantic arcade shell.
- `app.mjs`: flag-request wiring only, no gameplay.
- `features.mjs`: pure immutable flag resolution, tested in `test/`.
- `game.mjs`: pure seeded Snake transitions, covered by `test/game.test.mjs`;
  not imported by the shell. Exports `newGame`, `turn`, `tick`, `togglePause`,
  and `restart`.
- `scripts/`: local server and browser QA lifecycle.
- [CONTRACTS.md](CONTRACTS.md): concrete engine options, state, PRNG and transition
  rules; reserved seams for storage, challenges, and replay (not implemented).

Later capabilities must be completed and tested independently before wiring them
into the shell. Keep unrelated unfinished features disabled.
