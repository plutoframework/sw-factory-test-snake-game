import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, turn, tick, togglePause, restart } from '../game.mjs';
import { resolveFeatures } from '../features.mjs';

const copy = value => structuredClone(value);
function frozen(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(frozen);
    Object.freeze(value);
  }
  return value;
}
function fixture(overrides = {}) {
  return frozen({ ...newGame({ width: 6, height: 5, seed: 42 }), ...overrides });
}
function validFood(state) {
  assert.ok(state.food.x >= 0 && state.food.x < state.width);
  assert.ok(state.food.y >= 0 && state.food.y < state.height);
  assert.ok(!state.snake.some(cell => cell.x === state.food.x && cell.y === state.food.y));
}

test('new games have valid deterministic initial state and food', () => {
  const options = frozen({ width: 8, height: 6, seed: 123 });
  const game = newGame(options);
  assert.deepEqual(game, newGame(options));
  assert.equal(game.direction, 'right');
  assert.equal(game.status, 'running');
  assert.equal(game.score, 0);
  assert.equal(game.snake.length, 3);
  assert.deepEqual(game.snake, [{ x: 4, y: 3 }, { x: 3, y: 3 }, { x: 2, y: 3 }]);
  assert.deepEqual(game.food, { x: 4, y: 1 });
  assert.equal(game.rngState, 1218640798);
  for (let seed = 0; seed < 200; seed++) {
    for (const [width, height] of [[4, 1], [4, 2], [20, 20]]) {
      validFood(newGame({ width, height, seed }));
    }
  }
  assert.notDeepEqual(newGame({ seed: 1 }).food, newGame({ seed: 999 }).food);
});

test('invalid configuration fails explicitly', () => {
  for (const options of [{ width: 3 }, { height: 0 }, { width: 4.5 }, { width: NaN },
    { width: 1000001 }, { seed: -1 }, { seed: 2 ** 32 }, { seed: 1.5 }, { seed: '1' }]) {
    assert.throws(() => newGame(options), RangeError);
  }
});

test('movement uses direction, moves exactly one cell, and preserves length/score/PRNG', () => {
  const state = fixture({ food: { x: 0, y: 0 } });
  for (const [direction, head] of [['right', { x: 4, y: 2 }], ['up', { x: 3, y: 1 }], ['down', { x: 3, y: 3 }]]) {
    const result = tick(turn(state, direction));
    assert.deepEqual(result.snake, [head, ...state.snake.slice(0, -1)]);
    assert.equal(result.score, 0);
    assert.equal(result.rngState, state.rngState);
  }
  // A supplied state's direction, not the body's orientation, is authoritative.
  assert.deepEqual(tick(fixture({ direction: 'up' })).snake[0], { x: 3, y: 1 });
});

test('turn ignores reversal and invalid directions relative to current direction', () => {
  const state = fixture();
  for (const invalid of ['left', 'right', 'diagonal', 'toString', null, undefined]) {
    assert.deepEqual(turn(state, invalid), state);
  }
  const up = turn(state, 'up');
  assert.equal(turn(up, 'down').direction, 'up');
  assert.equal(turn(up, 'left').direction, 'left');
});

test('eating grows one, scores one, and deterministically selects free food', () => {
  const state = fixture({ food: { x: 4, y: 2 } });
  const result = tick(state);
  assert.deepEqual(result.snake, [{ x: 4, y: 2 }, ...state.snake]);
  assert.equal(result.score, 1);
  assert.notEqual(result.rngState, state.rngState);
  validFood(result);
  assert.deepEqual(result, tick(copy(state)));
});

test('all four walls and occupied body end game without advancing progress', () => {
  for (const [direction, head] of [['left', { x: 0, y: 2 }], ['right', { x: 5, y: 2 }],
    ['up', { x: 3, y: 0 }], ['down', { x: 3, y: 4 }]]) {
    const state = fixture({ direction, snake: [head, { x: 2, y: 2 }, { x: 1, y: 2 }] });
    assert.deepEqual(tick(state), { ...state, status: 'gameover' });
  }
  const body = fixture({ direction: 'left' });
  assert.deepEqual(tick(body), { ...body, status: 'gameover' });
});

test('movement into the vacated tail is legal, but not an occupied non-tail cell', () => {
  const state = fixture({
    snake: [{ x: 1, y: 1 }, { x: 1, y: 2 }, { x: 0, y: 2 }, { x: 0, y: 1 }],
    direction: 'left', food: { x: 5, y: 4 },
  });
  assert.equal(tick(state).status, 'running');
  assert.deepEqual(tick(state).snake, [{ x: 0, y: 1 }, ...state.snake.slice(0, -1)]);
  assert.equal(tick({ ...state, direction: 'down' }).status, 'gameover');
});

test('pause/resume, terminal freeze and deterministic restart', () => {
  const state = fixture();
  const paused = togglePause(state);
  assert.equal(paused.status, 'paused');
  assert.deepEqual(tick(paused), paused);
  assert.deepEqual(turn(paused, 'up'), paused);
  assert.deepEqual(togglePause(paused), state);
  const ended = fixture({ status: 'gameover', score: 17, food: null });
  assert.deepEqual(tick(ended), ended);
  assert.deepEqual(turn(ended, 'up'), ended);
  assert.deepEqual(togglePause(ended), ended);
  for (const prior of [paused, ended, tick(state)]) {
    assert.deepEqual(restart(prior), newGame({ width: 6, height: 5, seed: 42 }));
  }
});

test('filling a board completes without food search or further movement', () => {
  const state = newGame({ width: 4, height: 1, seed: 0 });
  assert.deepEqual(state.food, { x: 3, y: 0 });
  const full = tick(state);
  assert.equal(full.snake.length, 4);
  assert.equal(full.score, 1);
  assert.equal(full.food, null);
  assert.equal(full.status, 'gameover');
  assert.equal(full.rngState, state.rngState);
  assert.deepEqual(tick(full), full);
  assert.deepEqual(restart(full), state);
});

test('every operation preserves caller state and produces deeply frozen states', () => {
  const operations = [s => turn(s, 'up'), tick, togglePause, restart];
  for (const operation of operations) {
    const input = fixture({ food: { x: 4, y: 2 } });
    const before = copy(input);
    const result = operation(input);
    assert.deepEqual(input, before);
    assert.ok(Object.isFrozen(result));
    assert.ok(Object.isFrozen(result.snake));
    assert.ok(result.snake.every(Object.isFrozen));
    assert.ok(Object.isFrozen(result.food));
    // Mutable caller-owned snapshots are supported without freezing or aliasing them.
    const mutable = copy(input);
    const output = operation(mutable);
    assert.deepEqual(mutable, before);
    assert.equal(Object.isFrozen(mutable), false);
    mutable.snake[0].x = 999;
    mutable.food.x = 999;
    assert.notEqual(output.snake[0].x, 999);
    assert.notEqual(output.food.x, 999);
  }
});

test('engine results are independent of feature requests; completed gameplay defaults on', () => {
  assert.equal(resolveFeatures().gameplay, true);
  for (const profile of ['none', 'all']) {
    assert.equal(resolveFeatures(profile).gameplay, profile === 'all');
    const state = newGame({ seed: 10 });
    assert.deepEqual(tick(state), tick(newGame({ seed: 10 })));
  }
});
