# Module contracts

The default browser remains a static shell. The completed gameplay adapter is
loaded only when gameplay is requested. `storage.mjs` is loaded only when
savedProgress is requested. `challenges.mjs` deliberately does not exist.
`replay.mjs` is an implemented pure opt-in API; browser recording/playback controls
are not wired, so replay UI availability remains false even under `all`.

## Features (`features.mjs`, implemented)

`resolveFeatures(overrides)` returns a fresh frozen object with exactly these
boolean keys: `gameplay`, `savedProgress`, `challenges`, `replay`. All default to
`false`. The string `none` disables all; `all` enables all requested flags.
An object may override individual keys with literal booleans. Unknown names,
inherited properties, non-boolean values, and unknown profile strings are ignored.
Overrides never mutate the input or global defaults.

`app.mjs` reads `?features=none` or `?features=all` with `URLSearchParams` and passes
the profile to the resolver. Missing and unknown values use disabled defaults.
The first query value wins for duplicate parameters. No URL flag is persisted.
`SNAKE_FEATURES` is a Node QA setting, not a browser environment variable: QA maps
it to the URL. It accepts only `none` and `all`, defaulting to `none`.

**Requested is not available.** The shell records the resolved request in
`document.documentElement.dataset.features` and its active availability (only gameplay and savedProgress may be true) in
`dataset.availableFeatures` (both JSON). `dataset.ready` becomes `true` when the
shell module has initialized. Even an enabled request cannot activate missing
modules. Later increments may activate a requested capability only once that
module and its regression tests are complete; unrelated features must stay off.
These dataset values are QA diagnostics, not authorization controls.

## Browser adapter (`controller.mjs`, `gameplay.mjs`, implemented)

`mountGameplay({ progress } = {})` optionally accepts the storage adapter below and replaces the decorative poster only when gameplay is enabled.
It renders `canvas#board`, numeric-only `#score`, `button#pause`, `button#restart`,
and four `button[data-direction]` controls. Keyboard arrows/WASD steer; Space
prevents scrolling/default button activation and toggles pause. Key repeats are
ignored. Hidden documents pause automatically. Game-over status directs restart.

`createController(render, { schedule = setInterval, cancel = clearInterval } = {})`
returns `direction(name)`, `pause()`, `restart()`, and `dispose()`. It publishes
immutable engine state initially and after updates. One lifetime interval runs at
exported `STEP_MS = 160`; restart resets state/input latch, never schedules another
clock. At most one accepted turn per tick prevents chained input from reversing
into the neck. Ignored inputs do not consume the latch. Pause does not clear it.
Disposal cancels the clock and makes operations inert. No storage is accessed.

## Engine (`game.mjs`, implemented; wired only behind gameplay)

Named exports: `newGame`, `turn`, `tick`, `togglePause`, and `restart`.
The engine is pure JavaScript with no DOM, timers, networking, or storage.
Changed states are deeply frozen, with fresh cell objects; no operation modifies
or freezes caller-owned input. No-op operations may return the input unchanged.

The state contract includes:

- `snake`: head-first array of `{ x, y }` integer cells.
- `width`, `height`: board dimensions in cells; origin at top left, x right, y down.
- `direction`: one of `up`, `right`, `down`, `left`.
- `score`: numeric score.
- `status`: `running`, `paused`, or `gameover`.
- `food`: seeded, deterministic `{ x, y }` placement (or `null` when no free cell remains).
- Explicit PRNG seed/state sufficient to reproduce food placement without `Math.random`.

`newGame({ width = 20, height = 20, seed = 1 } = {})` starts running, facing
right, score zero, with three horizontal cells centered on the board (head x is
`max(2, floor(width/2))`, y is `floor(height/2)`). Width must be an integer >= 4,
height an integer >= 1, with at most 1,000,000 cells. Seed must be an unsigned
32-bit integer, including zero. Invalid values throw `RangeError`; options are
never modified. Every supported new board has free food and room to move right.

State includes original `seed` and current `rngState`, both unsigned 32-bit
integers. Each food placement advances the LCG once:
`rngState = (imul(rngState, 1664525) + 1013904223) >>> 0`.
Free cells are enumerated row-major and selected using
`floor(rngState / 2**32 * freeCount)`. No rejection loop or `Math.random` is used.
A full board has `food: null`, status `gameover`, and does not advance the PRNG.

`turn(state, direction)` accepts cardinal directions only while running, ignores
same direction and direct reversal relative to **state.direction**, and updates
direction immediately. Multiple turns before a tick use the latest direction;
input throttling belongs to the browser adapter. `tick(state)` advances one cell
according to that direction. Eating retains the tail, adds one score, and places
food. Otherwise the tail vacates, allowing movement into that cell. Wall or body
collision changes only status to `gameover`, leaving the last valid board intact.
Paused/gameover ticks freeze progress; turns also do nothing in those statuses.

`togglePause(state)` switches running/paused and leaves gameover unchanged.
`restart(state)` calls newGame with the original width, height and seed, restoring
the exact initial state. Operations accept valid engine states (including mutable
copies); malformed state snapshots are outside this contract. The future storage
boundary must validate snapshots before use. The browser adapter owns input and
scheduling, not the engine.

## Other reserved boundaries

