# Module contracts

The default browser remains a static shell. The completed gameplay adapter is
loaded only when gameplay is requested. `storage.mjs`, `challenges.mjs`, and
`replay.mjs` deliberately do not exist and must not be imported until their
capability is independently complete. Those capabilities remain unavailable,
including when requested with `all`.

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
`document.documentElement.dataset.features` and its active availability (only gameplay may be true) in
`dataset.availableFeatures` (both JSON). `dataset.ready` becomes `true` when the
shell module has initialized. Even an enabled request cannot activate missing
modules. Later increments may activate a requested capability only once that
module and its regression tests are complete; unrelated features must stay off.
These dataset values are QA diagnostics, not authorization controls.

## Browser adapter (`controller.mjs`, `gameplay.mjs`, implemented)

`mountGameplay()` replaces the decorative poster only when gameplay is enabled.
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

- `storage.mjs`: storage access, versioned serialization and validation, and safe
  failure handling. It may persist validated engine snapshots; the engine must
  never read browser storage. No keys, persistence schema, or functions implemented yet.
- `challenges.mjs`: deterministic challenge definitions and configurations passed
  into the engine, separate from UI and persistence. No challenge rules implemented.
- `replay.mjs`: versioned seed/configuration plus ordered input recording and
  deterministic playback through engine operations. No separate simulation rules
  and no recording/playback implemented.

Later increments must document concrete exports and payload versions here before
cross-module use. The shell must continue to render without these modules when
unavailable, including under the `all` QA profile.

## Development infrastructure

Browser assets are local ES modules with no runtime dependencies or remote fonts.
`scripts/server.mjs` exports `startServer(port = 0)` returning `{ url, close }`:
localhost only, public asset allowlist, ephemeral port by default, asynchronous
cleanup. QA owns its server/browser and closes both in `finally`, including on
assertion failures. Screenshots are full-page PNGs named `desktop.png` and
`mobile.png` in the selected profile's artifact directory.
