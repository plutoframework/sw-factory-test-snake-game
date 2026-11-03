import test from 'node:test';
import assert from 'node:assert/strict';
import { createChallenge } from '../challenges.mjs';
import { newGame, tick, turn, restart, togglePause, getTickMs } from '../game.mjs';
import { resolveFeatures } from '../features.mjs';

const key = ({ x, y }) => `${x},${y}`;
function checkBoard(config) {
  const state = newGame(config);
  const blocked = new Set(config.obstacles.map(key));
  assert.equal(blocked.size, config.obstacles.length);
  for (const cell of [...state.snake, state.food]) assert.ok(!blocked.has(key(cell)));
  assert.equal(tick(state).snake[0].x, state.snake[0].x + 1,
    'first forward step must move safely (tiny boards may complete)');
  // Independent flood fill verifies every potential food cell is statically reachable.
  const reached = new Set([key(state.snake[0])]);
  const queue = [state.snake[0]];
  for (let i = 0; i < queue.length; i++) {
    const { x, y } = queue[i];
    for (const cell of [{ x: x - 1, y }, { x: x + 1, y }, { x, y: y - 1 }, { x, y: y + 1 }]) {
      if (cell.x < 0 || cell.y < 0 || cell.x >= state.width || cell.y >= state.height ||
          blocked.has(key(cell)) || reached.has(key(cell))) continue;
      reached.add(key(cell));
      queue.push(cell);
    }
  }
  assert.equal(reached.size + blocked.size, state.width * state.height);
}

test('seeded layouts are deterministic, safe, connected, and bounded even when saturated', () => {
  for (let seed = 0; seed < 40; seed++) {
    for (const [width, height] of [[4, 1], [4, 2], [12, 10]]) {
      for (const difficulty of ['easy', 'normal', 'hard']) {
        const options = Object.freeze({ width, height, seed, difficulty });
        const config = createChallenge(options);
        assert.deepEqual(config, createChallenge(options));
        checkBoard(config);
        checkBoard(createChallenge({ ...options, obstacleCount: width * height }));
      }
    }
  }
  checkBoard(createChallenge({ width: 64, height: 64, obstacleCount: 4096 }));
  assert.notDeepEqual(createChallenge({ seed: 1 }), createChallenge({ seed: 999 }));
});

test('configuration validation rejects unsafe or unbounded requests', () => {
  for (const options of [{ width: 3 }, { height: 0 }, { width: 4097 }, { seed: -1 },
    { seed: '1' }, { difficulty: 'classic' }, { difficulty: 'toString' },
    { obstacleCount: -1 }, { obstacleCount: 401 }, { obstacleCount: 0.5 }]) {
    assert.throws(() => createChallenge(options), RangeError);
  }
  for (const obstacles of [null, [{ x: -1, y: 0 }], [{ x: 10, y: 10 }],
    [{ x: 11, y: 10 }], [{ x: 0, y: 0 }, { x: 0, y: 0 }]]) {
    assert.throws(() => newGame({ obstacles }), RangeError);
  }
  assert.throws(() => newGame({ width: 8, height: 4,
    obstacles: Array.from({ length: 4 }, (_, y) => ({ x: 0, y }))
      .map(cell => ({ ...cell, x: 1 })) }), RangeError);
  assert.throws(() => newGame({ difficulty: 'fast' }), RangeError);
});

test('obstacle collision preserves last board, and food never occupies walls', () => {
  const initial = newGame({ width: 8, height: 6, seed: 1, obstacles: [{ x: 6, y: 3 }] });
  const moved = tick(initial);
  assert.deepEqual(tick(moved), { ...moved, status: 'gameover' });
  assert.deepEqual(restart(tick(moved)), initial);
  for (let seed = 0; seed < 100; seed++) {
    const state = newGame({ width: 8, height: 6, seed, obstacles: [{ x: 6, y: 3 }] });
    const eating = tick({ ...state, food: { x: 5, y: 3 } });
    assert.equal(eating.score, 1);
    assert.notEqual(key(eating.food), '6,3');
    assert.ok(!eating.snake.some(cell => key(cell) === key(eating.food)));
  }
  const full = tick(newGame({ width: 5, height: 1, obstacles: [{ x: 4, y: 0 }] }));
  assert.equal(full.food, null);
  assert.equal(full.status, 'gameover');
});

test('difficulty supplies bounded score progression without changing tick semantics', () => {
  for (const [difficulty, initial, atFive, minimum] of [
    ['easy', 200, 195, 110], ['normal', 150, 142, 70], ['hard', 100, 90, 45],
  ]) {
    const state = newGame({ difficulty });
    assert.equal(getTickMs(state), initial);
    assert.equal(getTickMs({ ...state, score: 4 }), initial);
    assert.equal(getTickMs({ ...state, score: 5 }), atFive);
    assert.equal(getTickMs({ ...state, score: 10000 }), minimum);
    assert.equal(tick(state).snake[0].x, state.snake[0].x + 1);
    assert.equal(getTickMs(togglePause(state)), initial);
    assert.deepEqual(restart({ ...state, score: 100 }), state);
  }
  assert.equal(getTickMs(newGame()), 150);
  assert.equal(getTickMs({ ...newGame(), score: 100 }), 150);
  assert.ok(createChallenge({ difficulty: 'hard' }).obstacles.length >
    createChallenge({ difficulty: 'easy' }).obstacles.length);
});

test('configuration/state immutability, restart and seed plus inputs replay identically', () => {
  const config = createChallenge({ seed: 812 });
  assert.ok(Object.isFrozen(config));
  assert.ok(Object.isFrozen(config.obstacles));
  assert.ok(config.obstacles.every(Object.isFrozen));
  let a = newGame(config);
  let b = newGame(structuredClone(config));
  for (const direction of ['right', 'up', 'left', 'down', 'right', 'up']) {
    a = tick(turn(a, direction));
    b = tick(turn(b, direction));
    assert.deepEqual(a, b);
    assert.deepEqual(restart(a), newGame(config));
  }
  const input = structuredClone(newGame(config));
  const before = structuredClone(input);
  const output = togglePause(input);
  assert.deepEqual(input, before);
  assert.equal(Object.isFrozen(input.obstacles), false);
  assert.ok(Object.isFrozen(output.obstacles));
  input.obstacles[0].x = -99;
  assert.notEqual(output.obstacles[0].x, -99);
});

test('flags never opt the classic engine into challenges', () => {
  assert.equal(resolveFeatures().challenges, false);
  for (const profile of ['none', 'all']) {
    assert.equal(resolveFeatures(profile).challenges, profile === 'all');
    assert.equal(newGame().obstacles, undefined);
    assert.deepEqual(newGame(), newGame({ difficulty: 'classic' }));
    checkBoard(createChallenge());
  }
});
