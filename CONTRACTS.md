# Module contracts

The browser remains a static shell. `game.mjs` implements the standalone engine,
but is not imported by the shell: no game loop or playable board is wired yet.
`challenges.mjs` provides standalone opt-in configuration, not browser UI.
`storage.mjs` and `replay.mjs` deliberately do not exist and must not be imported
until their capability is independently complete. Gameplay and all
other browser capabilities remain unavailable, including when requested with `all`.

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
`document.documentElement.dataset.features` and its all-disabled availability in
`dataset.availableFeatures` (both JSON). `dataset.ready` becomes `true` when the
shell module has initialized. Even an enabled request cannot activate missing
modules. Later increments may activate a requested capability only once that
module and its regression tests are complete; unrelated features must stay off.
These dataset values are QA diagnostics, not authorization controls.

## Engine (`game.mjs`, implemented; not wired to UI)

Named exports: `newGame`, `turn`, `tick`, `togglePause`, `restart`, and `getTickMs`.
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
input throttling belongs to a future adapter. `tick(state)` advances one cell
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

## Challenges (`challenges.mjs`, implemented; not wired to UI)

`createChallenge({ width = 20, height = 20, seed = 1, difficulty = 'normal',
obstacleCount } = {})` returns a deeply frozen engine options object:
`{ width, height, seed, difficulty, obstacles: [{ x, y }, ...], safeStart: true }`.
Pass it directly to `newGame(config)`. No global RNG, flags, clock, or browser
state is read. Identical options produce identical layouts; config plus the same
ordered engine operations reproduces the game. Restart preserves all options.

Challenge dimensions use engine minimums but cap area at **4096** cells to bound
layout work. Seed uses the engine unsigned 32-bit contract. Challenge difficulty
is `easy`, `normal`, or `hard`. Default obstacle counts are floor(area times
0.08, 0.14, or 0.20 respectively). An explicit integer `obstacleCount` from zero
to board area overrides density. Invalid options throw `RangeError`.

Generation protects the initial snake, its first forward step, and the classic
initial food cell. Candidates are shuffled with a local seed-initialized LCG
(the engine's constants), then each is considered at most once. A candidate is
kept only if all remaining board cells stay connected by cardinal movement.
The result may have **fewer obstacles than requested**, especially on tiny or
saturated boards: safety takes priority. Obstacles are returned row-major.
Work is bounded by O(area²) time and O(area) space; there is no retry loop.
Food uses the engine's separate seed-initialized PRNG, excluding obstacles.
Every generated configuration enables `safeStart`: initial food is selected only
from cells reachable from the head while treating the entire initial body as
blocked. A bounded flood fill (O(area) time/space) establishes a simple path to
that food. Following that path with legal turns cannot hit the initial body or
its own non-repeating path. The protected forward cell ensures the candidate set
is nonempty, even for one-row boards or obstacle-created dead-end corridors.
Static connectivity alone is not a playability proof; the safe-start filter
provides that additional first-food guarantee. Later food placement excludes only
snake and obstacles as usual. Survival after player decisions or subsequent food
is not guaranteed, and the moving body can still block routes.

### Opt-in engine configuration

`newGame` also accepts `obstacles`, `difficulty = 'classic'`, and the literal
boolean `safeStart = false`. With `safeStart: true`, only initial food placement
is restricted to body-avoiding reachable free cells, still enumerated row-major
and using exactly one normal LCG step. States record `safeStart: true`, and
restart preserves it. False/omitted safeStart preserves classic placement and
state shape. Non-boolean values throw `RangeError`. Obstacles must be
an array of unique in-bounds integer cells, excluding the initial snake and its
first forward step. All non-obstacle cells must be connected. Invalid layouts
throw `RangeError`. Food excludes obstacles; collision with an obstacle ends the
game without moving the last valid board. Filling all non-obstacle cells ends
with null food. Caller-owned obstacles are copied, never frozen or mutated.
Opted-in states include deeply frozen `obstacles` and `difficulty` fields.
Omitting these options preserves the original classic state shape and PRNG results.

`getTickMs(state)` is a pure scheduling hint, not a timer. `tick` always advances
one cell. Speeds in milliseconds are:

| Difficulty | Initial | Reduction per 5 food | Minimum |
| --- | ---: | ---: | ---: |
| classic (default) | 150 | 0 | 150 |
| easy | 200 | 5 | 110 |
| normal | 150 | 8 | 70 |
| hard | 100 | 10 | 45 |

Progression is derived from score (floor(score / 5)), never elapsed time. Pause
and collisions do not change it; restart resets score/speed. Engine options are
explicit library opt-ins, independent of feature requests. The shell imports
neither engine nor challenges, and advertises challenges as unavailable even
under `all`; UI wiring remains a later integration increment. `board.mjs` is an
internal topology helper, not a public API.

## Other reserved boundaries

- `storage.mjs`: storage access, versioned serialization and validation, and safe
  failure handling. It may persist validated engine snapshots; the engine must
  never read browser storage. No keys, persistence schema, or functions implemented yet.
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
