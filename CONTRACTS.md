# Module contracts

This increment is a static shell only. The following seams reserve later work;
`game.mjs`, `storage.mjs`, `challenges.mjs`, and `replay.mjs` deliberately do not
exist and must not be imported until their capability is independently complete.
There is no engine, game loop, playable board, persistence, or replay in this build.

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

## Engine (`game.mjs`, reserved)

Reserve named exports `newGame`, `turn`, `tick`, `togglePause`, and `restart`.
The engine will be pure JavaScript with no DOM, timers, networking, or storage.
Operations return immutable state without modifying earlier states or inputs.

The state contract includes:

- `snake`: head-first array of `{ x, y }` integer cells.
- `width`, `height`: board dimensions in cells; origin at top left, x right, y down.
- `direction`: one of `up`, `right`, `down`, `left`.
- `score`: numeric score.
- `status`: `running`, `paused`, or `gameover`.
- `food`: seeded, deterministic `{ x, y }` placement (or `null` when no free cell remains).
- Explicit PRNG seed/state sufficient to reproduce food placement without `Math.random`.

Intended call seams are `newGame(options)`, `turn(state, direction)`,
`tick(state)`, `togglePause(state)`, and `restart(state)`. Exact option defaults,
PRNG representation, scoring, collision rules, and invalid-input semantics belong
to the engine increment and its tests, not this shell. The browser adapter will
own input and scheduling, not the engine. Restart must remain deterministic from
the original configuration and seed.

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
