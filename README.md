# Snake Arcade

A dependency-free static browser arcade in cobalt, ivory, and orange. Open
`/?features=all` for playable Snake: arrows/WASD or touch buttons steer, Space or
Pause pauses, and Restart starts fresh. Eat orange food to score; walls and your
own body end the game. With no flag (or `?features=none`), the original decorative
shell is preserved. With `all`, the local high-scores/settings panel saves the top
ten completed scores and sound/difficulty preferences across reloads. Preferences
do not yet change audio or difficulty. Corrupt records reset safely; blocked or full
storage falls back to session memory. No storage is accessed with flags disabled.
Challenges and replay UI remain unavailable. Replay recording/validation/playback
is available as an explicit pure-module API; see [CONTRACTS.md](CONTRACTS.md).

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
assets (`index.html`, `styles.css`, `app.mjs`, `features.mjs`, `gameplay.mjs`,
`controller.mjs`, `game.mjs`, `storage.mjs`, `replay.mjs`).

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
It verifies branding, the disabled shell, enabled gameplay controls, scoring,
reversal protection, pause/resume, game over, repeated restarts, touch target size,
keyboard focus, no horizontal overflow, no browser errors/failed assets, and no
remote runtime requests. It also checks saved scores/settings across reload,
exactly-once completion recording, disabled storage isolation, and storage failure
recovery. Replay QA checks the explicitly imported module reproduces a scored
terminal run and rejects invalid records; the shell never imports it in either
profile. A controlled browser clock makes movement checks deterministic. It writes full-page
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
Requests do not imply readiness: only gameplay and savedProgress are complete and
can activate in the UI. Challenges and replay UI stay off even under `all`,
without importing their modules. The completed replay API is explicit module opt-in
only; browser recording/playback controls remain for a later integration. There is no feature-flag persistence.

## Files and future seams

- `index.html`, `styles.css`: responsive, semantic arcade shell.
- `app.mjs`: flag-request wiring; lazy-loads completed gameplay only when requested.
- `gameplay.mjs`: canvas rendering, keyboard and touch controls, status feedback.
- `controller.mjs`: single simulation clock and per-tick input latch.
- `storage.mjs`: bounded version-1 scores/settings records, injected storage and
  graceful in-memory recovery; no saved game snapshots.
- `replay.mjs`: pure immutable input recording, bounded version-1 JSON validation
  and deterministic engine playback, tested in `test/replay.test.mjs`.
- `features.mjs`: pure immutable flag resolution, tested in `test/`.
- `game.mjs`: pure seeded Snake transitions, covered by `test/game.test.mjs`;
  loaded only for enabled gameplay. Exports `newGame`, `turn`, `tick`, `togglePause`,
  and `restart`.
- `scripts/`: local server and browser QA lifecycle.
- [CONTRACTS.md](CONTRACTS.md): concrete engine options, state, PRNG and transition
  rules, persistence/replay schemas and APIs, and the reserved challenge seam.

Later capabilities must be completed and tested independently before wiring them
into the shell. Keep unrelated unfinished features disabled.
