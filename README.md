# Snake Arcade

A dependency-free static browser arcade in cobalt, ivory, and orange. **Open the
home page to play**: classic Snake, local high scores/settings, seeded challenges,
and watch-only replay are finished and enabled by default. No account, build step,
remote fonts, or runtime network services are required.

## Run locally

Use Node.js 22 or newer and npm:

```sh
npm ci
npm start
# Visit http://127.0.0.1:3000
```

Set `PORT` to choose another port. Stop with Ctrl-C. Alternatively serve this
directory with a static HTTP server (for example `python3 -m http.server 3000`).
Opening `index.html` directly via `file://` is not supported by browser ES modules.
Static hosting needs `index.html`, `styles.css`, and the root `.mjs` modules;
`node_modules`, tests and scripts are not browser assets. The supplied development
server binds localhost and serves only an explicit public asset allowlist.

## Play and controls

- Arrows or WASD steer. On mobile, use the four direction buttons below the board.
  Only one accepted turn per simulation tick is allowed; direct reversal is ignored.
- Eat orange food for one point and one extra body cell. Board edges, your body,
  and gray challenge walls end the game. Filling the board also completes a run.
- Space or **Pause / Resume** pauses. Leaving the tab pauses automatically;
  returning does not resume until you choose to. Key repeats are ignored.
- **Restart** begins the active board again with the same seed and difficulty.
  It does not save an unfinished score. Reload starts a fresh game, not a snapshot.
- Tab / Shift-Tab reach controls with visible focus; Enter / Space activate buttons.
  Seed and select fields retain native keyboard editing rather than steering.
- Sound is a saved preference only: no audio capability is implemented.

### Seeded challenges

Select **Seeded challenge**, an unsigned 32-bit seed (`0`–`4294967295`), and
easy/normal/hard difficulty, then **Start selected game**. Equal seed, difficulty
and inputs reproduce the same walls, food and score. Easy starts slower with fewer
walls; hard starts faster with more walls. Speed increases every five food, with a
minimum interval. The generator protects the starting snake and a route to the
first food; later survival is up to you. Select **Classic** for a wall-free board.
Changing selection does not affect an active run until you start it. Restart
repeats the active configuration, not an unapplied selection. Saved difficulty
selects the next initial board; seed always starts at 1 after reload.

### Replay

Finish a live run, then choose **Replay last completed run**. Playback is visibly
watch-only: live steering is disabled, Pause / Resume still works, and scores are
never posted again. **Exit replay · fresh game** returns to live play. The last
valid completed recording remains available until reload; replays and seeds are
not persisted. Runs exceeding the recording budget remain playable but cannot
replace the last completed replay. There is no browser import/export UI. Library
users can record, validate and play versioned JSON with the pure APIs in
[CONTRACTS.md](CONTRACTS.md); incompatible, malformed and oversized inputs are
rejected before playback.

## Local storage and privacy

The key `snake-arcade.progress` stores a bounded version-1 JSON record:

```json
{"version":1,"scores":[12,3,0],"settings":{"sound":false,"difficulty":"classic"}}
```

Only the top ten completed live scores (descending, including ties/zero) and
sound/difficulty preferences are stored. Scores are integers 0–1,000,000;
difficulty is `classic`, `easy`, `normal`, or `hard`. No snapshots, seeds, replays,
identity or flags are stored. Records over 2048 characters, corrupt JSON, unknown
versions or invalid fields reset safely to defaults; the next valid update can
replace them. Blocked/full/unavailable storage switches to session memory without
interrupting play or repeatedly retrying. Clear this key in browser developer
tools to reset progress; clearing site data also works. Explicit disabled mode
never acquires, reads or writes local storage. There is no server-side storage.

## Feature controls

| URL | Behavior |
| --- | --- |
| `/` | All four completed capabilities enabled |
| `/?features=all` | Explicitly enable all four |
| `/?features=none` | Decorative shell only; no gameplay modules or storage access |
| `/?features=unknown` (or empty value) | Safe disabled fallback |

The first query value wins if `features` occurs more than once. No flag is saved.
`SNAKE_FEATURES` selects a **QA URL profile**, not a browser environment variable;
it does not change what a normal visitor sees.