- `storage.mjs` (implemented): `createProgress({ enabled = false, getStorage =
  () => globalThis.localStorage } = {})` returns `read()`, `addScore(score)`, and
  `setSettings({ sound, difficulty })`. Reads and updates return detached copies.
  Disabled mode never acquires or accesses persistent storage. Enabled mode reads
  once; access/read/write exceptions switch to session memory, without retrying.
  Malformed or unknown records start at defaults and can be overwritten on the
  next valid update. No engine snapshots or feature flags are persisted.
  Key `STORAGE_KEY = 'snake-arcade.progress'` contains JSON version 1:
  `{ version: 1, scores: [number], settings: { sound: boolean, difficulty: string } }`.
  `decodeRecord(raw)` rejects malformed JSON, unknown versions, records over
  `MAX_RECORD_LENGTH = 2048` characters, over `MAX_SCORES = 10` scores, invalid
  scores (integers from 0 to 1,000,000 only), or invalid settings. Defaults are
  empty scores, sound false, difficulty `classic`; other accepted preferences
  are `easy` and `hard`. Extra fields are discarded. Scores sort descending;
  updates retain the top ten, including ties and zero. Invalid API updates throw
  RangeError before mutation. Gameplay records only transitions into gameover,
  never pauses, restarts or running games. Sound/difficulty are preferences only;
  no audio or difficulty rules are implemented. The panel renders numeric scores
  and settings using safe DOM properties; no stored HTML is rendered.
- `challenges.mjs`: deterministic challenge definitions and configurations passed
  into the engine, separate from UI and persistence. No challenge rules implemented.
- `replay.mjs` (implemented): pure recording, bounded validation and playback,
  documented below. No browser UI integration or persistence.

Later increments must document concrete exports and payload versions here before
cross-module use. The shell must continue to render without these modules when
unavailable, including under the `all` QA profile.

## Replay (`replay.mjs`, implemented; explicit module opt-in only)

The shell/controller do not import this module. The replay request defaults false;
`all` requests replay but does not activate UI. Consumers must explicitly import
these APIs. They use the existing engine, never storage, clocks or DOM:

- `createRecording({ width = 20, height = 20, seed = 1 } = {})` returns a deeply
  frozen session `{ state, ticks, inputs }`. Options follow engine rules, except
  replay boards are limited to `MAX_CELLS = 4096` cells.
- `recordDirection(session, direction)` returns a new session for an accepted turn,
  or the same session for an invalid/same/reverse direction or a second accepted
  turn in that simulation tick. Ignored inputs do not consume the latch. This is
  the controller's one-turn-per-tick policy, not unrestricted raw engine turns.
- `stepRecording(session)` advances one running engine tick and increments `ticks`,
  including a collision tick. Game-over calls are no-ops. Call only on actual
  simulation updates: paused/display frames must not call this function. Keep pause
  state outside the recording; pauses do not clear pending turns. No wall-clock
  timestamps are recorded. Restart begins a new session with `createRecording`.
- `finishRecording(session)` returns JSON text, either a running prefix or a
  completed run. A pending direction must be stepped before export. Sessions are
  trusted opaque outputs of these APIs, not an import boundary. Invalid options,
  pending export and recording budget exhaustion throw `RangeError`; retain the
  previous session to export when a budget is reached.
- `validateReplay(raw)` accepts **JSON text only** and returns
  `{ ok: true, record }` (deeply frozen) or `{ ok: false, code, message }`.
  It checks structure/bounds without simulation. Extra fields are rejected.
- `playbackReplay(raw)` validates first, then returns `{ ok: true, state, ticks }`
  or the same error shape. State is the full frozen engine state. It rejects
  ignored turns and steps after game over as `incompatible`, and verifies the
  recorded score/status (`mismatch` on divergence). Other codes are `malformed`,
  `unsupported` (unknown version), and `oversized` (size/work budget). Expected
  outcomes detect divergence, not forgery; recordings are not authenticated.

Version `REPLAY_VERSION = 1` describes current engine rules and input policy;
changes to deterministic engine semantics require a new version or migration:

```json
{"version":1,"options":{"width":20,"height":20,"seed":1},"ticks":1,"inputs":[{"tick":0,"direction":"up"}],"expected":{"score":0,"status":"running"}}
```

Ticks are zero-based: an input at tick 0 applies before the first `tick`. Inputs
must be strictly increasing and unique, cardinal, and less than total `ticks`.
Expected status is `running` or `gameover`, never paused. Limits are exported:
`MAX_RECORD_LENGTH = 524288` characters (checked before JSON parsing),
`MAX_TICKS = 10000`, `MAX_INPUTS = 10000`, and
`MAX_WORK = 4000000` for `width * height * (ticks + 1)`. These cap parsing,
iteration, food scans and state copying independently of supplied timestamps.
Validation does not establish semantic compatibility; use playback for that.

```js
let session = createRecording({ seed: 1 });
session = recordDirection(session, 'up');
session = stepRecording(session); // omit calls while paused
const raw = finishRecording(session);
const result = playbackReplay(raw); // result.state deeply equals session.state
```

## Development infrastructure

Browser assets are local ES modules with no runtime dependencies or remote fonts.
`scripts/server.mjs` exports `startServer(port = 0)` returning `{ url, close }`:
localhost only, public asset allowlist, ephemeral port by default, asynchronous
cleanup. QA owns its server/browser and closes both in `finally`, including on
assertion failures. Screenshots are full-page PNGs named `desktop.png` and
`mobile.png` in the selected profile's artifact directory.