For module consumers, `resolveFeatures()` enables the finished defaults.
Explicit object configuration retains opt-in semantics: `resolveFeatures({
gameplay: true })` enables only gameplay; omitted keys stay false. Only own literal
boolean properties are accepted; unknown keys and invalid values are ignored.
Known flags are `gameplay`, `savedProgress`, `challenges`, and `replay`.
Challenge/replay UI additionally requires gameplay, but neither requires saved
progress. `mountGameplay({ challenges, replay, progress })` is the independent
integration seam. Future unfinished capabilities must remain disabled.

## Validate

Playwright **1.64.1** is the exact locked development dependency:

```sh
npm ci
npx playwright install --with-deps chromium
npm test
npm run qa
SNAKE_FEATURES=none npm test
SNAKE_FEATURES=none npm run qa
SNAKE_FEATURES=all npm test
SNAKE_FEATURES=all npm run qa
```

`npm test` uses Node's built-in runner for engine API compatibility, immutable
transitions, PRNG, walls/body/full-board cases, scheduling/input latches,
persistence/recovery, connected seeded challenges, replay validation/budgets, and
cross-module integration. Engine/library APIs are independent of browser flags.

`npm run qa` owns an ephemeral localhost server and headless Chromium, closing both
in `finally`. A controlled browser clock makes movement deterministic. Every run
checks normal defaults, its explicit profile, unknown/duplicate profiles, desktop
1440px and touch/mobile 390px, plus 320px reduced-motion overflow. Checks include
scoring, reversal/input throttling, pause/resume/background pause, repeated
restarts, game over, keyboard focus/native activation, accessible names, touch
target sizes, no horizontal overflow, no browser errors/failed assets, and no
remote runtime dependencies. Persistence scenarios verify exactly-once completion,
reload, corrupt/unknown records, blocked/full storage, and disabled isolation.
Integration covers independent flags, saved challenge difficulty, seeded speed,
input validation, editing without steering, replay pause/exit/score isolation,
and pure playback of a scored terminal run with invalid-record rejection.

Full-page `desktop.png` and `mobile.png` screenshots are emitted under
`artifacts/qa/{default,none,all}/` (ignored by Git). Enabled screenshots show a paused
seeded challenge after integration tests; `none` shows the disabled shell.

Optional QA settings:

| Variable | Meaning |
| --- | --- |
| `SNAKE_FEATURES` | `none` or `all`; omitted means normal default URL |
| `PLUTO_PLAYWRIGHT_MODULE` | Existing absolute Playwright module path; otherwise installed `playwright` |
| `PLUTO_BROWSER_CHANNEL` | Installed Chromium channel, e.g. `chrome`; otherwise Playwright Chromium |
| `PLUTO_QA_ARTIFACT_DIR` | Screenshot directory override |

GitHub Actions job/status **validate** installs Node and Chromium with OS
dependencies, tests normal defaults and both explicit profiles, and uploads
screenshots even on failure. No external module/browser overrides are needed in CI.

## Module map

- `index.html`, `styles.css`: responsive semantic arcade shell.
- `app.mjs`, `features.mjs`: immutable feature resolution and lazy integration.
- `gameplay.mjs`: canvas rendering, controls, accessible status and storage UI.
- `controller.mjs`: one simulation clock, per-tick input latch and replay modes.
- `game.mjs`: pure `newGame`, `turn`, `tick`, `togglePause`, `restart`, `getTickMs`.
- `challenges.mjs`, `board.mjs`: bounded seeded layouts and topology validation.
- `storage.mjs`: bounded versioned scores/settings and graceful memory fallback.
- `replay.mjs`: immutable recording and bounded version-1 classic/version-2 challenge playback.
- `scripts/`: static server and browser QA lifecycle; `test/`: Node regressions.

See [CONTRACTS.md](CONTRACTS.md) for exact options, schemas, PRNG, scheduling and
compatibility rules. `test/engine-api.test.mjs` locks every public engine export,
classic state/food values, all transitions and challenge restart compatibility.
